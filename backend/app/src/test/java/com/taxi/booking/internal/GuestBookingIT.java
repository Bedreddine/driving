package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.taxi.shared.RateLimiter;
import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** Booking from the business-card QR code: no account, a private link per ride, emails to the client. */
class GuestBookingIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;
    @Autowired RateLimiter limiter;

    @BeforeEach
    void roads() {
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false));
    }

    private static Map<String, Object> client(String name, String phone, String email, String language) {
        var c = new LinkedHashMap<String, Object>();
        c.put("full_name", name);
        c.put("phone", phone);
        c.put("email", email);
        c.put("language", language);
        return c;
    }

    private static final Map<String, Object> VIP = client("Mr Smith", "+44 7700 900123", "smith@example.com", "en");

    private JsonNode guestBook(Map<String, Object> client, Map<String, Object> ride, boolean dryRun) throws Exception {
        return call(post("/api/public/bookings"), null, Map.of("client", client, "ride", ride, "dry_run", dryRun), 200);
    }

    private String token(JsonNode result) {
        assertThat(result.get("ok").asBoolean()).as(result.toString()).isTrue();
        return result.get("access_token").asString();
    }

    private List<Map<String, Object>> emails() {
        eventsDelivered();
        return jdbc.sql("select recipient, subject, body from customer_messages where channel = 'email' order by id")
                .query().listOfRows();
    }

    @Test
    void aGuestBooksWithoutAnAccountAndFollowsTheRideByItsLink() throws Exception {
        var quote = guestBook(VIP, ride(slot(10), "dropoff", CDG_T2), true);
        assertThat(quote.get("estimate").decimalValue()).isEqualByComparingTo("65.00");
        assertThat(quote.get("access_token").isNull()).isTrue(); // nothing booked yet
        assertThat(jdbc.sql("select count(*) from contacts where email = 'smith@example.com'").query(Integer.class).single())
                .as("a price check creates no customer record").isZero();

        var token = token(guestBook(VIP, ride(slot(10), "dropoff", CDG_T2, "travel_ref", "BA304", "meet_greet", true), false));
        var page = call(get("/api/public/bookings/" + token), null, null, 200);
        assertThat(page.get("status").asString()).isEqualTo("requested");
        assertThat(page.get("client_name").asString()).isEqualTo("Mr Smith");
        assertThat(page.get("travel_ref").asString()).isEqualTo("BA304");
        assertThat(page.has("contact_id")).isFalse(); // no internal ids on the public page

        var contact = jdbc.sql("select language, user_id is null as guest from contacts where email = 'smith@example.com'")
                .query().singleRow();
        assertThat(contact).containsEntry("language", "en").containsEntry("guest", true);

        // The driver sees the request like any other
        eventsDelivered();
        assertThat(call(get("/api/notifications"), ownerToken, null, 200).get(0).get("kind").asString()).isEqualTo("new_request");
        // The client gets a confirmation email in English
        assertThat(emails()).singleElement().satisfies(m -> {
            assertThat(m.get("recipient")).isEqualTo("smith@example.com");
            assertThat((String) m.get("subject")).isEqualTo("Élysée Chauffeur – Booking request received");
        });
        // No SMS: they cost money and are off until a provider is chosen
        assertThat(jdbc.sql("select count(*) from customer_messages where channel = 'sms'").query(Integer.class).single()).isZero();
    }

    @Test
    void emailsContainThePrivateLinkOnceTheWebsiteAddressIsSet() throws Exception {
        call(put("/api/admin/business"), ownerToken, Map.of("name", "Élysée Chauffeur",
                "tagline_fr", "Votre chauffeur privé à Paris", "tagline_en", "Your private driver in Paris",
                "phone", "+33600000000", "site_url", "https://elysee-chauffeur.example/"), 200);
        var token = token(guestBook(VIP, ride(slot(10)), false));
        var rideId = jdbc.sql("select id from rides where access_token = :t").param("t", token).query(java.util.UUID.class).single();

        call(post("/api/rides/" + rideId + "/accept"), ownerToken, null, 204);

        var confirmed = emails().getLast();
        assertThat((String) confirmed.get("subject")).endsWith("Your ride is confirmed");
        assertThat((String) confirmed.get("body"))
                .contains("https://elysee-chauffeur.example/b/" + token)
                .contains("Questions? Call +33600000000");
        assertThat(call(get("/api/public/bookings/" + token), null, null, 200).get("status").asString()).isEqualTo("accepted");
    }

    @Test
    void aGuestAnswersAPriceProposalFromTheLink() throws Exception {
        var token = token(guestBook(VIP, ride(slot(58)), false));
        var rideId = jdbc.sql("select id from rides where access_token = :t").param("t", token).query(java.util.UUID.class).single();
        call(post("/api/rides/" + rideId + "/propose-price"), ownerToken, Map.of("price", 90), 204);
        assertThat(emails().getLast().get("body").toString()).contains("The driver proposes €90");

        call(post("/api/public/bookings/" + token + "/respond"), null, Map.of("accept", true), 204);
        assertThat(emails().getLast().get("subject").toString()).endsWith("Your ride is confirmed");
        var page = call(get("/api/public/bookings/" + token), null, null, 200);
        assertThat(page.get("status").asString()).isEqualTo("accepted");
        assertThat(page.get("agreed_price").decimalValue()).isEqualByComparingTo("90");
    }

    @Test
    void aGuestCancelsFromTheLinkAndTheDriverIsTold() throws Exception {
        var token = token(guestBook(VIP, ride(slot(10)), false));
        call(post("/api/public/bookings/" + token + "/cancel"), null, null, 204);
        assertThat(call(get("/api/public/bookings/" + token), null, null, 200).get("status").asString()).isEqualTo("cancelled");
        eventsDelivered();
        assertThat(call(get("/api/notifications"), ownerToken, null, 200).get(0).get("kind").asString())
                .isEqualTo("ride_cancelled_by_customer");
        assertThat(emails().getLast().get("subject").toString()).endsWith("Cancellation confirmed");
        call(post("/api/public/bookings/" + token + "/cancel"), null, null, 409); // already cancelled
    }

    @Test
    void thePriceCanBeCheckedBeforeTypingAnyDetails() throws Exception {
        var quote = call(post("/api/public/bookings"), null, Map.of("ride", ride(slot(10)), "dry_run", true), 200);
        assertThat(quote.get("ok").asBoolean()).isTrue();
        assertThat(quote.get("estimate").decimalValue()).isEqualByComparingTo("20.00");
        assertThat(errorOf(post("/api/public/bookings"), null, Map.of("ride", ride(slot(10))), 400)).isEqualTo("BAD_INPUT");
    }

    @Test
    void theQuoteAndTheBookingCarryTheRoadForTheMap() throws Exception {
        var road = List.of(new double[] {2.3376, 48.8606}, new double[] {2.31, 48.87}, new double[] {2.295, 48.8738});
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false, road));

        var quote = call(post("/api/public/bookings"), null, Map.of("ride", ride(slot(10)), "dry_run", true), 200);
        var route = quote.get("route");
        assertThat(route.size()).isEqualTo(3);
        assertThat(route.get(0).get(0).asDouble()).isEqualTo(2.3376); // [lng, lat]
        assertThat(route.get(0).get(1).asDouble()).isEqualTo(48.8606);
        assertThat(route.get(2).get(0).asDouble()).isEqualTo(2.295);
        var booked = guestBook(VIP, ride(slot(10)), false);
        assertThat(booked.get("route").size()).isEqualTo(3);

        // The private ride page draws the same road between the two points.
        var page = call(get("/api/public/bookings/" + token(booked)), null, null, 200);
        assertThat(page.get("pickup").get("lat").asDouble()).isEqualTo(48.8606);
        assertThat(page.get("pickup").get("lng").asDouble()).isEqualTo(2.3376);
        assertThat(page.get("dropoff").get("lat").asDouble()).isEqualTo(48.8738);
        assertThat(page.get("dropoff").get("lng").asDouble()).isEqualTo(2.2950);
        assertThat(page.get("route").size()).isEqualTo(3);
        assertThat(page.get("route").get(1).get(0).asDouble()).isEqualTo(2.31);

        // Map server down: an estimate, no road to draw.
        when(routing.route(any(), any())).thenAnswer(i -> RoutingClient.fallback(i.getArgument(0), i.getArgument(1)));
        var estimated = call(post("/api/public/bookings"), null, Map.of("ride", ride(slot(30)), "dry_run", true), 200);
        assertThat(estimated.get("route_estimated").asBoolean()).isTrue();
        assertThat(estimated.get("route").isNull()).isTrue();
        var noRoad = token(guestBook(VIP, ride(slot(30)), false));
        assertThat(call(get("/api/public/bookings/" + noRoad), null, null, 200).get("route").isNull()).isTrue();
    }

    @Test
    void wrongLinksShowNothing() throws Exception {
        call(get("/api/public/bookings/not-a-real-token-0000000000000000000000"), null, null, 404);
        call(post("/api/public/bookings/short/cancel"), null, null, 404);
    }

    @Test
    void aReturningGuestKeepsOneCustomerRecord() throws Exception {
        token(guestBook(VIP, ride(slot(10)), false));
        // Same person, phone typed differently: still one record. What the driver has on file is kept
        // (whoever knows someone's email and phone must not be able to change it); the typed values live on the ride.
        token(guestBook(client("Someone Else", "+447700900123", "SMITH@example.com", "fr"), ride(slot(58)), false));
        var contacts = jdbc.sql("select full_name, language from contacts where lower(email) = 'smith@example.com'").query().listOfRows();
        assertThat(contacts).singleElement().satisfies(c -> assertThat(c).containsEntry("full_name", "Mr Smith").containsEntry("language", "en"));

        // A different phone with the same email is another person (or a typo): a separate record, the driver can link them.
        token(guestBook(client("Mrs Smith", "+44 7700 900999", "smith@example.com", "en"), ride(slot(82)), false));
        assertThat(jdbc.sql("select count(*) from contacts where lower(email) = 'smith@example.com'").query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void theRidePageShowsOnlyWhatWasTypedInThatBookingNotTheMatchedContact() throws Exception {
        // First-time guest: sees their own name.
        var own = token(guestBook(VIP, ride(slot(10)), false));
        assertThat(call(get("/api/public/bookings/" + own), null, null, 200).get("client_name").asString()).isEqualTo("Mr Smith");
        var before = jdbc.sql("select id, full_name, email, phone, language, updated_at from contacts where lower(email) = 'smith@example.com'")
                .query().singleRow();

        // Someone who knows the victim's email and phone books under another name.
        var other = token(guestBook(client("Eve Attacker", "+44 7700-900123", "Smith@Example.com", "fr"),
                ride(slot(58)), false));
        var page = call(get("/api/public/bookings/" + other), null, null, 200);
        assertThat(page.get("client_name").asString()).isEqualTo("Eve Attacker");
        assertThat(page.toString()).doesNotContain("Mr Smith").doesNotContain("smith@example.com");

        // Same customer record (one history for the driver), left exactly as it was.
        var after = jdbc.sql("select id, full_name, email, phone, language, updated_at from contacts where lower(email) = 'smith@example.com'")
                .query().singleRow();
        assertThat(after).isEqualTo(before);
        assertThat(jdbc.sql("select count(distinct contact_id) from rides where access_token in (:a, :b)")
                .param("a", own).param("b", other).query(Integer.class).single()).isEqualTo(1);

        // The email for that ride greets the typed name, in the typed language, never the name on file.
        var mail = emails().getLast();
        assertThat((String) mail.get("body")).startsWith("Bonjour Eve Attacker,").doesNotContain("Mr Smith");
        // The first ride is unchanged.
        assertThat(call(get("/api/public/bookings/" + own), null, null, 200).get("client_name").asString()).isEqualTo("Mr Smith");
    }

    @Test
    void ridesWithoutATypedNameShowNoNameOnTheirPage() throws Exception {
        // A guest ride booked before V11 (no guest_name): no name rather than the contact's.
        var token = token(guestBook(VIP, ride(slot(10)), false));
        jdbc.sql("update rides set guest_name = null, guest_language = null where access_token = :t").param("t", token).update();
        var name = call(get("/api/public/bookings/" + token), null, null, 200).path("client_name");
        assertThat(name.isNull() || name.isMissingNode()).as(name.toString()).isTrue();
    }

    @Test
    void guestsFollowTheSameRulesAsCustomers() throws Exception {
        var shortNotice = guestBook(VIP, ride(java.time.Instant.now().plus(Duration.ofHours(1))), false);
        assertThat(shortNotice.get("errors").toString()).contains("TOO_SHORT_NOTICE");
        var tooMany = guestBook(VIP, ride(slot(10), "passengers", 6), false);
        assertThat(tooMany.get("errors").toString()).contains("OVER_CAPACITY");

        var contact = jdbc.sql("insert into contacts (full_name) values ('x') returning id").query(java.util.UUID.class).single();
        assertThat(errorOf(post("/api/public/bookings"), null, Map.of("client", VIP,
                "ride", ride(slot(10), "mode", "quick_add", "contact_id", contact.toString())), 403)).isEqualTo("FORBIDDEN");
    }

    @Test
    void clientDetailsAreChecked() throws Exception {
        for (var bad : List.of(
                client("", "+33611111111", "a@b.fr", "fr"),
                client("Name", "call me", "a@b.fr", "fr"),
                client("Name", "+33611111111", "not-an-email", "fr"),
                client("Name", "+33611111111", "a@b.fr", "de"))) {
            assertThat(errorOf(post("/api/public/bookings"), null, Map.of("client", bad, "ride", ride(slot(10))), 400))
                    .isEqualTo("BAD_INPUT");
        }
    }

    @Test
    void theRateLimiterStopsFloods() {
        var key = "test:" + System.nanoTime();
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.allow(key, 3, Duration.ofHours(1))).isTrue();
        }
        assertThat(limiter.allow(key, 3, Duration.ofHours(1))).isFalse();
        assertThat(limiter.allow("other:" + key, 3, Duration.ofHours(1))).isTrue();
    }

    @Test
    void theBusinessProfileIsPublicButOnlyTheOwnerEditsIt() throws Exception {
        var business = call(get("/api/public/business"), null, null, 200);
        assertThat(business.get("name").asString()).isEqualTo("Élysée Chauffeur");
        assertThat(business.get("tagline_en").asString()).isEqualTo("Your private driver in Paris");
        call(put("/api/admin/business"), clientToken, Map.of("name", "Hacked", "tagline_fr", "x", "tagline_en", "x"), 403);
        assertThat(errorOf(put("/api/admin/business"), ownerToken,
                Map.of("name", "X", "tagline_fr", "x", "tagline_en", "x", "site_url", "javascript:alert(1)"), 400)).isEqualTo("BAD_INPUT");

        var driver = call(get("/api/public/driver"), null, null, 200);
        assertThat(driver.get("seats").asInt()).isEqualTo(4);
        assertThat(driver.get("phone").asString()).isEqualTo("+33600000000");
    }
}
