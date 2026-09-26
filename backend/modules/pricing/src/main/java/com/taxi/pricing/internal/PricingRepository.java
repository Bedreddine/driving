package com.taxi.pricing.internal;

import java.math.BigDecimal;
import java.sql.Array;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class PricingRepository {

    record Settings(UUID driverId, String licence, String currency, BigDecimal baseFare, BigDecimal perKm,
                    BigDecimal perMinute, BigDecimal minimumFare, int airportWaitMinutes, int meetGreetMinutes,
                    int minGapMinutes, int leadTimeMinutes) {}

    record Zone(UUID id, String name, String kind, double centerLat, double centerLng, int radiusM) {}

    record FixedPrice(UUID id, UUID driverId, UUID fromZone, UUID toZone, BigDecimal price, boolean bothDirections,
                      boolean surchargesApply) {}

    record Surcharge(UUID id, UUID driverId, String name, List<Integer> days, LocalTime startTime, LocalTime endTime,
                     BigDecimal percent) {}

    private final JdbcClient jdbc;

    PricingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Settings> settings(UUID driverId) {
        return jdbc.sql("select * from pricing_settings where driver_id = :d").param("d", driverId)
                .query(Settings.class).optional();
    }

    void ensureSettings(UUID driverId) {
        jdbc.sql("insert into pricing_settings (driver_id) values (:d) on conflict do nothing").param("d", driverId).update();
    }

    int updateSettings(Settings s) {
        return jdbc.sql("""
                update pricing_settings set licence = :licence, currency = :currency, base_fare = :baseFare,
                  per_km = :perKm, per_minute = :perMinute, minimum_fare = :minimumFare,
                  airport_wait_minutes = :airportWaitMinutes, meet_greet_minutes = :meetGreetMinutes,
                  min_gap_minutes = :minGapMinutes, lead_time_minutes = :leadTimeMinutes
                where driver_id = :driverId""")
                .paramSource(s)
                .update();
    }

    List<Zone> zones() {
        return jdbc.sql("select id, name, kind, center_lat, center_lng, radius_m from zones order by name")
                .query(Zone.class).list();
    }

    UUID insertZone(String name, String kind, double lat, double lng, int radiusM) {
        return jdbc.sql("""
                insert into zones (name, kind, center_lat, center_lng, radius_m)
                values (:name, :kind, :lat, :lng, :r) returning id""")
                .param("name", name).param("kind", kind).param("lat", lat).param("lng", lng).param("r", radiusM)
                .query(UUID.class).single();
    }

    boolean deleteZone(UUID id) {
        return jdbc.sql("delete from zones where id = :id").param("id", id).update() > 0;
    }

    List<FixedPrice> fixedPrices(UUID driverId) {
        return jdbc.sql("select * from fixed_prices where driver_id = :d").param("d", driverId)
                .query(FixedPrice.class).list();
    }

    UUID insertFixedPrice(UUID driverId, UUID from, UUID to, BigDecimal price, boolean both, boolean surchargesApply) {
        return jdbc.sql("""
                insert into fixed_prices (driver_id, from_zone, to_zone, price, both_directions, surcharges_apply)
                values (:d, :f, :t, :p, :b, :s) returning id""")
                .param("d", driverId).param("f", from).param("t", to).param("p", price).param("b", both)
                .param("s", surchargesApply)
                .query(UUID.class).single();
    }

    boolean deleteFixedPrice(UUID id) {
        return jdbc.sql("delete from fixed_prices where id = :id").param("id", id).update() > 0;
    }

    List<Surcharge> surcharges(UUID driverId) {
        return jdbc.sql("""
                select id, driver_id, name, days, start_time, end_time, percent
                from surcharges where driver_id = :d order by name""")
                .param("d", driverId)
                .query((rs, n) -> new Surcharge(
                        rs.getObject("id", UUID.class),
                        rs.getObject("driver_id", UUID.class),
                        rs.getString("name"),
                        toDays(rs.getArray("days")),
                        rs.getObject("start_time", LocalTime.class),
                        rs.getObject("end_time", LocalTime.class),
                        rs.getBigDecimal("percent")))
                .list();
    }

    UUID insertSurcharge(UUID driverId, String name, Set<Integer> days, LocalTime start, LocalTime end,
                         BigDecimal percent) {
        return jdbc.sql("""
                insert into surcharges (driver_id, name, days, start_time, end_time, percent)
                values (:d, :name, cast(:days as smallint[]), :start, :end, :pct) returning id""")
                .param("d", driverId).param("name", name)
                .param("days", "{" + days.stream().sorted().map(String::valueOf).collect(Collectors.joining(",")) + "}")
                .param("start", start).param("end", end).param("pct", percent)
                .query(UUID.class).single();
    }

    boolean deleteSurcharge(UUID id) {
        return jdbc.sql("delete from surcharges where id = :id").param("id", id).update() > 0;
    }

    private static List<Integer> toDays(Array array) throws java.sql.SQLException {
        var values = (Object[]) array.getArray();
        return Arrays.stream(values).map(v -> ((Number) v).intValue()).toList();
    }
}
