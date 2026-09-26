package com.taxi.booking;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Published inside the transaction whenever a ride is created or changes status.
 * The notification module stores the notices and tells open screens to refresh.
 *
 * @param customerUserId the customer's account, or null for phone customers without an account
 * @param driverUserId   the driver's account, or null if the driver has none yet
 * @param notices        who to notify and with which message kind (see the app's texts)
 */
public record RideChanged(UUID rideId, UUID customerUserId, UUID driverUserId, List<Notice> notices) {

    public record Notice(UUID recipientId, String kind, Map<String, Object> payload) {}
}
