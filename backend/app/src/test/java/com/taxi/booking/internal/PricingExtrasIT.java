package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.taxi.support.IntegrationTest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** Driver-configurable prices: distance tiers, van, priced extras, the price breakdown and the simulator. */
class PricingExtrasIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;

    private static final String PRICING = "/api/admin/pricing/" + DRIVER;

    @BeforeEach
    void roads() {
        // Every trip: 10 km, 20 min -> 5 + 16 + 8 = 29.00 with the example prices
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(10_000, 1200, false));
    }

    /** The settings body an older app sends (no tiers, van or extras). */
    private static Map<String, Object> oldSettings() {
        var m = new LinkedHashMap<String, Object>();
        m.put("licence", "vtc");
        m.put("base_fare", 5);
        m.put("per_km", 1.6);
        m.put("per_minute", 0.4);
        m.put("minimum_fare", 20);
        m.put("airport_wait_minutes", 45);
        m.put("meet_greet_minutes", 15);
        m.put("min_gap_minutes", 15);
        m.put("lead_time_minutes", 180);
        return m;
    }

    private static Map<String, Object> settings(Object... extra) {
        var m = oldSettings();
        for (int i = 0; i < extra.length; i += 2) {
            m.put((String) extra[i], extra[i + 1]);
        }
        return m;
    }

    private static Map<String, Object> tier(double fromKm, double perKm) {
        return Map.of("from_km", fromKm, "per_km", perKm);
    }

    private static BigDecimal sum(JsonNode breakdown) {
        var total = BigDecimal.ZERO;
        for (var l : breakdown) {
            total = total.add(l.get("amount").decimalValue());
        }
        return total;
    }

    private static List<String> codes(JsonNode breakdown) {
        var codes = new ArrayList<String>();
        breakdown.forEach(l -> codes.add(l.get("code").asString()));
        return codes;
    }

    private JsonNode saveExtras() throws Exception {
        return call(put(PRICING + "/settings"), ownerToken, settings("meet_greet_fee", 10, "child_seat_fee", 5,
                "included_luggage", 2, "extra_luggage_fee", 2, "waiting_per_minute", 0.5), 200);
    }

    @Test
    void settingsRoundTripWithTiersAndExtras() throws Exception {
        var initial = call(get(PRICING), ownerToken, null, 200).get("settings");
        assertThat(initial.get("van_percent").asInt()).isEqualTo(100);
        assertThat(initial.get("included_luggage").asInt()).isEqualTo(3);
        assertThat(initial.get("distance_tiers").size()).isZero();
        assertThat(initial.get("meet_greet_fee").decimalValue()).isEqualByComparingTo("0");

        var saved = call(put(PRICING + "/settings"), ownerToken, settings("distance_tiers",
                List.of(tier(30, 1.0), tier(10, 1.2)), "van_percent", 130, "meet_greet_fee", 10, "child_seat_fee", 5,
                "included_luggage", 2, "extra_luggage_fee", 2.5, "waiting_per_minute", 0.5), 200);
        assertThat(saved.get("distance_tiers").get(0).get("from_km").decimalValue()).isEqualByComparingTo("10"); // sorted

        var read = call(get(PRICING), ownerToken, null, 200).get("settings");
        assertThat(read.get("distance_tiers").size()).isEqualTo(2);
        assertThat(read.get("distance_tiers").get(1).get("from_km").decimalValue()).isEqualByComparingTo("30");
        assertThat(read.get("distance_tiers").get(1).get("per_km").decimalValue()).isEqualByComparingTo("1.00");
        assertThat(read.get("van_percent").asInt()).isEqualTo(130);
        assertThat(read.get("extra_luggage_fee").decimalValue()).isEqualByComparingTo("2.50");
        assertThat(read.get("waiting_per_minute").decimalValue()).isEqualByComparingTo("0.50");

        // An older app sends only the old fields: the new ones are kept
        call(put(PRICING + "/settings"), ownerToken, oldSettings(), 200);
        var kept = call(get(PRICING), ownerToken, null, 200).get("settings");
        assertThat(kept.get("distance_tiers").size()).isEqualTo(2);
        assertThat(kept.get("van_percent").asInt()).isEqualTo(130);
        assertThat(kept.get("child_seat_fee").decimalValue()).isEqualByComparingTo("5");

        // An empty list removes the tiers
        call(put(PRICING + "/settings"), ownerToken, settings("distance_tiers", List.of()), 200);
        assertThat(call(get(PRICING), ownerToken, null, 200).get("settings").get("distance_tiers").size()).isZero();

        for (var bad : List.of(
                settings("distance_tiers", List.of(tier(10, 1), tier(10, 2))),           // same start twice
                settings("distance_tiers", List.of(tier(1, 1), tier(2, 1), tier(3, 1), tier(4, 1), tier(5, 1), tier(6, 1))),
                settings("distance_tiers", List.of(tier(0, 1))),
                settings("distance_tiers", List.of(tier(5, -1))),
                settings("van_percent", 40),
                settings("van_percent", 301),
                settings("included_luggage", 21),
                settings("child_seat_fee", -1))) {
            assertThat(errorOf(put(PRICING + "/settings"), ownerToken, bad, 400)).as(bad.toString()).isEqualTo("BAD_INPUT");
        }
        assertThat(errorOf(put(PRICING + "/settings"), clientToken, oldSettings(), 403)).isEqualTo("FORBIDDEN");
    }

    @Test
    void quotesCarryABreakdownAndRidesKeepTheirChildSeats() throws Exception {
        saveExtras();
        var ride = ride(slot(10), "child_seats", 2, "luggage", 3, "meet_greet", true);
        var q = book(clientToken, ride, true, false);
        assertThat(q.get("ok").asBoolean()).as(q.toString()).isTrue();
        // 29.00 + meet & greet 10 + 2 seats x 5 + 1 bag over 2 included x 2
        assertThat(q.get("estimate").decimalValue()).isEqualByComparingTo("51.00");
        var breakdown = q.get("breakdown");
        assertThat(codes(breakdown)).containsExactly("base", "distance", "time", "meet_greet", "child_seat", "extra_luggage");
        assertThat(sum(breakdown)).isEqualByComparingTo(q.get("estimate").decimalValue());
        assertThat(breakdown.get(1).get("quantity").asDouble()).isEqualTo(10.0);
        assertThat(breakdown.get(1).get("rate").asDouble()).isEqualTo(1.6);
        assertThat(breakdown.get(0).get("quantity").isNull()).isTrue();
        assertThat(breakdown.get(4).get("quantity").asInt()).isEqualTo(2);

        // Night surcharge: on the ride, not on the extras
        var night = book(clientToken, ride(slot(21), "child_seats", 1), true, false);
        assertThat(night.get("estimate").decimalValue()).isEqualByComparingTo("38.35"); // 33.35 + 5
        assertThat(codes(night.get("breakdown"))).containsExactly("base", "distance", "time", "surcharge", "child_seat");
        assertThat(night.get("breakdown").get(3).get("quantity").asDouble()).isEqualTo(15.0);
        assertThat(sum(night.get("breakdown"))).isEqualByComparingTo("38.35");

        // Fixed zone price
        var airport = book(clientToken, ride(slot(10), "dropoff", CDG_T2), true, false);
        assertThat(codes(airport.get("breakdown"))).containsExactly("fixed");

        var id = bookId(clientToken, ride);
        assertThat(jdbc.sql("select child_seats from rides where id = :id").param("id", id).query(Integer.class).single())
                .isEqualTo(2);
        assertThat(call(get("/api/rides/" + id), clientToken, null, 200).get("child_seats").asInt()).isEqualTo(2);
        assertThat(call(get("/api/rides"), ownerToken, null, 200).get(0).get("child_seats").asInt()).isEqualTo(2);
        var token = jdbc.sql("select access_token from rides where id = :id").param("id", id).query(String.class).single();
        assertThat(call(get("/api/public/bookings/" + token), null, null, 200).get("child_seats").asInt()).isEqualTo(2);

        // Guests get the same breakdown; too many child seats is refused
        var guest = call(post("/api/public/bookings"), null, Map.of("ride", ride, "dry_run", true), 200);
        assertThat(guest.get("estimate").decimalValue()).isEqualByComparingTo("51.00");
        assertThat(sum(guest.get("breakdown"))).isEqualByComparingTo("51.00");
        assertThat(errorOf(post("/api/public/bookings"), null,
                Map.of("ride", ride(slot(10), "child_seats", 4), "dry_run", true), 400)).isEqualTo("BAD_INPUT");

        // A ride without options has no child seats
        var plain = bookId(clientToken, ride(slot(14)));
        assertThat(call(get("/api/rides/" + plain), clientToken, null, 200).get("child_seats").asInt()).isZero();
    }

    @Test
    void driverQuickAddAcceptsChildSeats() throws Exception {
        var c = call(post("/api/contacts"), ownerToken,
                Map.of("full_name", "Phone Customer", "phone", "+33622222222", "notice_given", true), 201);
        var r = book(ownerToken, ride(slot(14), "mode", "quick_add", "contact_id", c.get("id").asString(),
                "child_seats", 1), false, true);
        var id = UUID.fromString(r.get("ride_id").asString());
        assertThat(call(get("/api/rides/" + id), ownerToken, null, 200).get("child_seats").asInt()).isEqualTo(1);
    }

    @Test
    void theSimulatorTriesUnsavedSettingsWithoutSavingThem() throws Exception {
        var body = new LinkedHashMap<String, Object>();
        body.put("pickup", Map.of("lat", 48.8606, "lng", 2.3376));
        body.put("dropoff", Map.of("lat", 48.8738, "lng", 2.2950));
        body.put("pickup_at", slot(10).toString());
        body.put("vehicle", "van");
        body.put("luggage", 0);
        body.put("child_seats", 0);
        body.put("meet_greet", false);

        var saved = call(post(PRICING + "/simulate"), ownerToken, body, 200);
        assertThat(saved.get("estimate").decimalValue()).isEqualByComparingTo("29.00");
        assertThat(saved.get("currency").asString()).isEqualTo("EUR");
        assertThat(saved.get("is_fixed").asBoolean()).isFalse();
        assertThat(saved.get("distance_m").asInt()).isEqualTo(10_000);
        assertThat(saved.get("duration_s").asInt()).isEqualTo(1200);
        assertThat(saved.get("route_estimated").asBoolean()).isFalse();
        assertThat(saved.get("route").isNull()).isTrue();

        // 5 + 5 km x 1.60 + 5 km x 1.00 + 8 = 26, van 150% = 39
        body.put("settings", settings("distance_tiers", List.of(tier(5, 1.0)), "van_percent", 150));
        var trial = call(post(PRICING + "/simulate"), ownerToken, body, 200);
        assertThat(trial.get("estimate").decimalValue()).isEqualByComparingTo("39.00");
        assertThat(codes(trial.get("breakdown"))).containsExactly("base", "distance", "distance", "time", "van");
        assertThat(trial.get("breakdown").get(4).get("amount").decimalValue()).isEqualByComparingTo("13.00");
        assertThat(trial.get("breakdown").get(4).get("quantity").asInt()).isEqualTo(150);
        assertThat(sum(trial.get("breakdown"))).isEqualByComparingTo("39.00");

        var after = call(get(PRICING), ownerToken, null, 200).get("settings");
        assertThat(after.get("van_percent").asInt()).as("nothing saved").isEqualTo(100);
        assertThat(after.get("distance_tiers").size()).isZero();

        // Sunday 23:00 is outside working hours: the simulator does not care
        body.put("pickup_at", slot(5 * 24 + 23).toString());
        body.remove("settings");
        assertThat(call(post(PRICING + "/simulate"), ownerToken, body, 200).get("estimate").decimalValue())
                .isEqualByComparingTo("33.35"); // 29 + 15% (night beats Sunday)

        body.put("settings", settings("van_percent", 20));
        assertThat(errorOf(post(PRICING + "/simulate"), ownerToken, body, 400)).isEqualTo("BAD_INPUT");
        assertThat(errorOf(post(PRICING + "/simulate"), clientToken, body, 403)).isEqualTo("FORBIDDEN");
        assertThat(errorOf(post("/api/admin/pricing/" + UUID.randomUUID() + "/simulate"), ownerToken, oldBody(body), 404))
                .isEqualTo("NOT_FOUND");
    }

    private static Map<String, Object> oldBody(Map<String, Object> body) {
        var copy = new LinkedHashMap<>(body);
        copy.remove("settings");
        return copy;
    }

    @Test
    void theBookingPageShowsThePricesOfOptions() throws Exception {
        var none = call(get("/api/public/driver"), null, null, 200).get("extras");
        assertThat(none.get("meet_greet_fee").decimalValue()).isEqualByComparingTo("0");
        assertThat(none.get("included_luggage").asInt()).isEqualTo(3);

        saveExtras();
        var extras = call(get("/api/public/driver"), null, null, 200).get("extras");
        assertThat(extras.get("meet_greet_fee").decimalValue()).isEqualByComparingTo("10");
        assertThat(extras.get("child_seat_fee").decimalValue()).isEqualByComparingTo("5");
        assertThat(extras.get("included_luggage").asInt()).isEqualTo(2);
        assertThat(extras.get("extra_luggage_fee").decimalValue()).isEqualByComparingTo("2");
        assertThat(extras.get("waiting_per_minute").decimalValue()).isEqualByComparingTo("0.5");
    }
}
