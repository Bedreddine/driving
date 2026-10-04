package com.taxi.booking;

import java.time.Instant;
import java.util.UUID;
import org.springframework.modulith.events.Externalized;

/**
 * Published inside the transaction when the driver or the client of a ride writes a message.
 * The notification module tells the other side (never by email). Sent to Kafka like {@link RideChanged}.
 *
 * @param eventId           unique per event, so that consumers can ignore a delivery they already handled
 * @param from              "driver" or "client"
 * @param customerUserId    the customer's account, or null for guests and phone customers
 * @param driverUserId      the driver's account, or null
 * @param customerFirstName first name typed in the booking (guests) or of the customer on file
 * @param customerLanguage  "fr" or "en"
 * @param accessToken       private link token of the ride (/b/{token})
 */
@Externalized(EventTopics.RIDE_EVENTS + "::#{rideId()}")
public record RideMessagePosted(UUID eventId, UUID rideId, UUID messageId, String from, String body, Instant at,
                                UUID customerUserId, UUID driverUserId, String customerFirstName,
                                String customerLanguage, String accessToken) {}
