package com.taxi.booking.internal;

import com.taxi.booking.RideChanged;
import com.taxi.booking.RideChanged.Notice;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Publishes {@link RideChanged}: who is told about a ride change, and with which message.
 * <pre>notices.about(ride).tellCustomer("ride_accepted").publish();</pre>
 */
@Component
class Notices {

    private final ApplicationEventPublisher events;
    private final ContactRepository contacts;
    private final DriverRepository drivers;
    private final RideRepository rides;

    Notices(ApplicationEventPublisher events, ContactRepository contacts, DriverRepository drivers, RideRepository rides) {
        this.events = events;
        this.contacts = contacts;
        this.drivers = drivers;
        this.rides = rides;
    }

    Change about(UUID rideId) {
        return about(rides.find(rideId).orElseThrow());
    }

    Change about(Ride ride) {
        var contact = contacts.find(ride.contactId()).orElseThrow();
        var driverRow = drivers.find(ride.driverId());
        var driver = driverRow.map(DriverRepository.Driver::userId).orElse(null);
        var timezone = driverRow.map(DriverRepository.Driver::timezone).orElse("Europe/Paris");
        // Guest rides: greet with the name and language typed in this booking, not the matched contact's.
        var customer = new RideChanged.Customer(
                ride.guestName() != null ? ride.guestName() : contact.fullName(), contact.email(), contact.phone(),
                ride.guestLanguage() != null ? ride.guestLanguage() : contact.language());
        var trip = new RideChanged.Trip(ride.pickup(), ride.pickupAddress(), ride.dropoffAddress(), ride.currency(),
                ride.accessToken(), timezone);
        return new Change(ride.id(), contact.userId(), driver, customer, trip);
    }

    final class Change {
        private final UUID rideId;
        private final UUID customerUser;
        private final UUID driverUser;
        private final RideChanged.Customer customer;
        private final RideChanged.Trip trip;
        private final List<Notice> notices = new ArrayList<>();

        private Change(UUID rideId, UUID customerUser, UUID driverUser, RideChanged.Customer customer,
                       RideChanged.Trip trip) {
            this.rideId = rideId;
            this.customerUser = customerUser;
            this.driverUser = driverUser;
            this.customer = customer;
            this.trip = trip;
        }

        UUID customerUser() {
            return customerUser;
        }

        UUID driverUser() {
            return driverUser;
        }

        RideChanged.Customer customer() {
            return customer;
        }

        RideChanged.Trip trip() {
            return trip;
        }

        Change tellCustomer(String kind) {
            return tellCustomer(kind, Map.of());
        }

        /** In the app if the customer has an account; by email / SMS in every case. */
        Change tellCustomer(String kind, Map<String, Object> payload) {
            notices.add(new Notice(customerUser, kind, payload, true));
            return this;
        }

        Change tellDriver(String kind) {
            if (driverUser != null) {
                notices.add(new Notice(driverUser, kind, Map.of(), false));
            }
            return this;
        }

        /** Publishes even without notices, so open screens still refresh. */
        void publish() {
            events.publishEvent(new RideChanged(rideId, customerUser, driverUser, List.copyOf(notices), customer, trip));
        }
    }
}
