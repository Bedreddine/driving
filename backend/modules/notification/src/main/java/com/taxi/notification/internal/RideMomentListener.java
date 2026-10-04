package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.RideMomentReached;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Tells the customer about the driver's ride-day moments: in the app (and phone push) for account holders,
 * by browser push for guests who allowed it, by SMS when SMS is on, and by email only for "on the way"
 * (an email "arriving in 5 minutes" would be read too late).
 * Notice kinds: driver_on_the_way, driver_arriving, driver_arrived.
 */
@Component
class RideMomentListener {

    private final NotificationRepository repo;
    private final CustomerMessages customerMessages;
    private final Business business;
    private final LiveUpdates live;
    private final WebPushes webPushes;

    RideMomentListener(NotificationRepository repo, CustomerMessages customerMessages, Business business,
                       LiveUpdates live, WebPushes webPushes) {
        this.repo = repo;
        this.customerMessages = customerMessages;
        this.business = business;
        this.live = live;
        this.webPushes = webPushes;
    }

    static String kindOf(RideMomentReached e) {
        return "driver_" + e.kind();
    }

    /** Stored in the same transaction as the moment: no moment without its notices. */
    @EventListener
    void store(RideMomentReached e) {
        var kind = kindOf(e);
        if (e.customerUserId() != null) {
            repo.insert(e.customerUserId(), e.rideId(), kind, Map.of());
        }
        var c = e.customer();
        var info = business.info();
        if ("on_the_way".equals(e.kind()) && c.email() != null && !c.email().isBlank()) {
            var mail = CustomerTexts.email(kind, Map.of(), c, e.trip(), info);
            customerMessages.queueEmail(e.rideId(), c.email(), mail.subject(), mail.body());
        }
        if (c.phone() != null && !c.phone().isBlank()) {
            customerMessages.queueSms(e.rideId(), c.phone(), CustomerTexts.sms(kind, Map.of(), c, e.trip(), info));
        }
    }

    /** Only after the moment is saved: open screens reload, browsers get their push. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void afterCommit(RideMomentReached e) {
        live.ridesChanged(Stream.of(e.customerUserId(), e.driverUserId()).filter(Objects::nonNull).toList());
        var text = CustomerTexts.line(kindOf(e), Map.of(), e.customer().language(), e.trip());
        webPushes.send(e.rideId(), new WebPushes.Payload(business.info().name(), text,
                "/b/" + e.trip().accessToken(), "ride-" + e.rideId()));
    }
}
