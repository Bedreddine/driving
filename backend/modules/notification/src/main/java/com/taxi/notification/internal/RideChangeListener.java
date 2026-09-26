package com.taxi.notification.internal;

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
    private final LiveUpdates live;
    private final UserDirectory users;

    RideChangeListener(NotificationRepository repo, LiveUpdates live, UserDirectory users) {
        this.repo = repo;
        this.live = live;
        this.users = users;
    }

    /** Stored in the same transaction as the ride change: no change without its notification. */
    @EventListener
    void store(RideChanged e) {
        for (var n : e.notices()) {
            repo.insert(n.recipientId(), e.rideId(), n.kind(), n.payload());
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
