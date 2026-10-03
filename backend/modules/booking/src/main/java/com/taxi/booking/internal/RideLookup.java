package com.taxi.booking.internal;

import com.taxi.booking.RideDirectory;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Public, read-only view of rides for other modules (see {@link RideDirectory}). */
@Component
class RideLookup implements RideDirectory {

    private static final String SELECT = """
            select r.id, r.status, r.pickup_at, coalesce(r.guest_name, c.full_name) as customer_name,
                   c.anonymized_at is not null as customer_forgotten
            from rides r join contacts c on c.id = r.contact_id""";

    private final JdbcClient jdbc;

    RideLookup(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<RideFacts> byAccessToken(String accessToken) {
        if (accessToken == null || accessToken.length() < 32) {
            return Optional.empty();
        }
        return jdbc.sql(SELECT + " where r.access_token = :t").param("t", accessToken)
                .query(RideFacts.class).optional();
    }

    @Override
    public Map<UUID, RideFacts> find(Collection<UUID> rideIds) {
        if (rideIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql(SELECT + " where r.id in (:ids)").param("ids", List.copyOf(rideIds))
                .query(RideFacts.class).list().stream()
                .collect(Collectors.toMap(RideFacts::id, Function.identity()));
    }
}
