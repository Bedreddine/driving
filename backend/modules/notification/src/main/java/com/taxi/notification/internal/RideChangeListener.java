package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.RideChanged;
import com.taxi.booking.RideDirectory;
import com.taxi.identity.UserDirectory;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Who is told about a ride change. Called by {@link DomainEventConsumer} for each {@link RideChanged} read from Kafka.
 * <p>
 * "No ride change without its notifications" still holds, in another way than before: the event is saved in the
 * booking's own transaction (outbox, table event_publication), sent to Kafka until the broker has it, delivered at
 * least once, and {@link #store} runs in one database transaction with the "already processed" mark
 * (processed_events): a redelivery changes nothing.
 */
@Component
class RideChangeListener {

    private final NotificationRepository repo;
    private final CustomerMessages customerMessages;
    private final Business business;
    private final LiveUpdates live;
    private final UserDirectory users;
    private final RideDirectory rides;

    RideChangeListener(NotificationRepository repo, CustomerMessages customerMessages, Business business,
                       LiveUpdates live, UserDirectory users, RideDirectory rides) {
        this.repo = repo;
        this.customerMessages = customerMessages;
        this.business = business;
        this.live = live;
        this.users = users;
        this.rides = rides;
    }

    /**
     * In the app (and phone push) for people with an account; by email / SMS for every customer.
     * Runs inside the consumer's transaction. A customer erased since the change (GDPR, the event was waiting in
     * Kafka) is not written to any more; the driver's notices still go.
     */
    void store(RideChanged e) {
        var ride = rides.find(List.of(e.rideId())).get(e.rideId());
        if (ride == null) {
            return; // ride deleted meanwhile: nobody to tell
        }
        Business.Info info = null;
        for (var n : e.notices()) {
            if (n.toCustomer() && ride.customerForgotten()) {
                continue;
            }
            if (n.recipientId() != null) {
                repo.insert(n.recipientId(), e.rideId(), n.kind(), n.payload());
            }
            if (n.toCustomer() && CustomerTexts.KINDS.contains(n.kind())) {
                info = info == null ? business.info() : info;
                var c = e.customer();
                if (c.email() != null && !c.email().isBlank()) {
                    var mail = CustomerTexts.email(n.kind(), n.payload(), c, e.trip(), info);
                    customerMessages.queueEmail(e.rideId(), c.email(), mail.subject(), mail.body());
                }
                if (c.phone() != null && !c.phone().isBlank()) {
                    customerMessages.queueSms(e.rideId(), c.phone(), CustomerTexts.sms(n.kind(), n.payload(), c, e.trip(), info));
                }
            }
        }
    }

    /** Once the notices are saved, tell the open screens of the customer, the driver and admins to reload. */
    void afterCommit(RideChanged e) {
        var targets = new ArrayList<>(users.adminIds());
        targets.add(e.customerUserId());
        targets.add(e.driverUserId());
        live.ridesChanged(targets.stream().filter(Objects::nonNull).toList());
    }
}
