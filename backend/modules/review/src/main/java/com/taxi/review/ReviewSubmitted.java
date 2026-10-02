package com.taxi.review;

import java.util.UUID;

/**
 * Published inside the transaction when a client leaves a new review (not on later edits):
 * the notification module tells the owner there is a review to moderate.
 */
public record ReviewSubmitted(UUID reviewId, UUID rideId, int rating) {}
