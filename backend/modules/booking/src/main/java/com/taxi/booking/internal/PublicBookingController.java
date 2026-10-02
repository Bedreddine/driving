package com.taxi.booking.internal;

import com.taxi.booking.internal.BookingModels.BookingResult;
import com.taxi.booking.internal.BookingModels.RideInput;
import com.taxi.pricing.Pricing;
import com.taxi.shared.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public booking website (business-card QR code): no account needed.
 * A guest gives name, phone and email, books, and follows the ride through its private link /b/{token}.
 */
@RestController
class PublicBookingController {

    /** Phone in international or French format: digits, spaces, dots, dashes, optional leading +. */
    record Client(@NotBlank @Size(max = 120) String fullName,
                  @NotBlank @Size(max = 30) @Pattern(regexp = "^\\+?[0-9 .\\-()]{6,30}$") String phone,
                  @NotBlank @Email @Size(max = 200) String email,
                  @Pattern(regexp = "fr|en") String language) {}

    record GuestBooking(@NotNull @Valid Client client, @NotNull @Valid RideInput ride, Boolean dryRun) {}

    record Answer(@NotNull Boolean accept) {}

    /** What the guest sees on the private link: no internal ids, no driver notes. */
    record PublicRide(String status, OffsetDateTime pickupAt, String pickupAddress, String dropoffAddress,
                      int passengers, int luggage, String vehicle, boolean meetGreet, String travelRef,
                      String customerNotes, int distanceM, int durationS, String currency, boolean isFixedPrice,
                      BigDecimal estimatedPrice, BigDecimal proposedPrice, BigDecimal agreedPrice,
                      BigDecimal finalPrice, OffsetDateTime answerDeadline, String cancelReason, String clientName) {}

    private static final Duration HOUR = Duration.ofHours(1);

    private final BookingService booking;
    private final RideLifecycle lifecycle;
    private final RideRepository rides;
    private final ContactRepository contacts;
    private final DriverRepository drivers;
    private final Pricing pricing;
    private final RateLimiter limiter;
    private final int maxBookings;
    private final int maxQuotes;

    PublicBookingController(BookingService booking, RideLifecycle lifecycle, RideRepository rides,
                            ContactRepository contacts, DriverRepository drivers, Pricing pricing, RateLimiter limiter,
                            @Value("${taxi.public.max-bookings-per-hour:10}") int maxBookings,
                            @Value("${taxi.public.max-quotes-per-hour:60}") int maxQuotes) {
        this.booking = booking;
        this.lifecycle = lifecycle;
        this.rides = rides;
        this.contacts = contacts;
        this.drivers = drivers;
        this.pricing = pricing;
        this.limiter = limiter;
        this.maxBookings = maxBookings;
        this.maxQuotes = maxQuotes;
    }

    /** Vehicle capacity, phone for short-notice calls, licence (VTC shows a price, taxi an estimate). */
    @GetMapping("/api/public/driver")
    DriverController.DriverInfo driver() {
        var d = drivers.defaultDriver().orElseThrow(() -> ApiException.badRequest("NO_DRIVER"));
        var policy = pricing.policy(d.id());
        return new DriverController.DriverInfo(d.id(), d.displayName(), d.phone(), d.seats(), d.luggage(), d.vehicle(),
                d.timezone(), policy.licence().value(), policy.currency());
    }

    /** Price check (dry_run) or real booking request. */
    @PostMapping("/api/public/bookings")
    BookingResult book(@RequestBody @Valid GuestBooking body, HttpServletRequest request) {
        var dryRun = Boolean.TRUE.equals(body.dryRun());
        var ip = request.getRemoteAddr();
        var allowed = dryRun ? limiter.allow("quote:" + ip, maxQuotes, HOUR) : limiter.allow("book:" + ip, maxBookings, HOUR);
        if (!allowed) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
        var c = body.client();
        var guest = new BookingService.Guest(c.fullName().trim(), c.phone().trim(), c.email().trim(),
                "en".equals(c.language()) ? "en" : "fr");
        return booking.bookAsGuest(guest, body.ride(), dryRun);
    }

    @GetMapping("/api/public/bookings/{token}")
    PublicRide get(@PathVariable String token) {
        var r = rides.byAccessToken(token).orElseThrow(ApiException::notFound);
        var clientName = contacts.find(r.contactId()).map(ContactRepository.Contact::fullName).orElse(null);
        return new PublicRide(r.status(), r.pickupAt(), r.pickupAddress(), r.dropoffAddress(), r.passengers(),
                r.luggage(), r.vehicle(), r.meetGreet(), r.travelRef(), r.customerNotes(), r.distanceM(),
                r.durationS(), r.currency(), r.isFixedPrice(), r.estimatedPrice(), r.proposedPrice(),
                r.agreedPrice(), r.finalPrice(), r.answerDeadline(), r.cancelReason(), clientName);
    }

    @PostMapping("/api/public/bookings/{token}/respond")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void respond(@PathVariable String token, @RequestBody @Valid Answer body) {
        lifecycle.respondAsGuest(token, body.accept());
    }

    @PostMapping("/api/public/bookings/{token}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String token) {
        lifecycle.cancelAsGuest(token);
    }
}
