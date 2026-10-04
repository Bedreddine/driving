package com.taxi.notification.internal;

import com.taxi.booking.RideDirectory;
import com.taxi.shared.ApiException;
import com.taxi.shared.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Browser push for guests: the page asks for the server key, then registers the browser for its ride. */
@RestController
class WebPushController {

    /** @param publicKey base64url VAPID key (the browser's applicationServerKey), null when browser push is off */
    record KeyView(String publicKey) {}

    /** The browser's PushSubscription, as JSON.stringify(subscription) gives it (expiration_time is ignored). */
    record SubscriptionBody(String endpoint, Keys keys) {}

    record Keys(String p256dh, String auth) {}

    record EndpointBody(String endpoint) {}

    static final int MAX_ENDPOINT = 1000;
    private static final Duration HOUR = Duration.ofHours(1);

    private final WebPushKeys keys;
    private final WebPushes pushes;
    private final RideDirectory rides;
    private final RateLimiter limiter;
    private final int maxRidePage;

    WebPushController(WebPushKeys keys, WebPushes pushes, RideDirectory rides, RateLimiter limiter,
                      @Value("${taxi.public.max-ride-page-per-hour:600}") int maxRidePage) {
        this.keys = keys;
        this.pushes = pushes;
        this.rides = rides;
        this.limiter = limiter;
        this.maxRidePage = maxRidePage;
    }

    @GetMapping("/api/public/web-push/key")
    KeyView key() {
        return new KeyView(keys.publicKey());
    }

    @PostMapping("/api/public/bookings/{token}/web-push")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void subscribe(@PathVariable String token, @RequestBody SubscriptionBody body, HttpServletRequest request) {
        limit(request);
        var rideId = ride(token);
        if (body == null || body.keys() == null || !validEndpoint(body.endpoint())
                || !base64url(body.keys().p256dh(), 65) || !base64url(body.keys().auth(), 16)) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        pushes.subscribe(rideId, body.endpoint(), body.keys().p256dh(), body.keys().auth());
    }

    @DeleteMapping("/api/public/bookings/{token}/web-push")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unsubscribe(@PathVariable String token, @RequestBody EndpointBody body, HttpServletRequest request) {
        limit(request);
        var rideId = ride(token);
        if (body == null || body.endpoint() == null || body.endpoint().length() > MAX_ENDPOINT) {
            throw ApiException.badRequest("BAD_INPUT");
        }
        pushes.unsubscribe(rideId, body.endpoint());
    }

    /**
     * An https address of a push service. The server will POST to it, so addresses that are plainly local
     * (IP literals, localhost, single-label names) are refused.
     */
    static boolean validEndpoint(String endpoint) {
        if (endpoint == null || endpoint.length() > MAX_ENDPOINT || !endpoint.startsWith("https://")) {
            return false;
        }
        try {
            var uri = new URI(endpoint);
            var host = uri.getHost();
            if (host == null || uri.getUserInfo() != null) {
                return false;
            }
            host = host.toLowerCase(java.util.Locale.ROOT);
            return host.contains(".") && !host.startsWith("[") && !host.matches("^[0-9.]+$")
                    && !host.equals("localhost") && !host.endsWith(".localhost") && !host.endsWith(".local")
                    && !host.endsWith(".internal");
        } catch (java.net.URISyntaxException e) {
            return false;
        }
    }

    /** Base64url (padding allowed) of exactly the given number of bytes. */
    static boolean base64url(String value, int bytes) {
        if (value == null || value.length() > 200 || !value.matches("^[A-Za-z0-9_-]+=*$")) {
            return false;
        }
        try {
            return Base64.getUrlDecoder().decode(value.replace("=", "")).length == bytes;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Same budget as the other private-link actions. */
    private void limit(HttpServletRequest request) {
        if (!limiter.allow("ride-page:" + RateLimiter.visitor(request), maxRidePage, HOUR)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS");
        }
    }

    private UUID ride(String token) {
        if (token == null || token.length() > 128) {
            throw ApiException.notFound();
        }
        return rides.byAccessToken(token).map(RideDirectory.RideFacts::id).orElseThrow(ApiException::notFound);
    }
}
