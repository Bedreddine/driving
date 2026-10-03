package com.taxi.booking.internal;

import static com.taxi.booking.internal.DriverRepository.utc;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
class RideRepository {

    /** A slot-holding ride next to a new pickup: where it ends (prev) or starts (next), and when. */
    record Neighbour(UUID id, double lat, double lng, Instant at) {}

    record Neighbours(Neighbour prev, Neighbour next) {}

    record NewRide(UUID contactId, UUID driverId, UUID createdBy, String source, RideStatus status, Instant pickupAt,
                   String pickupAddress, double pickupLat, double pickupLng, String dropoffAddress, double dropoffLat,
                   double dropoffLng, int distanceM, int durationS, int pickupAllowanceMin, Instant blockedUntil,
                   int passengers, int luggage, int childSeats, String vehicle, boolean meetGreet, String travelRef,
                   String customerNotes, String currency, boolean isFixedPrice, BigDecimal estimatedPrice,
                   BigDecimal agreedPrice, Instant answerDeadline, String accessToken, List<double[]> route,
                   String guestName, String guestLanguage) {}

    static final Duration NEIGHBOUR_WINDOW = Duration.ofHours(12);
    private static final String HOLDING = "('accepted', 'price_proposed')";

    private final JdbcClient jdbc;
    private final JsonMapper json;

    RideRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Optional<Ride> find(UUID id) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where id = :id").param("id", id)
                .query(Ride.class).optional();
    }

    Optional<Ride> byAccessToken(String token) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where access_token = :t").param("t", token)
                .query(Ride.class).optional();
    }

    Optional<Ride> lock(UUID id) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where id = :id for update").param("id", id)
                .query(Ride.class).optional();
    }

    UUID insert(NewRide r) {
        return jdbc.sql("""
                insert into rides (contact_id, driver_id, created_by, source, status, pickup_at, pickup_address,
                  pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s,
                  pickup_allowance_min, blocked_range, passengers, luggage, child_seats, vehicle, meet_greet, travel_ref,
                  customer_notes, currency, is_fixed_price, estimated_price, agreed_price, answer_deadline, access_token,
                  route, guest_name, guest_language)
                values (:contactId, :driverId, :createdBy, :source, :status, :pickupAt, :pickupAddress,
                  :pickupLat, :pickupLng, :dropoffAddress, :dropoffLat, :dropoffLng, :distanceM, :durationS,
                  :pickupAllowanceMin, tstzrange(:pickupAt, :blockedUntil), :passengers, :luggage, :childSeats, :vehicle,
                  :meetGreet, :travelRef, :customerNotes, :currency, :isFixedPrice, :estimatedPrice, :agreedPrice,
                  :answerDeadline, :accessToken, cast(:route as jsonb), :guestName, :guestLanguage)
                returning id""")
                .param("contactId", r.contactId()).param("driverId", r.driverId()).param("createdBy", r.createdBy())
                .param("source", r.source()).param("status", r.status().value()).param("pickupAt", utc(r.pickupAt()))
                .param("pickupAddress", r.pickupAddress()).param("pickupLat", r.pickupLat())
                .param("pickupLng", r.pickupLng()).param("dropoffAddress", r.dropoffAddress())
                .param("dropoffLat", r.dropoffLat()).param("dropoffLng", r.dropoffLng())
                .param("distanceM", r.distanceM()).param("durationS", r.durationS())
                .param("pickupAllowanceMin", r.pickupAllowanceMin()).param("blockedUntil", utc(r.blockedUntil()))
                .param("passengers", r.passengers()).param("luggage", r.luggage())
                .param("childSeats", r.childSeats()).param("vehicle", r.vehicle())
                .param("meetGreet", r.meetGreet()).param("travelRef", r.travelRef())
                .param("customerNotes", r.customerNotes()).param("currency", r.currency())
                .param("isFixedPrice", r.isFixedPrice()).param("estimatedPrice", r.estimatedPrice())
                .param("agreedPrice", r.agreedPrice())
                .param("answerDeadline", r.answerDeadline() == null ? null : utc(r.answerDeadline()))
                .param("accessToken", r.accessToken())
                .param("route", r.route() == null ? null : json.writeValueAsString(r.route()))
                .param("guestName", r.guestName()).param("guestLanguage", r.guestLanguage())
                .query(UUID.class).single();
    }

    /** The road of a ride for the map, [lng, lat] points; null when it was not known at booking time. */
    List<double[]> route(UUID id) {
        var text = jdbc.sql("select route::text from rides where id = :id and route is not null").param("id", id)
                .query(String.class).list();
        return text.isEmpty() ? null : List.of(json.readValue(text.getFirst(), double[][].class));
    }

    /**
     * Changes status and the given columns. Column names come from this class only, never from input.
     */
    void update(UUID id, RideStatus status, Map<String, Object> columns) {
        var sets = new StringBuilder("status = :status, updated_at = now()");
        columns.keySet().forEach(c -> sets.append(", ").append(c).append(" = :").append(c));
        var spec = jdbc.sql("update rides set " + sets + " where id = :id").param("id", id)
                .param("status", status.value());
        for (var e : columns.entrySet()) {
            var v = e.getValue() instanceof Instant i ? utc(i) : e.getValue();
            spec = spec.param(e.getKey(), v);
        }
        spec.update();
    }

    void logEvent(UUID rideId, RideStatus from, RideStatus to, UUID actor, String note) {
        jdbc.sql("insert into ride_events (ride_id, from_status, to_status, actor, note) values (:r, :f, :t, :a, :n)")
                .param("r", rideId).param("f", from == null ? null : from.value()).param("t", to.value())
                .param("a", actor).param("n", note).update();
    }

    /** A slot-holding ride whose reserved time overlaps [from, to), if any. */
    Optional<Ride> overlapping(UUID driverId, Instant from, Instant to, UUID exclude) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where driver_id = :d and status in " + HOLDING
                        + " and blocked_range && tstzrange(:f, :t) and id is distinct from :x limit 1")
                .param("d", driverId).param("f", utc(from)).param("t", utc(to)).param("x", exclude)
                .query(Ride.class).optional();
    }

    /** The slot-holding rides right before and right after a pickup time, within 12 hours. */
    Neighbours neighbours(UUID driverId, Instant pickupAt) {
        return neighbours(driverId, pickupAt, null);
    }

    /** Same, ignoring one ride (the one being accepted). */
    Neighbours neighbours(UUID driverId, Instant pickupAt, UUID exclude) {
        var prev = jdbc.sql("select " + Ride.COLUMNS + " from rides where driver_id = :d and status in " + HOLDING
                        + " and pickup_at <= :p and pickup_at > :from and id is distinct from :x order by pickup_at desc limit 1")
                .param("d", driverId).param("p", utc(pickupAt)).param("from", utc(pickupAt.minus(NEIGHBOUR_WINDOW)))
                .param("x", exclude)
                .query(Ride.class).optional()
                .map(r -> new Neighbour(r.id(), r.dropoffLat(), r.dropoffLng(), r.endsAt()));
        var next = jdbc.sql("select " + Ride.COLUMNS + " from rides where driver_id = :d and status in " + HOLDING
                        + " and pickup_at > :p and pickup_at < :to and id is distinct from :x order by pickup_at asc limit 1")
                .param("d", driverId).param("p", utc(pickupAt)).param("to", utc(pickupAt.plus(NEIGHBOUR_WINDOW)))
                .param("x", exclude)
                .query(Ride.class).optional()
                .map(r -> new Neighbour(r.id(), r.pickupLat(), r.pickupLng(), r.pickup()));
        return new Neighbours(prev.orElse(null), next.orElse(null));
    }

    /**
     * Rides visible to someone: an admin sees all, a driver their own rides, a customer the rides of their contact.
     */
    List<Ride> visible(boolean admin, UUID driverId, UUID contactId, Instant from, Instant to, List<String> statuses,
                       int limit) {
        var sql = new StringBuilder("select " + Ride.COLUMNS + " from rides where (:admin or driver_id = :driver or contact_id = :contact)");
        if (from != null) {
            sql.append(" and pickup_at >= :from");
        }
        if (to != null) {
            sql.append(" and pickup_at < :to");
        }
        if (statuses != null && !statuses.isEmpty()) {
            sql.append(" and status in (:statuses)");
        }
        sql.append(" order by pickup_at limit :limit");
        var spec = jdbc.sql(sql.toString()).param("admin", admin).param("driver", driverId).param("contact", contactId)
                .param("limit", limit);
        if (from != null) {
            spec = spec.param("from", utc(from));
        }
        if (to != null) {
            spec = spec.param("to", utc(to));
        }
        if (statuses != null && !statuses.isEmpty()) {
            spec = spec.param("statuses", statuses);
        }
        return spec.query(Ride.class).list();
    }

    /** Pending requests overlapping a slot-holding ride, so the driver sees the clash before accepting. */
    Map<UUID, UUID> requestConflicts(boolean admin, UUID driverId) {
        return jdbc.sql("""
                select q.id as request_id, h.id as clash_id from rides q
                join rides h on h.driver_id = q.driver_id and h.id <> q.id
                 and h.status in ('accepted', 'price_proposed') and h.blocked_range && q.blocked_range
                where q.status = 'requested' and (:admin or q.driver_id = :driver)""")
                .param("admin", admin).param("driver", driverId)
                .query((rs, n) -> Map.entry(rs.getObject("request_id", UUID.class), rs.getObject("clash_id", UUID.class)))
                .list().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a));
    }

    List<Ride> overdue(Instant now) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where status in ('requested', 'price_proposed')"
                        + " and answer_deadline <= :now for update skip locked")
                .param("now", utc(now)).query(Ride.class).list();
    }

    /** Accepted rides still open 2 hours after their end, not yet reminded. */
    List<Ride> openTooLong(Instant now) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides r where status = 'accepted'"
                        + " and pickup_at + make_interval(secs => duration_s) + make_interval(mins => pickup_allowance_min)"
                        + "     + interval '2 hours' < :now"
                        + " and not exists (select 1 from ride_events e where e.ride_id = r.id and e.note = 'close_reminder')")
                .param("now", utc(now)).query(Ride.class).list();
    }

    /**
     * Is the driver busy right now with another customer's accepted ride (between its pickup and its planned end)?
     * Their position then tells where that other customer is: not to be shown to anyone else.
     */
    boolean driverBusyWithAnotherCustomer(UUID driverId, UUID rideId, UUID contactId, Instant now) {
        return jdbc.sql("""
                select exists (select 1 from rides where driver_id = :d and id <> :r and contact_id <> :c
                  and status = 'accepted' and pickup_at <= :now
                  and pickup_at + make_interval(secs => duration_s) + make_interval(mins => pickup_allowance_min) > :now)""")
                .param("d", driverId).param("r", rideId).param("c", contactId).param("now", utc(now))
                .query(Boolean.class).single();
    }

    List<Ride> openForContact(UUID contactId) {
        return jdbc.sql("select " + Ride.COLUMNS + " from rides where contact_id = :c"
                        + " and status in ('requested', 'price_proposed', 'accepted') for update")
                .param("c", contactId).query(Ride.class).list();
    }

    List<UUID> idsForContact(UUID contactId) {
        return jdbc.sql("select id from rides where contact_id = :c").param("c", contactId).query(UUID.class).list();
    }

    /** Keep rides for accounting without personal data. */
    void stripPersonalData(UUID contactId) {
        // (also used by the back office to erase a phone customer on request)
        jdbc.sql("""
                update rides set pickup_address = '(address removed)', dropoff_address = '(address removed)',
                  pickup_lat = round(pickup_lat::numeric, 2), pickup_lng = round(pickup_lng::numeric, 2),
                  dropoff_lat = round(dropoff_lat::numeric, 2), dropoff_lng = round(dropoff_lng::numeric, 2),
                  customer_notes = null, travel_ref = null, route = null, guest_name = null
                where contact_id = :c""").param("c", contactId).update();
    }

    /** Retention: see the design doc, "Privacy and data". */
    void applyRetention() {
        jdbc.sql("""
                delete from rides where status in ('declined', 'declined_by_customer', 'expired', 'cancelled')
                  and updated_at < now() - interval '12 months'""").update();
        jdbc.sql("""
                update rides set pickup_address = '(address removed)', dropoff_address = '(address removed)',
                  pickup_lat = round(pickup_lat::numeric, 2), pickup_lng = round(pickup_lng::numeric, 2),
                  dropoff_lat = round(dropoff_lat::numeric, 2), dropoff_lng = round(dropoff_lng::numeric, 2)
                , customer_notes = null, travel_ref = null, route = null
                where status in ('completed', 'no_show') and pickup_at < now() - interval '3 years'
                  and pickup_address <> '(address removed)'""").update();
        jdbc.sql("delete from rides where status in ('completed', 'no_show') and pickup_at < now() - interval '10 years'")
                .update();
    }
}
