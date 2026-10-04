package com.taxi.booking.internal;

import static com.taxi.booking.internal.DriverRepository.utc;

import com.taxi.booking.RideMomentReached;
import com.taxi.shared.ApiException;
import com.taxi.shared.GeoPoint;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ride-day moments told to the customer, each recorded once per ride:
 * "on_the_way" and "arrived" are tapped by the driver; "arriving" is automatic, when the driver's live position
 * comes within {@link #ARRIVING_WITHIN_M} of the pickup (straight line, about 5 minutes in Paris traffic).
 */
@Component
class RideMoments {

    static final Set<String> TAPPED = Set.of("on_the_way", "arrived");
    static final double ARRIVING_WITHIN_M = 2_500;
    /** A driver waiting nearby long before the pickup is not "arriving": only this close to the time, or once on the way. */
    static final Duration ARRIVING_FROM = Duration.ofMinutes(30);

    /** One moment, as shown on the ride page and in the ride detail. */
    record Moment(String kind, OffsetDateTime at) {}

    private final JdbcClient jdbc;
    private final RideRepository rides;
    private final RideAccess access;
    private final Notices notices;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    RideMoments(JdbcClient jdbc, RideRepository rides, RideAccess access, Notices notices,
                ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.rides = rides;
        this.access = access;
        this.notices = notices;
        this.events = events;
        this.clock = clock;
    }

    List<Moment> of(UUID rideId) {
        return jdbc.sql("select kind, at from ride_moments where ride_id = :r order by at, kind").param("r", rideId)
                .query(Moment.class).list();
    }

    /** The driver taps "on the way" or "arrived". Repeating it changes nothing (and tells nobody again). */
    @Transactional
    public void tap(UUID rideId, String kind) {
        if (kind == null || !TAPPED.contains(kind)) {
            throw ApiException.badRequest("BAD_INPUT"); // "arriving" is automatic only
        }
        var ride = rides.lock(rideId).orElseThrow(ApiException::notFound);
        if (!access.isDriverOrAdmin(ride)) {
            throw ApiException.forbidden();
        }
        if (ride.rideStatus() != RideStatus.ACCEPTED) {
            throw ApiException.conflict("RIDE_NOT_ACTIVE");
        }
        record(ride, kind);
    }

    /**
     * A new position from the driver's phone: "arriving" for the ride the position applies to, chosen like
     * {@link DriverTracking} shows it: the driver's earliest accepted ride whose pickup is within the live window
     * and still in its pickup phase (the ETA goes to the pickup), unless the driver is carrying another customer.
     */
    @Transactional
    public void onPosition(UUID driverId, double lat, double lng) {
        var now = clock.instant();
        Optional<Ride> next = jdbc.sql("select " + Ride.COLUMNS + " from rides r where driver_id = :d"
                        + " and status = 'accepted' and pickup_at <= :latest and pickup_at > :earliest"
                        + " and not exists (select 1 from ride_moments m where m.ride_id = r.id"
                        + "   and m.kind in ('arriving', 'arrived'))"
                        + " order by pickup_at limit 1")
                .param("d", driverId)
                .param("latest", utc(now.plus(DriverTracking.BEFORE_PICKUP)))
                .param("earliest", utc(now.minus(DriverTracking.PICKUP_PHASE)))
                .query(Ride.class).optional();
        if (next.isEmpty()) {
            return;
        }
        var ride = next.get();
        if (ride.pickupAt().toInstant().isAfter(now.plus(ARRIVING_FROM)) && !has(ride.id(), "on_the_way")) {
            return;
        }
        var distance = new GeoPoint(lat, lng).distanceTo(new GeoPoint(ride.pickupLat(), ride.pickupLng()));
        if (distance > ARRIVING_WITHIN_M
                || rides.driverBusyWithAnotherCustomer(driverId, ride.id(), ride.contactId(), now)) {
            return;
        }
        record(ride, "arriving");
    }

    private void record(Ride ride, String kind) {
        var at = clock.instant();
        int inserted = jdbc.sql("insert into ride_moments (ride_id, kind, at) values (:r, :k, :at) on conflict do nothing")
                .param("r", ride.id()).param("k", kind).param("at", utc(at)).update();
        if (inserted == 0) {
            return; // already recorded: nobody is told twice
        }
        var c = notices.about(ride);
        events.publishEvent(new RideMomentReached(UUID.randomUUID(), ride.id(), kind, at, c.customerUser(),
                c.driverUser(), c.customer(), c.trip()));
    }

    private boolean has(UUID rideId, String kind) {
        return jdbc.sql("select exists (select 1 from ride_moments where ride_id = :r and kind = :k)")
                .param("r", rideId).param("k", kind).query(Boolean.class).single();
    }
}
