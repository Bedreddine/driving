package com.taxi.booking;

import java.time.Instant;
import java.util.UUID;

/**
 * Published inside the transaction when a ride-day moment is recorded for the first time (each kind once per ride).
 * The notification module tells the customer (app push, browser push, SMS, and an email for "on_the_way" only)
 * and refreshes the open screens.
 *
 * @param eventId        unique per event, so that consumers can ignore a delivery they already handled
 * @param kind           "on_the_way" (driver taps), "arriving" (automatic, about 5 minutes away) or "arrived"
 * @param customerUserId the customer's account, or null for guests and phone customers
 * @param driverUserId   the driver's account, or null
 */
public record RideMomentReached(UUID eventId, UUID rideId, String kind, Instant at, UUID customerUserId,
                                UUID driverUserId, RideChanged.Customer customer, RideChanged.Trip trip) {}
