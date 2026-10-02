package com.taxi.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.identity.Owners;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base for tests that go through the real HTTP API and database.
 * Each test starts from an empty database with one driver, example prices and working hours.
 */
@SpringBootTest(properties = {
        "taxi.security.jwt-secret=integration-test-secret-0123456789abcdef",
        "taxi.scheduling.enabled=false",
        "taxi.push.enabled=false",
        "taxi.public.max-bookings-per-hour=1000",
        "taxi.public.max-quotes-per-hour=1000",
        "taxi.auth.max-signups-per-hour=100000",
        "taxi.auth.max-logins-per-hour=100000",
        "taxi.auth.max-logins-per-account-per-15-min=100000",
})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public abstract class IntegrationTest {

    protected static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    public static final UUID DRIVER = UUID.fromString("00000000-0000-0000-0000-00000000d001");
    protected static final UUID PARIS_ZONE = UUID.fromString("00000000-0000-0000-0000-0000000a0001");
    protected static final UUID CDG = UUID.fromString("00000000-0000-0000-0000-0000000a0002");

    // Louvre -> Arc de Triomphe, and CDG airport
    protected static final Map<String, Object> LOUVRE = place(48.8606, 2.3376, "Louvre");
    protected static final Map<String, Object> ARC = place(48.8738, 2.2950, "Arc de Triomphe");
    protected static final Map<String, Object> CDG_T2 = place(49.0097, 2.5479, "CDG Terminal 2");

    @Autowired protected MockMvc mvc;
    @Autowired protected JsonMapper json;
    @Autowired protected JdbcClient jdbc;
    @Autowired protected Owners owners;

    protected String ownerToken;
    protected String clientToken;
    protected UUID clientId;

    @BeforeEach
    void resetDatabase() throws Exception {
        jdbc.sql("""
                truncate notifications, push_tokens, ride_events, rides, contact_notes, contacts, time_off,
                  working_hours, surcharges, fixed_prices, zones, pricing_settings, drivers, refresh_tokens,
                  user_roles, users, customer_messages cascade""").update();
        jdbc.sql("delete from business_profile").update();
        jdbc.sql("insert into business_profile default values").update();

        jdbc.sql("insert into drivers (id, display_name, phone) values (:id, 'My Taxi', '+33600000000')")
                .param("id", DRIVER).update();
        jdbc.sql("""
                insert into pricing_settings (driver_id, licence, base_fare, per_km, per_minute, minimum_fare)
                values (:d, 'vtc', 5.00, 1.60, 0.40, 20.00)""").param("d", DRIVER).update();
        // Monday to Saturday 06:00 - 22:00
        jdbc.sql("insert into working_hours (driver_id, weekday, start_time, end_time) select :d, w, '06:00', '22:00' from generate_series(1, 6) w")
                .param("d", DRIVER).update();
        jdbc.sql("""
                insert into zones (id, name, kind, center_lat, center_lng, radius_m) values
                  (:p, 'Paris', 'other', 48.8566, 2.3522, 6000),
                  (:c, 'CDG', 'airport', 49.0097, 2.5479, 3000)""").param("p", PARIS_ZONE).param("c", CDG).update();
        jdbc.sql("insert into fixed_prices (driver_id, from_zone, to_zone, price) values (:d, :p, :c, 65.00)")
                .param("d", DRIVER).param("p", PARIS_ZONE).param("c", CDG).update();
        jdbc.sql("""
                insert into surcharges (driver_id, name, days, start_time, end_time, percent) values
                  (:d, 'Night', '{0,1,2,3,4,5,6}', '20:00', '07:00', 15),
                  (:d, 'Sunday', '{0}', '00:00', '23:59', 10)""").param("d", DRIVER).update();

        signUp("owner@taxi.test", "Owner Driver", null);
        owners.makeOwner("owner@taxi.test");
        ownerToken = login("owner@taxi.test"); // new token carries the new roles
        clientToken = signUp("client@taxi.test", "Test Client", "+33611111111");
        clientId = UUID.fromString(call(get("/api/me"), clientToken, null, 200).get("id").asString());
    }

    // ------------------------------------------------------------------ time

    /** Next week's Tuesday at 00:00 Paris time, plus the given hours (always in the future). */
    protected static Instant slot(double hours) {
        var tuesday = LocalDate.now(PARIS).plusWeeks(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).plusDays(1);
        return tuesday.atStartOfDay(PARIS).toInstant().plusSeconds(Math.round(hours * 3600));
    }

    // ------------------------------------------------------------------ requests

    protected static Map<String, Object> place(double lat, double lng, String address) {
        return Map.of("lat", lat, "lng", lng, "address", address);
    }

    protected static Map<String, Object> ride(Instant pickupAt, Object... extra) {
        var m = new LinkedHashMap<String, Object>();
        m.put("pickup_at", pickupAt.toString());
        m.put("pickup", LOUVRE);
        m.put("dropoff", ARC);
        for (int i = 0; i < extra.length; i += 2) {
            m.put((String) extra[i], extra[i + 1]);
        }
        return m;
    }

    protected JsonNode book(String token, Map<String, Object> ride, boolean dryRun, boolean override) throws Exception {
        return call(post("/api/rides"), token, Map.of("ride", ride, "dry_run", dryRun, "override", override), 200);
    }

    protected JsonNode book(String token, Map<String, Object> ride) throws Exception {
        return book(token, ride, false, false);
    }

    protected UUID bookId(String token, Map<String, Object> ride) throws Exception {
        var r = book(token, ride);
        if (!r.get("ok").asBoolean()) {
            throw new AssertionError("booking refused: " + r);
        }
        return UUID.fromString(r.get("ride_id").asString());
    }

    /** Performs a request and checks the status; returns the JSON body (or null when empty). */
    protected JsonNode call(MockHttpServletRequestBuilder request, String token, Object body, int expectedStatus)
            throws Exception {
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        var result = mvc.perform(request).andReturn().getResponse();
        var text = result.getContentAsString();
        if (result.getStatus() != expectedStatus) {
            throw new AssertionError("expected HTTP " + expectedStatus + " but got " + result.getStatus() + ": " + text);
        }
        return text.isBlank() ? null : json.readTree(text);
    }

    protected String errorOf(MockHttpServletRequestBuilder request, String token, Object body, int status) throws Exception {
        return call(request, token, body, status).get("error").asString();
    }

    protected String signUp(String email, String name, String phone) throws Exception {
        var body = new LinkedHashMap<String, Object>();
        body.put("email", email);
        body.put("password", "password123");
        body.put("full_name", name);
        body.put("phone", phone);
        return call(post("/api/auth/signup"), null, body, 201).get("access_token").asString();
    }

    protected String login(String email) throws Exception {
        return call(post("/api/auth/login"), null, Map.of("email", email, "password", "password123"), 200)
                .get("access_token").asString();
    }

    protected String status(UUID rideId) {
        return jdbc.sql("select status from rides where id = :id").param("id", rideId).query(String.class).single();
    }

    protected UUID contactOf(UUID userId) {
        return jdbc.sql("select id from contacts where user_id = :u").param("u", userId).query(UUID.class).single();
    }
}
