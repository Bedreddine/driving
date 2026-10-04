package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.RideDirectory;
import com.taxi.booking.RideMomentReached;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

/**
 * Tells the customer about the driver's ride-day moments: in the app (and phone push) for account holders,
 * by browser push for guests who allowed it, by SMS when SMS is on, and by email only for "on the way"
 * (an email "arriving in 5 minutes" would be read too late).
 * Notice kinds: driver_on_the_way, driver_arriving, driver_arrived.
 * Called by {@link DomainEventConsumer} for each event read from Kafka (outbox + at-least-once + idempotency:
 * no moment without its notices, never twice).
 */
@Component
class RideMomentListener {

    private final NotificationRepository repo;
    private final CustomerMessages customerMessages;
    private final Business business;
    private final LiveUpdates live;
    private final WebPushes webPushes;
    private final RideDirectory rides;

    RideMomentListener(NotificationRepository repo, CustomerMessages customerMessages, Business business,
                       LiveUpdates live, WebPushes webPushes, RideDirectory rides) {
        this.repo = repo;
        this.customerMessages = customerMessages;
        this.business = business;
        this.live = live;
        this.webPushes = webPushes;
        this.rides = rides;
    }

    static String kindOf(RideMomentReached e) {
        return "driver_" + e.kind();
    }

    /** The customer can still be told: the ride exists and its customer was not erased meanwhile. */
    private boolean customerReachable(RideMomentReached e) {
        var ride = rides.find(List.of(e.rideId())).get(e.rideId());
        return ride != null && !ride.customerForgotten();
    }

    /** Inside the consumer's transaction. */
    void store(RideMomentReached e) {
        if (!customerReachable(e)) {
            return;
        }
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

    /** Once the notices are saved: open screens reload, browsers get their push. */
    void afterCommit(RideMomentReached e) {
        live.ridesChanged(Stream.of(e.customerUserId(), e.driverUserId()).filter(Objects::nonNull).toList());
        if (!customerReachable(e)) {
            return;
        }
        var text = CustomerTexts.line(kindOf(e), Map.of(), e.customer().language(), e.trip());
        webPushes.send(e.rideId(), new WebPushes.Payload(business.info().name(), text,
                "/b/" + e.trip().accessToken(), "ride-" + e.rideId()));
    }
}
