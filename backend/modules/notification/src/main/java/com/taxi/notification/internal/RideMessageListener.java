package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.CustomerForgotten;
import com.taxi.booking.RideMessagePosted;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Tells the other side of a ride's conversation about a new message (never by email):
 * client to driver: notice "ride_message" in the driver's app (and phone push) and a live "ride-message";
 * driver to client: browser push for guests who allowed it, and the notice in the app for account holders.
 * The notice holds the first 80 characters: deleted with the customer (CustomerForgotten) and after 90 days.
 */
@Component
class RideMessageListener {

    static final int PREVIEW = 80;

    private final NotificationRepository repo;
    private final Business business;
    private final LiveUpdates live;
    private final WebPushes webPushes;

    RideMessageListener(NotificationRepository repo, Business business, LiveUpdates live, WebPushes webPushes) {
        this.repo = repo;
        this.business = business;
        this.live = live;
        this.webPushes = webPushes;
    }

    /** Stored in the same transaction as the message. */
    @EventListener
    void store(RideMessagePosted e) {
        var toDriver = "client".equals(e.from());
        var recipient = toDriver ? e.driverUserId() : e.customerUserId();
        if (recipient == null) {
            return;
        }
        var payload = new HashMap<String, Object>();
        payload.put("from", e.from());
        if (toDriver && e.customerFirstName() != null) {
            payload.put("from_name", e.customerFirstName());
        }
        payload.put("preview", preview(e.body()));
        repo.insert(recipient, e.rideId(), "ride_message", payload);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void afterCommit(RideMessagePosted e) {
        var toDriver = "client".equals(e.from());
        var recipient = toDriver ? e.driverUserId() : e.customerUserId();
        if (recipient != null) {
            live.rideMessage(List.of(recipient), e.rideId());
        }
        if (!toDriver) {
            var text = Messages.text("ride_message", e.customerLanguage(),
                    Map.of("from", "driver", "preview", preview(e.body())));
            webPushes.send(e.rideId(), new WebPushes.Payload(business.info().name(), text, "/b/" + e.accessToken(),
                    "ride-" + e.rideId()));
        }
    }

    /** An erased customer: the notices quoting their conversation go too (same transaction). */
    @EventListener
    void on(CustomerForgotten e) {
        repo.deleteMessageNotices(e.rideIds());
    }

    static String preview(String body) {
        if (body.length() <= PREVIEW) {
            return body;
        }
        int end = Character.isHighSurrogate(body.charAt(PREVIEW - 1)) ? PREVIEW - 1 : PREVIEW;
        return body.substring(0, end);
    }
}
