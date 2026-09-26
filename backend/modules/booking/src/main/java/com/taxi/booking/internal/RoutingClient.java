package com.taxi.booking.internal;

import com.taxi.shared.GeoPoint;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Road distance and duration from OSRM (open source, OpenStreetMap data).
 * The public demo server is fine for testing; set taxi.routing.osrm-url to your own instance in production.
 * If the server fails, a cautious estimate is used so bookings keep working.
 */
@Component
class RoutingClient {

    record Route(int distanceM, int durationS, boolean estimated) {}

    private record OsrmResponse(String code, List<OsrmRoute> routes) {}

    private record OsrmRoute(double distance, double duration) {}

    private static final Logger log = LoggerFactory.getLogger(RoutingClient.class);

    private final RestClient http;

    RoutingClient(RestClient.Builder builder,
                  @Value("${taxi.routing.osrm-url:https://router.project-osrm.org}") String baseUrl) {
        var timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(3));
        timeouts.setReadTimeout(Duration.ofSeconds(5));
        this.http = builder.baseUrl(baseUrl.replaceAll("/$", "")).requestFactory(timeouts).build();
    }

    Route route(GeoPoint from, GeoPoint to) {
        try {
            var path = String.format(Locale.ROOT, "/route/v1/driving/%.6f,%.6f;%.6f,%.6f?overview=false",
                    from.lng(), from.lat(), to.lng(), to.lat());
            var body = http.get().uri(path).retrieve().body(OsrmResponse.class);
            if (body == null || !"Ok".equals(body.code()) || body.routes() == null || body.routes().isEmpty()) {
                return fallback(from, to);
            }
            var r = body.routes().getFirst();
            return new Route((int) Math.round(r.distance()), (int) Math.round(r.duration()), false);
        } catch (RuntimeException e) {
            log.warn("Routing server unavailable, using an estimate: {}", e.getMessage());
            return fallback(from, to);
        }
    }

    /** Straight line x 1.3 for distance; 30 km/h plus 15 minutes for time (pessimistic on purpose). */
    static Route fallback(GeoPoint from, GeoPoint to) {
        double meters = from.distanceTo(to);
        return new Route((int) Math.round(meters * 1.3), (int) Math.round(meters / (30_000.0 / 3600) + 15 * 60), true);
    }
}
