package com.taxi.booking.internal;

import com.taxi.pricing.TripPlanner;
import com.taxi.shared.GeoPoint;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Gives the pricing module (price simulator) the road and the driver's timezone, as bookings see them. */
@Component
class Trips implements TripPlanner {

    private final RoutingClient routing;
    private final DriverRepository drivers;

    Trips(RoutingClient routing, DriverRepository drivers) {
        this.routing = routing;
        this.drivers = drivers;
    }

    @Override
    public Road route(GeoPoint from, GeoPoint to) {
        var r = routing.route(from, to);
        return new Road(r.distanceM(), r.durationS(), r.estimated(), r.path());
    }

    @Override
    public Optional<ZoneId> driverZone(UUID driverId) {
        return drivers.find(driverId).map(d -> ZoneId.of(d.timezone()));
    }
}
