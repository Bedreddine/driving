package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.shared.GeoPoint;
import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** Booking rules: prices, availability, capacity, hours, time off, overlaps, quick-add. */
class BookingIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;

    @BeforeEach
    void roads() {
        // Every trip: 4 km, 15 min, unless a test says otherwise.
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false));
    }

    private static boolean has(JsonNode array, String code) {
        for (var n : array) {
            if (code.equals(n.asString())) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> quickAdd(Instant at, UUID contact, Object... extra) {
        var args = new Object[extra.length + 4];
        args[0] = "mode";
        args[1] = "quick_add";
        args[2] = "contact_id";
        args[3] = contact.toString();
        System.arraycopy(extra, 0, args, 4, extra.length);
        return ride(at, args);
    }

    private UUID phoneContact() throws Exception {
        var c = call(post("/api/contacts"), ownerToken,
                Map.of("full_name", "Phone Customer", "phone", "+33622222222", "notice_given", true), 201);
        return UUID.fromString(c.get("id").asString());
    }

    // ------------------------------------------------------------------ prices

    @Test
    void quoteUsesTheFormulaAndMinimumFare() throws Exception {
        var q = book(clientToken, ride(slot(10)), true, false);
        assertThat(q.get("ok").asBoolean()).isTrue();
        assertThat(q.get("estimate").decimalValue()).isEqualByComparingTo("20.00"); // 17.40 -> minimum 20
        assertThat(q.get("is_fixed").asBoolean()).isFalse();
        assertThat(q.get("licence").asString()).isEqualTo("vtc");

        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(10_000, 1200, false));
        assertThat(book(clientToken, ride(slot(10)), true, false).get("estimate").decimalValue())
                .isEqualByComparingTo("29.00"); // 5 + 16 + 8
        assertThat(book(clientToken, ride(slot(21)), true, false).get("estimate").decimalValue())
                .isEqualByComparingTo("33.35"); // night +15%
    }

    @Test
    void parisToAirportUsesTheFixedPriceAndAirportWait() throws Exception {
        var q = book(clientToken, ride(slot(10), "dropoff", CDG_T2), true, false);
        assertThat(q.get("estimate").decimalValue()).isEqualByComparingTo("65.00");
        assertThat(q.get("is_fixed").asBoolean()).isTrue();

        var fromAirport = book(clientToken, ride(slot(10), "pickup", CDG_T2, "dropoff", LOUVRE), true, false);
        assertThat(fromAirport.get("estimate").decimalValue()).isEqualByComparingTo("65.00"); // both directions
        assertThat(fromAirport.get("pickup_allowance_min").asInt()).isEqualTo(45);

        var withFlight = book(clientToken, ride(slot(10), "travel_ref", "AF1234", "meet_greet", true), true, false);
        assertThat(withFlight.get("pickup_allowance_min").asInt()).isEqualTo(60); // 45 + 15
    }

    // ------------------------------------------------------------------ customer requests

    @Test
    void customerRequestIsPendingAndTheDriverIsNotified() throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        assertThat(status(id)).isEqualTo("requested");
        var deadline = jdbc.sql("select answer_deadline is not null from rides where id = :id").param("id", id)
                .query(Boolean.class).single();
        assertThat(deadline).isTrue();

        var notes = call(get("/api/notifications"), ownerToken, null, 200);
        assertThat(notes.get(0).get("kind").asString()).isEqualTo("new_request");
    }

    @Test
    void customerRulesAreHard() throws Exception {
        assertThat(has(book(clientToken, ride(Instant.now().plus(Duration.ofHours(1)))).get("errors"), "TOO_SHORT_NOTICE")).isTrue();
        assertThat(has(book(clientToken, ride(Instant.now().minus(Duration.ofHours(1)))).get("errors"), "PICKUP_IN_PAST")).isTrue();
        assertThat(has(book(clientToken, ride(slot(11), "passengers", 6)).get("errors"), "OVER_CAPACITY")).isTrue();
        assertThat(has(book(clientToken, ride(slot(11), "vehicle", "van")).get("errors"), "VEHICLE_UNAVAILABLE")).isTrue();
        assertThat(has(book(clientToken, ride(slot(23))).get("errors"), "OUTSIDE_HOURS")).isTrue();
        assertThat(has(book(clientToken, ride(slot(5 * 24 + 12))).get("errors"), "OUTSIDE_HOURS")).isTrue(); // Sunday

        call(post("/api/driver/time-off"), ownerToken,
                Map.of("starts_at", slot(34).toString(), "ends_at", slot(36).toString()), 201);
        assertThat(has(book(clientToken, ride(slot(34.5))).get("errors"), "DRIVER_UNAVAILABLE")).isTrue();

        assertThat(errorOf(post("/api/rides"), clientToken,
                Map.of("ride", ride(slot(10), "pickup", Map.of("lat", 123, "lng", 2, "address", "x"))), 400))
                .isEqualTo("BAD_INPUT");
    }

    // ------------------------------------------------------------------ driver quick-add

    @Test
    void quickAddAsksTheDriverToConfirmWarnings() throws Exception {
        var contact = phoneContact();
        var first = book(ownerToken, quickAdd(slot(14), contact, "passengers", 6));
        assertThat(first.get("ok").asBoolean()).isFalse();
        assertThat(first.get("needs_override").asBoolean()).isTrue();
        assertThat(has(first.get("warnings"), "OVER_CAPACITY")).isTrue();

        var confirmed = book(ownerToken, quickAdd(slot(14), contact, "passengers", 6), false, true);
        var id = UUID.fromString(confirmed.get("ride_id").asString());
        assertThat(status(id)).isEqualTo("accepted");
        var agreed = jdbc.sql("select agreed_price from rides where id = :id").param("id", id)
                .query(java.math.BigDecimal.class).single();
        assertThat(agreed).isEqualByComparingTo("20.00");

        call(post("/api/driver/time-off"), ownerToken,
                Map.of("starts_at", slot(34).toString(), "ends_at", slot(36).toString()), 201);
        assertThat(has(book(ownerToken, quickAdd(slot(34.5), contact)).get("warnings"), "DRIVER_UNAVAILABLE")).isTrue();
    }

    @Test
    void nobodyCanBookOverAConfirmedRide() throws Exception {
        var contact = phoneContact();
        book(ownerToken, quickAdd(slot(14), contact), false, true);

        assertThat(has(book(clientToken, ride(slot(14.1))).get("errors"), "SLOT_TAKEN")).isTrue();
        var driverTry = book(ownerToken, quickAdd(slot(14.1), contact), false, true);
        assertThat(has(driverTry.get("errors"), "SLOT_TAKEN")).isTrue();
        assertThat(driverTry.get("needs_override").asBoolean()).isFalse();
    }

    @Test
    void customersCannotQuickAdd() throws Exception {
        var contact = phoneContact();
        assertThat(errorOf(post("/api/rides"), clientToken, Map.of("ride", quickAdd(slot(15), contact)), 403))
                .isEqualTo("FORBIDDEN");
    }

    // ------------------------------------------------------------------ travel time between rides

    @Test
    void roadTimeFromThePreviousRideIsChecked() throws Exception {
        var contact = phoneContact();
        book(ownerToken, quickAdd(slot(14), contact), false, true); // ends 14:15, reserved until 14:30

        var previousDropoff = new GeoPoint(48.8738, 2.2950);
        var nextPickup = new GeoPoint(48.8606, 2.3376);
        when(routing.route(previousDropoff, nextPickup)).thenReturn(new RoutingClient.Route(8000, 1800, false));
        assertThat(has(book(clientToken, ride(slot(14 + 40 / 60.0))).get("errors"), "TIGHT_SCHEDULE")).isTrue();

        when(routing.route(previousDropoff, nextPickup)).thenReturn(new RoutingClient.Route(3000, 600, false));
        assertThat(book(clientToken, ride(slot(14 + 40 / 60.0)), true, false).get("ok").asBoolean()).isTrue();
    }

    @Test
    void scheduleChangingDuringTheMapLookupIsDetected() throws Exception {
        var contact = phoneContact();
        // While the (slow) map lookup runs, the driver confirms another ride just before.
        when(routing.route(any(), any())).thenAnswer(inv -> {
            if (jdbc.sql("select count(*) from rides").query(Integer.class).single() == 0) {
                jdbc.sql("""
                        insert into rides (contact_id, driver_id, source, status, pickup_at, pickup_address, pickup_lat,
                          pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_m, duration_s, blocked_range)
                        values (:c, :d, 'phone', 'accepted', :p, 'A', 48.85, 2.35, 'B', 48.86, 2.34, 1000, 300,
                          tstzrange(:p, :e))""")
                        .param("c", contact).param("d", DRIVER)
                        .param("p", slot(9).atOffset(java.time.ZoneOffset.UTC))
                        .param("e", slot(9.25).atOffset(java.time.ZoneOffset.UTC)).update();
            }
            return new RoutingClient.Route(4000, 900, false);
        });
        assertThat(has(book(clientToken, ride(slot(10))).get("errors"), "AVAILABILITY_CHANGED")).isTrue();
    }

    @Test
    void mapServerDownStillGivesACautiousEstimate() {
        var r = RoutingClient.fallback(new GeoPoint(48.8606, 2.3376), new GeoPoint(48.8738, 2.2950));
        assertThat(r.estimated()).isTrue();
        assertThat(r.durationS()).isGreaterThan(15 * 60);
    }

    @Test
    void ridesAreReturnedWithIsoDatesAndSnakeCase() throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        var list = call(get("/api/rides"), clientToken, null, 200);
        var first = list.get(0);
        assertThat(first.get("id").asString()).isEqualTo(id.toString());
        assertThat(Instant.parse(first.get("pickup_at").asString())).isEqualTo(slot(10));
        assertThat(first.get("contact").get("full_name").asString()).isEqualTo("Test Client");
        assertThat(first.get("status").asString()).isEqualTo("requested");
    }
}
