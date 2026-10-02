package com.taxi.booking.internal;

import static com.taxi.booking.internal.DriverRepository.utc;

import com.taxi.shared.GeoPoint;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Live driver position, sent by the driver's phone and shown to the customer of a ride.
 * Privacy: a customer sees the driver only around their own accepted ride (from 90 minutes before pickup until
 * 60 minutes after the planned end), and only a recent position (under 2 minutes old). Only the latest position
 * is stored (survives restarts, no history); coordinates are never logged.
 */
@Component
class DriverTracking {

    static final Duration BEFORE_PICKUP = Duration.ofMinutes(90);
    static final Duration AFTER_END = Duration.ofMinutes(60);
    static final Duration FRESH = Duration.ofMinutes(2);
    /** Until 10 minutes after pickup time the ETA is to the pickup (driver on the way), then to the drop-off. */
    static final Duration PICKUP_PHASE = Duration.ofMinutes(10);
    /** Customers poll every few seconds: the map server is asked at most once per 30 s and ride. */
    static final Duration ETA_REUSE = Duration.ofSeconds(30);

    /**
     * What the customer sees.
     *
     * @param etaTo     "pickup" or "dropoff"
     * @param etaS      road time from the driver to that point, null when the map server did not answer
     * @param distanceM road distance, null likewise
     */
    record DriverLocation(double lat, double lng, Double heading, OffsetDateTime updatedAt, String etaTo, Integer etaS,
                          Integer distanceM) {}

    private record Eta(Instant at, String to, Integer etaS, Integer distanceM) {}

    private final DriverRepository drivers;
    private final RoutingClient routing;
    private final Clock clock;
    private final Map<UUID, Eta> etas = new ConcurrentHashMap<>();

    DriverTracking(DriverRepository drivers, RoutingClient routing, Clock clock) {
        this.drivers = drivers;
        this.routing = routing;
        this.clock = clock;
    }

    void record(UUID driverId, double lat, double lng, Double heading, Double speed, Double accuracy) {
        drivers.savePosition(driverId,
                new DriverRepository.Position(lat, lng, heading, speed, accuracy, utc(clock.instant())));
    }

    /** The driver's position for this ride, or empty when the privacy rule says it must not be shown. */
    Optional<DriverLocation> forRide(Ride ride) {
        var now = clock.instant();
        // The planned end includes the pickup allowance (airport waiting, meet & greet).
        if (ride.rideStatus() != RideStatus.ACCEPTED
                || now.isBefore(ride.pickup().minus(BEFORE_PICKUP)) || now.isAfter(ride.endsAt().plus(AFTER_END))) {
            return Optional.empty();
        }
        var position = drivers.position(ride.driverId())
                .filter(p -> p.updatedAt().toInstant().isAfter(now.minus(FRESH)));
        if (position.isEmpty()) {
            return Optional.empty();
        }
        var p = position.get();
        var to = now.isBefore(ride.pickup().plus(PICKUP_PHASE)) ? "pickup" : "dropoff";
        var eta = eta(ride, to, p, now);
        return Optional.of(new DriverLocation(p.lat(), p.lng(), p.heading(), p.updatedAt(), to, eta.etaS(),
                eta.distanceM()));
    }

    private Eta eta(Ride ride, String to, DriverRepository.Position p, Instant now) {
        var cached = etas.get(ride.id());
        if (cached != null && cached.to().equals(to) && cached.at().isAfter(now.minus(ETA_REUSE))) {
            return cached;
        }
        var target = "pickup".equals(to) ? new GeoPoint(ride.pickupLat(), ride.pickupLng())
                : new GeoPoint(ride.dropoffLat(), ride.dropoffLng());
        RoutingClient.Route road;
        try {
            road = routing.route(new GeoPoint(p.lat(), p.lng()), target);
        } catch (RuntimeException e) {
            road = null;
        }
        // A fallback estimate (map server down) is far too cautious for an ETA: better none.
        var fresh = road == null || road.estimated() ? new Eta(now, to, null, null)
                : new Eta(now, to, road.durationS(), road.distanceM());
        etas.values().removeIf(e -> e.at().isBefore(now.minus(Duration.ofMinutes(10)))); // keeps the cache small
        etas.put(ride.id(), fresh);
        return fresh;
    }
}
