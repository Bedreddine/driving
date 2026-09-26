package com.taxi.booking.internal;

import com.taxi.identity.IdentityEvents.OwnerAssigned;
import com.taxi.identity.IdentityEvents.UserDeleting;
import com.taxi.identity.IdentityEvents.UserRegistered;
import com.taxi.pricing.Pricing;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Reacts to account changes inside the same transaction (a failure here undoes the account change too).
 */
@Component
class AccountListener {

    private final ContactRepository contacts;
    private final DriverRepository drivers;
    private final RideLifecycle lifecycle;
    private final Pricing pricing;

    AccountListener(ContactRepository contacts, DriverRepository drivers, RideLifecycle lifecycle, Pricing pricing) {
        this.contacts = contacts;
        this.drivers = drivers;
        this.lifecycle = lifecycle;
        this.pricing = pricing;
    }

    /** Every new account gets a customer contact, so its rides have someone to belong to. */
    @EventListener
    void on(UserRegistered e) {
        contacts.insert(e.userId(), e.fullName(), e.phone(), e.email(), true, e.userId());
    }

    @EventListener
    void on(UserDeleting e) {
        lifecycle.forgetCustomer(e.userId());
    }

    /** The owner drives the first driver record, created if there is none yet. */
    @EventListener
    void on(OwnerAssigned e) {
        var driver = drivers.defaultDriver();
        if (driver.isPresent()) {
            drivers.linkUser(driver.get().id(), e.userId());
            pricing.ensureSettings(driver.get().id());
        } else {
            var id = drivers.insert(e.displayName() == null || e.displayName().isBlank() ? "Taxi" : e.displayName(), e.userId());
            pricing.ensureSettings(id);
        }
    }
}
