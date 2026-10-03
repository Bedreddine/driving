package com.taxi.booking.internal;

import com.taxi.booking.RideDirectory;
import com.taxi.booking.RideReviews;
import com.taxi.booking.internal.BookingModels.BookingResult;
import com.taxi.booking.internal.BookingModels.RideInput;
import com.taxi.pricing.Pricing;
import com.taxi.shared.ApiException;
import com.taxi.shared.RateLimiter;
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
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    /** client is needed to book for real; a price check (dry_run) works without it. */
    record GuestBooking(@Valid Client client, @NotNull @Valid RideInput ride, Boolean dryRun) {}

    record Answer(@NotNull Boolean accept) {}

    /**
     * What the guest sees on the private link: no internal ids, no driver notes.
     *
     * @param canReview true once the ride is completed, while the review is not moderated yet
     * @param review    the client's review of this ride, or null
     * @param route     the road for the map as [lng, lat] points, or null when not known
     */
    record PublicRide(String status, OffsetDateTime pickupAt, String pickupAddress, String dropoffAddress,
                      Point pickup, Point dropoff,
                      int passengers, int luggage, int childSeats, String vehicle, boolean meetGreet, String travelRef,
                      String customerNotes, int distanceM, int durationS, String currency, boolean isFixedPrice,
                      BigDecimal estimatedPrice, BigDecimal proposedPrice, BigDecimal agreedPrice,
                      BigDecimal finalPrice, OffsetDateTime answerDeadline, String cancelReason, String clientName,
                      boolean canReview, RideReviews.Review review, List<double[]> route) {}

    record Point(double lat, double lng) {}

    private static final Duration HOUR = Duration.ofHours(1);

    private final BookingService booking;
    private final RideLifecycle lifecycle;
    private final RideRepository rides;
    private final ContactRepository contacts;
    private final DriverRepository drivers;
    private final Pricing pricing;
    private final RideReviews reviews;
    private final RateLimiter limiter;
    private final int maxBookings;
    private final int maxQuotes;
    private final DriverTracking tracking;
    private final int maxTracking;
    private final int maxRidePage;

    PublicBookingController(BookingService booking, RideLifecycle lifecycle, RideRepository rides,
                            ContactRepository contacts, DriverRepository drivers, Pricing pricing, RideReviews reviews,
                            RateLimiter limiter,
                            @Value("${taxi.public.max-bookings-per-hour:10}") int maxBookings,
                            @Value("${taxi.public.max-quotes-per-hour:60}") int maxQuotes,
                            DriverTracking tracking,
                            @Value("${taxi.public.max-tracking-per-minute:60}") int maxTracking,
                            @Value("${taxi.public.max-ride-page-per-hour:600}") int maxRidePage) {
        this.maxRidePage = maxRidePage;
        this.booking = booking;
        this.lifecycle = lifecycle;
        this.rides = rides;
        this.contacts = contacts;
        this.drivers = drivers;
        this.pricing = pricing;
        this.reviews = reviews;
        this.limiter = limiter;
        this.maxBookings = maxBookings;
        this.maxQuotes = maxQuotes;
        this.tracking = tracking;
        this.maxTracking = maxTracking;
    }

    /**
     * Vehicle capacity, phone for short-notice calls, licence (VTC shows a price, taxi an estimate), and the prices
     * of the options (meet & greet, child seats, extra luggage, waiting).
     */
    @GetMapping("/api/public/driver")
    DriverController.DriverInfo driver() {
        var d = drivers.defaultDriver().orElseThrow(() -> ApiException.badRequest("NO_DRIVER"));
        var policy = pricing.policy(d.id());
        return new DriverController.DriverInfo(d.id(), d.displayName(), d.phone(), d.seats(), d.luggage(), d.vehicle(),
                d.timezone(), policy.licence().value(), policy.currency(), pricing.extras(d.id()));
    }

    /** Price check (dry_run) or real booking request. */
    @PostMapping("/api/public/bookings")
    BookingResult book(@RequestBody @Valid GuestBooking body, HttpServletRequest request) {
        var dryRun = Boolean.TRUE.equals(body.dryRun());
        var ip = RateLimiter.visitor(request);
        var allowed = dryRun ? limiter.allow("quote:" + ip, maxQuotes, HOUR) : limiter.allow("book:" + ip, maxBookings, HOUR);
        if (!allowed) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
        var c = body.client();
        if (c == null && !dryRun) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        var guest = c == null ? null : new BookingService.Guest(c.fullName().trim(), c.phone().trim(),
                c.email().trim(), "en".equals(c.language()) ? "en" : "fr");
        return booking.bookAsGuest(guest, body.ride(), dryRun);
    }

    @GetMapping("/api/public/bookings/{token}")
    PublicRide get(@PathVariable String token, HttpServletRequest request) {
        limitRidePage(request);
        var r = ride(token);
        // Only what was typed in this booking: the link must not reveal what the driver has on file for a matched
        // contact. Rides without a typed name (older guest rides, phone and account rides) show none.
        var clientName = r.guestName();
        var reviewing = reviews.of(new RideDirectory.RideFacts(r.id(), r.status(), r.pickupAt(), clientName,
                contacts.isAnonymized(r.contactId())));
        return new PublicRide(r.status(), r.pickupAt(), r.pickupAddress(), r.dropoffAddress(),
                new Point(r.pickupLat(), r.pickupLng()), new Point(r.dropoffLat(), r.dropoffLng()), r.passengers(),
                r.luggage(), r.childSeats(), r.vehicle(), r.meetGreet(), r.travelRef(), r.customerNotes(), r.distanceM(),
                r.durationS(), r.currency(), r.isFixedPrice(), r.estimatedPrice(), r.proposedPrice(),
                r.agreedPrice(), r.finalPrice(), r.answerDeadline(), r.cancelReason(), clientName,
                reviewing.canReview(), reviewing.review(), rides.route(r.id()));
    }

    /** Where the driver is (the page polls every few seconds); 204 when it must not or cannot be shown. */
    @GetMapping("/api/public/bookings/{token}/driver")
    ResponseEntity<DriverTracking.DriverLocation> driverLocation(@PathVariable String token, HttpServletRequest request) {
        if (!limiter.allow("track:" + RateLimiter.visitor(request), maxTracking, Duration.ofMinutes(1))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
        var r = ride(token);
        return tracking.forRide(r).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/api/public/bookings/{token}/respond")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void respond(@PathVariable String token, @RequestBody @Valid Answer body, HttpServletRequest request) {
        limitRidePage(request);
        lifecycle.respondAsGuest(token, body.accept());
    }

    @PostMapping("/api/public/bookings/{token}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String token, HttpServletRequest request) {
        limitRidePage(request);
        lifecycle.cancelAsGuest(token);
    }

    /**
     * The private link is the only key to a guest's ride: 192 random bits, so it cannot be guessed, and lookups are
     * limited per visitor anyway (the page reloads every 30 s). Unknown and malformed tokens get the same 404.
     */
    private void limitRidePage(HttpServletRequest request) {
        if (!limiter.allow("ride-page:" + RateLimiter.visitor(request), maxRidePage, HOUR)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
    }

    private Ride ride(String token) {
        if (token == null || token.length() < 32 || token.length() > 128) {
            throw ApiException.notFound();
        }
        return rides.byAccessToken(token).orElseThrow(ApiException::notFound);
    }
}
