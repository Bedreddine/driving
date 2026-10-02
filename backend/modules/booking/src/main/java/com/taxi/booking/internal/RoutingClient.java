package com.taxi.booking.internal;

import com.taxi.shared.GeoPoint;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Road distance, duration and the road itself (for the map) from OSRM (open source, OpenStreetMap data).
 * The public demo server is fine for testing; set taxi.routing.osrm-url to your own instance in production.
 * If the server fails, a cautious estimate is used so bookings keep working (and there is no road to draw).
 */
@Component
class RoutingClient {

    /** Most points sent to the app for the map line: plenty for a phone screen, small enough to send. */
    static final int MAX_POINTS = 400;

    /**
     * @param path the road as [lng, lat] points (GeoJSON order), at most {@link #MAX_POINTS};
     *             null when the server gave none (estimate)
     */
    record Route(int distanceM, int durationS, boolean estimated, List<double[]> path) {

        Route(int distanceM, int durationS, boolean estimated) {
            this(distanceM, durationS, estimated, null);
        }
    }

    private record OsrmResponse(String code, List<OsrmRoute> routes) {}

    private record OsrmRoute(double distance, double duration, OsrmGeometry geometry) {}

    private record OsrmGeometry(String type, List<double[]> coordinates) {}

    private static final Logger log = LoggerFactory.getLogger(RoutingClient.class);

    private final RestClient http;

    @Autowired
    RoutingClient(RestClient.Builder builder,
                  @Value("${taxi.routing.osrm-url:https://router.project-osrm.org}") String baseUrl) {
        var timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(3));
        timeouts.setReadTimeout(Duration.ofSeconds(5));
        this.http = builder.baseUrl(baseUrl.replaceAll("/$", "")).requestFactory(timeouts).build();
    }

    /** Tests: a client already pointed at a fake server. */
    RoutingClient(RestClient http) {
        this.http = http;
    }

    Route route(GeoPoint from, GeoPoint to) {
        try {
            var path = String.format(Locale.ROOT,
                    "/route/v1/driving/%.6f,%.6f;%.6f,%.6f?overview=simplified&geometries=geojson",
                    from.lng(), from.lat(), to.lng(), to.lat());
            var body = http.get().uri(path).retrieve().body(OsrmResponse.class);
            if (body == null || !"Ok".equals(body.code()) || body.routes() == null || body.routes().isEmpty()) {
                return fallback(from, to);
            }
            var r = body.routes().getFirst();
            var points = r.geometry() == null ? null : downsample(r.geometry().coordinates(), MAX_POINTS);
            return new Route((int) Math.round(r.distance()), (int) Math.round(r.duration()), false, points);
        } catch (RuntimeException e) {
            // Only the cause: the request URL in the full message holds coordinates (addresses, driver position).
            var cause = NestedExceptionUtils.getMostSpecificCause(e);
            log.warn("Routing server unavailable, using an estimate: {}: {}", cause.getClass().getSimpleName(),
                    cause == e ? "" : cause.getMessage());
            return fallback(from, to);
        }
    }

    /** Straight line x 1.3 for distance; 30 km/h plus 15 minutes for time (pessimistic on purpose). No road. */
    static Route fallback(GeoPoint from, GeoPoint to) {
        double meters = from.distanceTo(to);
        return new Route((int) Math.round(meters * 1.3), (int) Math.round(meters / (30_000.0 / 3600) + 15 * 60), true);
    }

    /**
     * Keeps at most max points, evenly spread, always the first and the last (the line still starts at the pickup
     * and ends at the drop-off). Malformed points are dropped; fewer than two usable points means no line (null).
     */
    static List<double[]> downsample(List<double[]> points, int max) {
        if (points == null) {
            return null;
        }
        var valid = points.stream().filter(p -> p != null && p.length >= 2).map(p -> new double[] {p[0], p[1]}).toList();
        if (valid.size() < 2) {
            return null;
        }
        if (valid.size() <= max) {
            return valid;
        }
        var kept = new ArrayList<double[]>(max);
        int last = valid.size() - 1;
        for (int i = 0; i < max; i++) {
            kept.add(valid.get((int) Math.round((double) i * last / (max - 1))));
        }
        return kept;
    }
}
