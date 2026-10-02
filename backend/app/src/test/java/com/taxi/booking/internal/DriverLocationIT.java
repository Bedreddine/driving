package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.identity.IdentityEvents.UserDeleting;
import com.taxi.shared.GeoPoint;
import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Live driver position: who may send it, and when a customer may see it (privacy rule). */
class DriverLocationIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;
    @Autowired ApplicationEventPublisher events;

    private static final Map<String, Object> NEAR_LOUVRE = Map.of("lat", 48.8650, "lng", 2.3300, "heading", 90.5,
            "speed", 8.3, "accuracy", 12);
    private static final GeoPoint DRIVER_AT = new GeoPoint(48.8650, 2.3300);

    @BeforeEach
    void roads() {
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false));
    }

    /** The client's ride, accepted, with its pickup moved to the given time. */
    private UUID acceptedRide(Instant pickupAt) throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        // A short reserved range, so that several accepted test rides never overlap.
        jdbc.sql("update rides set status = 'accepted', pickup_at = :p, blocked_range = tstzrange(:p, :p + interval '1 minute') where id = :id")
                .param("p", pickupAt.atOffset(ZoneOffset.UTC)).param("id", id).update();
        return id;
    }

    private String tokenOf(UUID rideId) {
        return jdbc.sql("select access_token from rides where id = :id").param("id", rideId).query(String.class).single();
    }

    private void sendPosition() throws Exception {
        call(post("/api/driver/location"), ownerToken, NEAR_LOUVRE, 204);
    }

    @Test
    void onlyTheDriverSendsPositions() throws Exception {
        assertThat(errorOf(post("/api/driver/location"), null, NEAR_LOUVRE, 401)).isEqualTo("UNAUTHENTICATED");
        assertThat(errorOf(post("/api/driver/location"), clientToken, NEAR_LOUVRE, 403)).isEqualTo("FORBIDDEN");

        sendPosition();
        call(post("/api/driver/location"), ownerToken, Map.of("lat", 48.87, "lng", 2.31), 204); // optional fields
        var row = jdbc.sql("select count(*) from driver_positions where driver_id = :d").param("d", DRIVER)
                .query(Integer.class).single();
        assertThat(row).as("only the latest position is kept").isEqualTo(1);

        for (var bad : new Map<?, ?>[] {
                Map.of("lat", 91, "lng", 2.3), Map.of("lat", 48.8, "lng", -181), Map.of("lng", 2.3),
                Map.of("lat", 48.8, "lng", 2.3, "heading", 360), Map.of("lat", 48.8, "lng", 2.3, "speed", -1),
                Map.of("lat", 48.8, "lng", 2.3, "accuracy", -5)}) {
            assertThat(errorOf(post("/api/driver/location"), ownerToken, bad, 400)).as(bad.toString()).isEqualTo("BAD_INPUT");
        }
    }

    @Test
    void theCustomerSeesTheDriverOnlyAroundAnAcceptedRide() throws Exception {
        sendPosition();

        // Still a request (not accepted): nothing
        var requested = bookId(clientToken, ride(slot(10)));
        call(get("/api/public/bookings/" + tokenOf(requested) + "/driver"), null, null, 204);

        // Accepted, but pickup in 3 hours: too early
        var later = acceptedRide(Instant.now().plus(Duration.ofHours(3)));
        call(get("/api/public/bookings/" + tokenOf(later) + "/driver"), null, null, 204);
        call(get("/api/rides/" + later + "/driver-location"), clientToken, null, 204);

        // Accepted, pickup in 30 minutes, fresh position: shown, ETA to the pickup
        var soon = acceptedRide(Instant.now().plus(Duration.ofMinutes(30)));
        var seen = call(get("/api/public/bookings/" + tokenOf(soon) + "/driver"), null, null, 200);
        assertThat(seen.get("lat").asDouble()).isEqualTo(48.8650);
        assertThat(seen.get("lng").asDouble()).isEqualTo(2.3300);
        assertThat(seen.get("heading").asDouble()).isEqualTo(90.5);
        assertThat(Instant.parse(seen.get("updated_at").asString())).isBefore(Instant.now().plusSeconds(1));
        assertThat(seen.get("eta_to").asString()).isEqualTo("pickup");
        assertThat(seen.get("eta_s").asInt()).isEqualTo(900);
        assertThat(seen.get("distance_m").asInt()).isEqualTo(4000);
        assertThat(seen.has("speed")).isFalse();

        // Polling again within 30 s reuses the ETA: the map server is asked once
        var louvre = new GeoPoint(48.8606, 2.3376);
        call(get("/api/rides/" + soon + "/driver-location"), clientToken, null, 200);
        verify(routing, times(1)).route(DRIVER_AT, louvre);

        // Stale position (driver's phone silent for 5 minutes): nothing
        jdbc.sql("update driver_positions set updated_at = now() - interval '5 minutes'").update();
        call(get("/api/public/bookings/" + tokenOf(soon) + "/driver"), null, null, 204);
    }

    @Test
    void afterPickupTheEtaIsToTheDropoff() throws Exception {
        sendPosition();
        var onBoard = acceptedRide(Instant.now().minus(Duration.ofMinutes(15)));
        var seen = call(get("/api/rides/" + onBoard + "/driver-location"), clientToken, null, 200);
        assertThat(seen.get("eta_to").asString()).isEqualTo("dropoff");
        verify(routing).route(DRIVER_AT, new GeoPoint(48.8738, 2.2950));

        // Map server down: position shown, no ETA
        var other = acceptedRide(Instant.now().minus(Duration.ofMinutes(20)));
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(5000, 1500, true));
        var noEta = call(get("/api/rides/" + other + "/driver-location"), clientToken, null, 200);
        assertThat(noEta.get("eta_s").isNull()).isTrue();
        assertThat(noEta.get("distance_m").isNull()).isTrue();

        // Long after the end of the ride: nothing
        jdbc.sql("update rides set pickup_at = now() - interval '3 hours' where id = :id").param("id", onBoard).update();
        call(get("/api/rides/" + onBoard + "/driver-location"), clientToken, null, 204);
    }

    @Test
    void onlyTheRidesCustomerAndStaffSeeIt() throws Exception {
        sendPosition();
        var id = acceptedRide(Instant.now().plus(Duration.ofMinutes(30)));
        call(get("/api/rides/" + id + "/driver-location"), clientToken, null, 200);
        call(get("/api/rides/" + id + "/driver-location"), ownerToken, null, 200);

        var stranger = signUp("other@taxi.test", "Other Client", "+33633333333");
        assertThat(errorOf(get("/api/rides/" + id + "/driver-location"), stranger, null, 404)).isEqualTo("NOT_FOUND");
        assertThat(errorOf(get("/api/rides/" + id + "/driver-location"), null, null, 401)).isEqualTo("UNAUTHENTICATED");
        assertThat(errorOf(get("/api/public/bookings/" + "x".repeat(48) + "/driver"), null, null, 404))
                .isEqualTo("NOT_FOUND");
    }

    @Test
    void positionsAreErasedWithTheDriverAccount() throws Exception {
        sendPosition();
        var userId = jdbc.sql("select user_id from drivers where id = :d").param("d", DRIVER).query(UUID.class).single();
        events.publishEvent(new UserDeleting(userId));
        assertThat(jdbc.sql("select count(*) from driver_positions").query(Integer.class).single()).isZero();
    }
}
