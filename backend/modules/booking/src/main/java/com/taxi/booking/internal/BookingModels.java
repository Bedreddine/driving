package com.taxi.booking.internal;

import com.taxi.pricing.Estimate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Request and response shapes of the booking API (JSON uses snake_case). */
final class BookingModels {

    private BookingModels() {}

    record Place(@NotNull @Min(-90) @Max(90) Double lat, @NotNull @Min(-180) @Max(180) Double lng,
                 @NotBlank @Size(max = 300) String address) {}

    /** A booking: mode "request" (customer) or "quick_add" (driver, for phone / WhatsApp customers). */
    record RideInput(
            @Pattern(regexp = "request|quick_add") String mode,
            UUID contactId,
            @Pattern(regexp = "phone|whatsapp|in_person|other") String source,
            @NotNull Instant pickupAt,
            @NotNull @Valid Place pickup,
            @NotNull @Valid Place dropoff,
            @Min(1) @Max(50) Integer passengers,
            @Min(0) @Max(50) Integer luggage,
            @Pattern(regexp = "sedan|van") String vehicle,
            Boolean meetGreet,
            @Min(0) @Max(3) Integer childSeats,
            @Size(max = 500) String travelRef,
            @Size(max = 500) String customerNotes,
            @DecimalMin("0") BigDecimal agreedPrice) {

        boolean quickAdd() {
            return "quick_add".equals(mode);
        }
    }

    /** dry_run and override are optional (missing = false). */
    record BookingRequest(@NotNull @Valid RideInput ride, Boolean dryRun, Boolean override) {

        boolean isDryRun() {
            return Boolean.TRUE.equals(dryRun);
        }

        boolean isOverride() {
            return Boolean.TRUE.equals(override);
        }
    }

    /**
     * @param route     the road for the map as [lng, lat] points (at most 400), or null when the map server did not
     *                  answer and distance and time are estimates
     * @param breakdown how the estimate is made (lines adding up to it), or null when there is no estimate
     */
    record BookingResult(
            boolean ok,
            UUID rideId,
            boolean dryRun,
            BigDecimal estimate,
            String currency,
            Boolean isFixed,
            String licence,
            Integer pickupAllowanceMin,
            List<String> errors,
            List<String> warnings,
            boolean needsOverride,
            UUID clashRideId,
            Integer distanceM,
            Integer durationS,
            boolean routeEstimated,
            String accessToken,
            List<double[]> route,
            List<Estimate.Line> breakdown) {}
}
