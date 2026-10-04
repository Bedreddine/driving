package com.taxi.booking.internal;

import com.taxi.identity.CurrentUser;
import org.springframework.stereotype.Component;

/** Who the signed-in user is for one ride: its driver (or an admin), or its customer. */
@Component
class RideAccess {

    private final CurrentUser currentUser;
    private final DriverRepository drivers;
    private final ContactRepository contacts;

    RideAccess(CurrentUser currentUser, DriverRepository drivers, ContactRepository contacts) {
        this.currentUser = currentUser;
        this.drivers = drivers;
        this.contacts = contacts;
    }

    /** The ride's own driver, or an admin. */
    boolean isDriverOrAdmin(Ride ride) {
        if (currentUser.isAdmin()) {
            return true;
        }
        var me = currentUser.id();
        return currentUser.isStaff() && drivers.find(ride.driverId()).map(d -> me.equals(d.userId())).orElse(false);
    }

    /** The customer of the ride, signed in with their account. */
    boolean isCustomer(Ride ride) {
        var me = currentUser.idIfSignedIn().orElse(null);
        return me != null && contacts.find(ride.contactId()).map(c -> me.equals(c.userId())).orElse(false);
    }
}
