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
    void wrongLinksShowNothing() throws Exception {
        call(get("/api/public/bookings/not-a-real-token-0000000000000000000000"), null, null, 404);
        call(post("/api/public/bookings/short/cancel"), null, null, 404);
    }

    @Test
    void aReturningGuestKeepsOneCustomerRecord() throws Exception {
        token(guestBook(VIP, ride(slot(10)), false));
        // Same person, phone typed differently: still one record. The name the driver knows is kept
        // (whoever knows someone's email and phone must not be able to rename them); the language follows.
        token(guestBook(client("Someone Else", "+447700900123", "SMITH@example.com", "fr"), ride(slot(58)), false));
        var contacts = jdbc.sql("select full_name, language from contacts where lower(email) = 'smith@example.com'").query().listOfRows();
        assertThat(contacts).singleElement().satisfies(c -> assertThat(c).containsEntry("full_name", "Mr Smith").containsEntry("language", "fr"));

        // A different phone with the same email is another person (or a typo): a separate record, the driver can link them.
        token(guestBook(client("Mrs Smith", "+44 7700 900999", "smith@example.com", "en"), ride(slot(82)), false));
        assertThat(jdbc.sql("select count(*) from contacts where lower(email) = 'smith@example.com'").query(Integer.class).single()).isEqualTo(2);
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
