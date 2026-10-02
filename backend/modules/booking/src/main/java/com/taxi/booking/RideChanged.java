package com.taxi.booking;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Published inside the transaction whenever a ride is created or changes status.
 * The notification module stores the notices, emails / texts the customer, and tells open screens to refresh.
 *
 * @param customerUserId the customer's account, or null for guests and phone customers
 * @param driverUserId   the driver's account, or null if the driver has none yet
 */
public record RideChanged(UUID rideId, UUID customerUserId, UUID driverUserId, List<Notice> notices,
                          Customer customer, Trip trip) {

    /**
     * @param recipientId account to notify in the app, or null (customer without account: email / SMS only)
     * @param toCustomer  true when addressed to the customer (also sent by email / SMS)
     */
    public record Notice(UUID recipientId, String kind, Map<String, Object> payload, boolean toCustomer) {}

    /** How to reach the customer outside the app. */
    public record Customer(String fullName, String email, String phone, String language) {}

    /** What the customer needs to recognise the ride, and the private link token to follow it. */
    public record Trip(Instant pickupAt, String pickupAddress, String dropoffAddress, String currency,
                       String accessToken) {}
}
