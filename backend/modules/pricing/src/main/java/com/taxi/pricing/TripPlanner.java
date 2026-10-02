package com.taxi.pricing;

import com.taxi.shared.GeoPoint;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * What the pricing module needs to price a trip on its own (the back-office price simulator): the road and the
 * driver's timezone. Implemented by the booking module, which owns drivers and the map server.
 */
public interface TripPlanner {

    Road route(GeoPoint from, GeoPoint to);

    Optional<ZoneId> driverZone(UUID driverId);

    /**
     * @param estimated true when the map server did not answer (cautious estimate, no road)
     * @param path      the road as [lng, lat] points, or null
     */
    record Road(int distanceM, int durationS, boolean estimated, List<double[]> path) {}
}
