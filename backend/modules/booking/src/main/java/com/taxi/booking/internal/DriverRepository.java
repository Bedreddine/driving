package com.taxi.booking.internal;

import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class DriverRepository {

    record Driver(UUID id, UUID userId, String displayName, String phone, String timezone, int seats, int luggage,
                  String vehicle, boolean active) {}

    record WorkingHours(int weekday, LocalTime startTime, LocalTime endTime) {}

    record TimeOff(UUID id, UUID driverId, OffsetDateTime startsAt, OffsetDateTime endsAt, String reason) {}

    /** The driver's latest known position. speed in m/s, accuracy in m; both and heading may be null. */
    record Position(double lat, double lng, Double heading, Double speed, Double accuracy, OffsetDateTime updatedAt) {}

    private static final String COLUMNS = "id, user_id, display_name, phone, timezone, seats, luggage, vehicle, active";

    private final JdbcClient jdbc;

    DriverRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The driver customers book today: the first active one. */
    Optional<Driver> defaultDriver() {
        return jdbc.sql("select " + COLUMNS + " from drivers where active order by created_at limit 1")
                .query(Driver.class).optional();
    }

    Optional<Driver> find(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from drivers where id = :id").param("id", id)
                .query(Driver.class).optional();
    }

    Optional<Driver> byUser(UUID userId) {
        return jdbc.sql("select " + COLUMNS + " from drivers where user_id = :u and active").param("u", userId)
                .query(Driver.class).optional();
    }

    /** Locks the driver row: bookings for one driver are checked one at a time. */
    Optional<Driver> lock(UUID id) {
        return jdbc.sql("select " + COLUMNS + " from drivers where id = :id and active for update").param("id", id)
                .query(Driver.class).optional();
    }

    UUID insert(String displayName, UUID userId) {
        return jdbc.sql("insert into drivers (display_name, user_id) values (:n, :u) returning id")
                .param("n", displayName).param("u", userId).query(UUID.class).single();
    }

    void linkUser(UUID driverId, UUID userId) {
        jdbc.sql("update drivers set user_id = :u where id = :d").param("u", userId).param("d", driverId).update();
    }

    List<WorkingHours> workingHours(UUID driverId) {
        return jdbc.sql("select weekday, start_time, end_time from working_hours where driver_id = :d order by weekday, start_time")
                .param("d", driverId).query(WorkingHours.class).list();
    }

    void replaceWorkingHours(UUID driverId, List<WorkingHours> hours) {
        jdbc.sql("delete from working_hours where driver_id = :d").param("d", driverId).update();
        for (var h : hours) {
            jdbc.sql("insert into working_hours (driver_id, weekday, start_time, end_time) values (:d, :w, :s, :e)")
                    .param("d", driverId).param("w", h.weekday()).param("s", h.startTime()).param("e", h.endTime())
                    .update();
        }
    }

    boolean hasTimeOffOverlapping(UUID driverId, Instant from, Instant to) {
        return jdbc.sql("""
                select exists (select 1 from time_off where driver_id = :d and starts_at < :to and ends_at > :from)""")
                .param("d", driverId).param("from", utc(from)).param("to", utc(to))
                .query(Boolean.class).single();
    }

    List<TimeOff> upcomingTimeOff(UUID driverId, Instant now) {
        return jdbc.sql("""
                select id, driver_id, starts_at, ends_at, reason from time_off
                where driver_id = :d and ends_at > :now order by starts_at""")
                .param("d", driverId).param("now", utc(now)).query(TimeOff.class).list();
    }

    UUID insertTimeOff(UUID driverId, Instant from, Instant to, String reason) {
        return jdbc.sql("insert into time_off (driver_id, starts_at, ends_at, reason) values (:d, :f, :t, :r) returning id")
                .param("d", driverId).param("f", utc(from)).param("t", utc(to)).param("r", reason)
                .query(UUID.class).single();
    }

    boolean deleteTimeOff(UUID driverId, UUID id) {
        return jdbc.sql("delete from time_off where id = :id and driver_id = :d").param("id", id).param("d", driverId)
                .update() > 0;
    }

    /** Keeps only the latest position (no history). */
    void savePosition(UUID driverId, Position p) {
        jdbc.sql("""
                insert into driver_positions (driver_id, lat, lng, heading, speed, accuracy, updated_at)
                values (:d, :lat, :lng, :heading, :speed, :accuracy, :at)
                on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, heading = excluded.heading,
                  speed = excluded.speed, accuracy = excluded.accuracy, updated_at = excluded.updated_at""")
                .param("d", driverId).param("lat", p.lat()).param("lng", p.lng()).param("heading", p.heading())
                .param("speed", p.speed()).param("accuracy", p.accuracy()).param("at", p.updatedAt())
                .update();
    }

    Optional<Position> position(UUID driverId) {
        return jdbc.sql("select lat, lng, heading, speed, accuracy, updated_at from driver_positions where driver_id = :d")
                .param("d", driverId).query(Position.class).optional();
    }

    /** Positions are personal data of the driver: erased with their account. */
    void deletePositionsOfUser(UUID userId) {
        jdbc.sql("delete from driver_positions where driver_id in (select id from drivers where user_id = :u)")
                .param("u", userId).update();
    }

    static OffsetDateTime utc(Instant i) {
        return i.atOffset(ZoneOffset.UTC);
    }
}
