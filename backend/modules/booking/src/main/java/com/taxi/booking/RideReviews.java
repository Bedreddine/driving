package com.taxi.booking;

/**
 * The client's review of a ride, shown on the private ride page /b/{token}.
 * Implemented by the review module (which owns the rules: who may review, and until when).
 */
public interface RideReviews {

    Reviewing of(RideDirectory.RideFacts ride);

    /** @param review null until the client wrote one */
    record Reviewing(boolean canReview, Review review) {}

    /** @param status pending (still editable by the client), approved or hidden (moderated by the owner) */
    record Review(int rating, String comment, boolean showPublicly, String city, String status) {}
}
