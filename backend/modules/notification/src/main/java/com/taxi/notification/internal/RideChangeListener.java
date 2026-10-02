package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.RideChanged;
import com.taxi.identity.UserDirectory;
import java.util.ArrayList;
import java.util.Objects;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class RideChangeListener {

    private final NotificationRepository repo;
    private final CustomerMessages customerMessages;
    private final Business business;
    private final LiveUpdates live;
    private final UserDirectory users;

    RideChangeListener(NotificationRepository repo, CustomerMessages customerMessages, Business business,
                       LiveUpdates live, UserDirectory users) {
        this.repo = repo;
        this.customerMessages = customerMessages;
        this.business = business;
        this.live = live;
        this.users = users;
    }

    /**
     * Stored in the same transaction as the ride change: no change without its notifications.
     * In the app (and phone push) for people with an account; by email / SMS for every customer.
     */
    @EventListener
    void store(RideChanged e) {
        Business.Info info = null;
        for (var n : e.notices()) {
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

    /** Only after the change is saved, tell the open screens of the customer, the driver and admins to reload. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void refreshScreens(RideChanged e) {
        var targets = new ArrayList<>(users.adminIds());
        targets.add(e.customerUserId());
        targets.add(e.driverUserId());
        live.ridesChanged(targets.stream().filter(Objects::nonNull).toList());
    }
}
