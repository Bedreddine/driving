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

    Notices(ApplicationEventPublisher events, ContactRepository contacts, DriverRepository drivers) {
        this.events = events;
        this.contacts = contacts;
        this.drivers = drivers;
    }

    Change about(UUID rideId, UUID contactId, UUID driverId) {
        var customer = contacts.find(contactId).map(ContactRepository.Contact::userId).orElse(null);
        var driver = drivers.find(driverId).map(DriverRepository.Driver::userId).orElse(null);
        return new Change(rideId, customer, driver);
    }

    Change about(Ride ride) {
        return about(ride.id(), ride.contactId(), ride.driverId());
    }

    final class Change {
        private final UUID rideId;
        private final UUID customer;
        private final UUID driver;
        private final List<Notice> notices = new ArrayList<>();

        private Change(UUID rideId, UUID customer, UUID driver) {
            this.rideId = rideId;
            this.customer = customer;
            this.driver = driver;
        }

        Change tellCustomer(String kind) {
            return tellCustomer(kind, Map.of());
        }

        Change tellCustomer(String kind, Map<String, Object> payload) {
            if (customer != null) {
                notices.add(new Notice(customer, kind, payload));
            }
            return this;
        }

        Change tellDriver(String kind) {
            if (driver != null) {
                notices.add(new Notice(driver, kind, Map.of()));
            }
            return this;
        }

        /** Publishes even without notices, so open screens still refresh. */
        void publish() {
            events.publishEvent(new RideChanged(rideId, customer, driver, List.copyOf(notices)));
        }
    }
}
