package com.taxi.booking.internal;

import com.taxi.shared.ApiException;
import com.taxi.shared.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The day of the ride: the driver's moments ("on the way", "arrived") and messages between driver and client.
 * Staff use the ride id; the client uses the private link token (no account needed).
 */
@RestController
class RideDayController {

    record MomentBody(String kind) {}

    record MessageBody(String body) {}

    private static final Duration HOUR = Duration.ofHours(1);
    private static final Duration MESSAGE_WINDOW = Duration.ofMinutes(10);

    private final RideMoments moments;
    private final RideMessages messages;
    private final RideRepository rides;
    private final RideAccess access;
    private final RateLimiter limiter;
    private final int maxRidePage;
    private final int maxMessages;

    RideDayController(RideMoments moments, RideMessages messages, RideRepository rides, RideAccess access,
                      RateLimiter limiter,
                      @Value("${taxi.public.max-ride-page-per-hour:600}") int maxRidePage,
                      @Value("${taxi.public.max-messages-per-10-min:20}") int maxMessages) {
        this.moments = moments;
        this.messages = messages;
        this.rides = rides;
        this.access = access;
        this.limiter = limiter;
        this.maxRidePage = maxRidePage;
        this.maxMessages = maxMessages;
    }

    /** "on_the_way" or "arrived", by the ride's driver while the ride is accepted. Repeats are ignored. */
    @PostMapping("/api/rides/{id}/moments")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void moment(@PathVariable UUID id, @RequestBody MomentBody body) {
        moments.tap(id, body == null ? null : body.kind());
    }

    // ------------------------------------------------------------------ messages, staff (and the account customer)

    @GetMapping("/api/rides/{id}/messages")
    List<RideMessages.Message> staffMessages(@PathVariable UUID id) {
        var ride = rides.find(id).orElseThrow(ApiException::notFound);
        senderFor(ride);
        return messages.of(ride.id());
    }

    /** Written as "driver" by the ride's driver or an admin (as "client" by the ride's customer signed in). */
    @PostMapping("/api/rides/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    RideMessages.Message staffPost(@PathVariable UUID id, @RequestBody MessageBody body) {
        var ride = rides.find(id).orElseThrow(ApiException::notFound);
        var from = senderFor(ride);
        var text = RideMessages.clean(body == null ? null : body.body());
        return messages.post(ride.id(), from, text);
    }

    private String senderFor(Ride ride) {
        if (access.isDriverOrAdmin(ride)) {
            return "driver";
        }
        if (access.isCustomer(ride)) {
            return "client";
        }
        throw ApiException.forbidden();
    }

    // ------------------------------------------------------------------ messages, client by private link

    @GetMapping("/api/public/bookings/{token}/messages")
    List<RideMessages.Message> clientMessages(@PathVariable String token, HttpServletRequest request) {
        limitRidePage(request);
        return messages.of(ride(token).id());
    }

    /** At most 20 messages per 10 minutes and ride link (taxi.public.max-messages-per-10-min). */
    @PostMapping("/api/public/bookings/{token}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    RideMessages.Message clientPost(@PathVariable String token, @RequestBody MessageBody body,
                                    HttpServletRequest request) {
        limitRidePage(request);
        var ride = ride(token);
        var text = RideMessages.clean(body == null ? null : body.body());
        messages.requireOpen(ride);
        if (!limiter.allow("ride-message:" + ride.id(), maxMessages, MESSAGE_WINDOW)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
        return messages.post(ride.id(), "client", text);
    }

    /** Same budget as the other private-link actions (see PublicBookingController). */
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
