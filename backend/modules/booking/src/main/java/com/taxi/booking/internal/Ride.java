package com.taxi.booking.internal;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

/** One row of the rides table. */
record Ride(
        UUID id,
        UUID contactId,
        UUID driverId,
        UUID createdBy,
        String source,
        String status,
        OffsetDateTime pickupAt,
        String pickupAddress,
        double pickupLat,
        double pickupLng,
        String dropoffAddress,
        double dropoffLat,
        double dropoffLng,
        int distanceM,
        int durationS,
        int pickupAllowanceMin,
        int passengers,
        int luggage,
        int childSeats,
        String vehicle,
        boolean meetGreet,
        String travelRef,
        String customerNotes,
        String currency,
        boolean isFixedPrice,
        BigDecimal estimatedPrice,
        BigDecimal proposedPrice,
        BigDecimal agreedPrice,
        BigDecimal finalPrice,
        String finalPriceReason,
        OffsetDateTime answerDeadline,
        String cancelReason,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        String accessToken) {

    static final String COLUMNS = """
            id, contact_id, driver_id, created_by, source, status, pickup_at, pickup_address, pickup_lat, pickup_lng,
            dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, pickup_allowance_min, passengers,
            luggage, child_seats, vehicle, meet_greet, travel_ref, customer_notes, currency, is_fixed_price, estimated_price,
            proposed_price, agreed_price, final_price, final_price_reason, answer_deadline, cancel_reason,
            created_at, updated_at, access_token""";

    RideStatus rideStatus() {
        return RideStatus.of(status);
    }

    Instant pickup() {
        return pickupAt.toInstant();
    }

    /** When the ride itself ends, without the safety gap. */
    Instant endsAt() {
        return pickup().plusSeconds(durationS).plus(Duration.ofMinutes(pickupAllowanceMin));
    }
}
