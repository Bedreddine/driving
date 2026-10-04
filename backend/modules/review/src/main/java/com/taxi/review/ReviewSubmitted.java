package com.taxi.review;

import com.taxi.booking.EventTopics;
import java.util.UUID;
import org.springframework.modulith.events.Externalized;

/**
 * Published inside the transaction when a client leaves a new review (not on later edits):
 * the notification module tells the owner there is a review to moderate. Sent to Kafka with the ride's events
 * (keyed by ride).
 *
 * @param eventId unique per event, so that consumers can ignore a delivery they already handled
 */
@Externalized(EventTopics.RIDE_EVENTS + "::#{rideId()}")
public record ReviewSubmitted(UUID eventId, UUID reviewId, UUID rideId, int rating) {}
