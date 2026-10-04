package com.taxi.booking.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

/** The day of the ride: the driver's moments told to the customer, and messages between driver and client. */
class RideDayIT extends IntegrationTest {

    @MockitoBean RoutingClient routing;
    @Autowired RideRepository rideRepository;

    private static final Map<String, Object> NEAR_LOUVRE = Map.of("lat", 48.8650, "lng", 2.3300); // about 750 m
    private static final Map<String, Object> AT_CDG = Map.of("lat", 49.0097, "lng", 2.5479); // about 25 km

    @BeforeEach
    void roads() {
        when(routing.route(any(), any())).thenReturn(new RoutingClient.Route(4000, 900, false));
    }

    // ------------------------------------------------------------------ helpers

    /** A guest ride (English-speaking guest "Alice Martin"); returns its private link token. */
    private String guestRide(Instant pickupAt) throws Exception {
        var client = new LinkedHashMap<String, Object>();
        client.put("full_name", "Alice Martin");
        client.put("phone", "+44 7700 900123");
        client.put("email", "alice@example.com");
        client.put("language", "en");
        var r = call(post("/api/public/bookings"), null, Map.of("client", client, "ride", ride(pickupAt)), 200);
        assertThat(r.get("ok").asBoolean()).as(r.toString()).isTrue();
        return r.get("access_token").asString();
    }

    private UUID idOf(String token) {
        return jdbc.sql("select id from rides where access_token = :t").param("t", token).query(UUID.class).single();
    }

    /** Accepted, with its pickup moved to the given time (and a short reserved range, so rides never overlap). */
    private void acceptedAt(UUID id, Instant pickupAt) {
        jdbc.sql("update rides set status = 'accepted', pickup_at = :p, blocked_range = tstzrange(:p, :p + interval '1 minute') where id = :id")
                .param("p", pickupAt.atOffset(ZoneOffset.UTC)).param("id", id).update();
    }

    private void moment(UUID rideId, String token, String kind, int status) throws Exception {
        call(post("/api/rides/" + rideId + "/moments"), token, Map.of("kind", kind), status);
    }

    private List<String> momentKinds(JsonNode ride) {
        return ride.get("moments").valueStream().map(m -> m.get("kind").asString()).toList();
    }

    private List<Map<String, Object>> emails() {
        eventsDelivered();
        return jdbc.sql("select subject, body from customer_messages where channel = 'email' order by id").query().listOfRows();
    }

    private JsonNode clientSays(String token, String body, int status) throws Exception {
        return call(post("/api/public/bookings/" + token + "/messages"), null, Map.of("body", body), status);
    }

    private int messageCount() {
        return jdbc.sql("select count(*) from ride_messages").query(Integer.class).single();
    }

    // ------------------------------------------------------------------ moments

    @Test
    void onlyTheDriverTellsMomentsAndOnlyOnAnAcceptedRide() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        assertThat(errorOf(post("/api/rides/" + id + "/moments"), ownerToken, Map.of("kind", "on_the_way"), 409))
                .isEqualTo("RIDE_NOT_ACTIVE"); // still a request

        call(post("/api/rides/" + id + "/accept"), ownerToken, null, 204);
        assertThat(errorOf(post("/api/rides/" + id + "/moments"), clientToken, Map.of("kind", "on_the_way"), 403))
                .isEqualTo("FORBIDDEN");
        assertThat(errorOf(post("/api/rides/" + id + "/moments"), null, Map.of("kind", "on_the_way"), 401))
                .isEqualTo("UNAUTHENTICATED");
        for (var bad : List.of(Map.of("kind", "arriving"), Map.of("kind", "flying"), Map.of())) {
            assertThat(errorOf(post("/api/rides/" + id + "/moments"), ownerToken, bad, 400)).as(bad.toString())
                    .isEqualTo("BAD_INPUT");
        }
        assertThat(errorOf(post("/api/rides/" + UUID.randomUUID() + "/moments"), ownerToken,
                Map.of("kind", "on_the_way"), 404)).isEqualTo("NOT_FOUND");

        var emailsBefore = emails().size();
        moment(id, ownerToken, "on_the_way", 204);
        moment(id, ownerToken, "on_the_way", 204); // repeated tap: nothing new
        assertThat(jdbc.sql("select count(*) from ride_moments where ride_id = :r").param("r", id).query(Integer.class).single())
                .isEqualTo(1);
        // Email only for "on the way", once
        assertThat(emails()).hasSize(emailsBefore + 1);
        assertThat((String) emails().getLast().get("subject")).endsWith("Your driver is on the way");
        assertThat((String) emails().getLast().get("body")).startsWith("Hello Alice Martin,").contains("Your driver is on the way.");

        moment(id, ownerToken, "arrived", 204);
        assertThat(emails()).as("no email when the driver arrives").hasSize(emailsBefore + 1);

        // Shown on the private ride page and in the staff ride detail, oldest first
        var page = call(get("/api/public/bookings/" + token), null, null, 200);
        assertThat(momentKinds(page)).containsExactly("on_the_way", "arrived");
        assertThat(Instant.parse(page.get("moments").get(0).get("at").asString())).isBefore(Instant.now().plusSeconds(1));
        assertThat(momentKinds(call(get("/api/rides/" + id), ownerToken, null, 200))).containsExactly("on_the_way", "arrived");

        // Not once the ride is over
        call(post("/api/rides/" + id + "/cancel"), ownerToken, Map.of("reason", "car broke down"), 204);
        assertThat(errorOf(post("/api/rides/" + id + "/moments"), ownerToken, Map.of("kind", "arrived"), 409))
                .isEqualTo("RIDE_NOT_ACTIVE");
    }

    @Test
    void customersWithAnAccountGetTheMomentsInTheApp() throws Exception {
        var id = bookId(clientToken, ride(slot(10)));
        call(post("/api/rides/" + id + "/accept"), ownerToken, null, 204);
        moment(id, ownerToken, "on_the_way", 204);
        eventsDelivered();
        var notices = call(get("/api/notifications"), clientToken, null, 200);
        assertThat(notices.get(0).get("kind").asString()).isEqualTo("driver_on_the_way");
        assertThat(notices.get(0).get("ride_id").asString()).isEqualTo(id.toString());
        assertThat(momentKinds(call(get("/api/rides/" + id), clientToken, null, 200))).containsExactly("on_the_way");
        // The customer cannot tell moments themselves
        call(post("/api/rides/" + id + "/moments"), clientToken, Map.of("kind", "arrived"), 403);
    }

    @Test
    void arrivingIsToldAutomaticallyWhenTheDriverComesNearThePickup() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        acceptedAt(id, Instant.now().plus(Duration.ofMinutes(30)));
        var emailsBefore = emails().size();

        call(post("/api/driver/location"), ownerToken, AT_CDG, 204); // far away
        assertThat(momentKinds(call(get("/api/public/bookings/" + token), null, null, 200))).isEmpty();

        call(post("/api/driver/location"), ownerToken, NEAR_LOUVRE, 204);
        call(post("/api/driver/location"), ownerToken, NEAR_LOUVRE, 204); // only once
        assertThat(momentKinds(call(get("/api/public/bookings/" + token), null, null, 200))).containsExactly("arriving");
        assertThat(emails()).as("no email for arriving").hasSize(emailsBefore);
    }

    @Test
    void arrivingIsNotToldOutsideTheLiveWindowNorAfterArrival() throws Exception {
        var later = guestRide(slot(10));
        acceptedAt(idOf(later), Instant.now().plus(Duration.ofHours(3)));
        var arrived = guestRide(slot(12));
        acceptedAt(idOf(arrived), Instant.now().plus(Duration.ofMinutes(20)));
        moment(idOf(arrived), ownerToken, "arrived", 204);

        call(post("/api/driver/location"), ownerToken, NEAR_LOUVRE, 204);
        assertThat(momentKinds(call(get("/api/public/bookings/" + later), null, null, 200))).isEmpty();
        assertThat(momentKinds(call(get("/api/public/bookings/" + arrived), null, null, 200))).containsExactly("arrived");
    }

    // ------------------------------------------------------------------ messages

    @Test
    void driverAndClientWriteToEachOther() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        assertThat(call(get("/api/public/bookings/" + token + "/messages"), null, null, 200).size()).isZero();

        var sent = clientSays(token, "  Hello, I'm at door B  ", 201);
        assertThat(sent.get("from").asString()).isEqualTo("client");
        assertThat(sent.get("body").asString()).isEqualTo("Hello, I'm at door B");
        assertThat(sent.get("id").asString()).hasSize(36);
        assertThat(sent.has("at")).isTrue();

        var seen = call(get("/api/rides/" + id + "/messages"), ownerToken, null, 200);
        assertThat(seen.size()).isEqualTo(1);
        assertThat(seen.get(0).get("body").asString()).isEqualTo("Hello, I'm at door B");

        var answer = call(post("/api/rides/" + id + "/messages"), ownerToken, Map.of("body", "On my way"), 201);
        assertThat(answer.get("from").asString()).isEqualTo("driver");

        var thread = call(get("/api/public/bookings/" + token + "/messages"), null, null, 200);
        assertThat(thread.valueStream().map(m -> m.get("from").asString() + ":" + m.get("body").asString()).toList())
                .containsExactly("client:Hello, I'm at door B", "driver:On my way");

        // The driver is told in the app (and by phone push), with the client's first name and the start of the text
        eventsDelivered();
        var notice = call(get("/api/notifications"), ownerToken, null, 200).get(0);
        assertThat(notice.get("kind").asString()).isEqualTo("ride_message");
        assertThat(notice.get("payload").get("from_name").asString()).isEqualTo("Alice");
        assertThat(notice.get("payload").get("preview").asString()).isEqualTo("Hello, I'm at door B");
        // Never by email
        assertThat(emails()).noneMatch(m -> m.get("body").toString().contains("door B"));
    }

    @Test
    void messagesAreChecked() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        for (var bad : List.of("", "   ", "x".repeat(501))) {
            assertThat(errorOf(post("/api/public/bookings/" + token + "/messages"), null, Map.of("body", bad), 400))
                    .isEqualTo("BAD_INPUT");
            assertThat(errorOf(post("/api/rides/" + id + "/messages"), ownerToken, Map.of("body", bad), 400))
                    .isEqualTo("BAD_INPUT");
        }
        assertThat(errorOf(post("/api/public/bookings/" + token + "/messages"), null, Map.of(), 400)).isEqualTo("BAD_INPUT");
        clientSays(token, "x".repeat(500), 201);

        var stranger = signUp("other@taxi.test", "Other Client", "+33633333333");
        assertThat(errorOf(get("/api/rides/" + id + "/messages"), stranger, null, 403)).isEqualTo("FORBIDDEN");
        assertThat(errorOf(post("/api/rides/" + id + "/messages"), stranger, Map.of("body", "hi"), 403)).isEqualTo("FORBIDDEN");
        assertThat(errorOf(get("/api/rides/" + id + "/messages"), null, null, 401)).isEqualTo("UNAUTHENTICATED");
        call(get("/api/public/bookings/" + "x".repeat(48) + "/messages"), null, null, 404);
        call(post("/api/public/bookings/" + "x".repeat(48) + "/messages"), null, Map.of("body", "hi"), 404);
    }

    @Test
    void messagesCloseWithTheRide() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        clientSays(token, "See you tomorrow", 201);
        call(post("/api/public/bookings/" + token + "/cancel"), null, null, 204);
        assertThat(errorOf(post("/api/public/bookings/" + token + "/messages"), null, Map.of("body", "hi"), 409))
                .isEqualTo("MESSAGES_CLOSED");
        assertThat(errorOf(post("/api/rides/" + id + "/messages"), ownerToken, Map.of("body", "hi"), 409))
                .isEqualTo("MESSAGES_CLOSED");
        assertThat(call(get("/api/public/bookings/" + token + "/messages"), null, null, 200).size()).isEqualTo(1);

        // Still accepted, but more than 12 hours after pickup
        var old = guestRide(slot(12));
        acceptedAt(idOf(old), Instant.now().minus(Duration.ofHours(13)));
        assertThat(errorOf(post("/api/public/bookings/" + old + "/messages"), null, Map.of("body", "hi"), 409))
                .isEqualTo("MESSAGES_CLOSED");
        acceptedAt(idOf(old), Instant.now().minus(Duration.ofHours(11)));
        clientSays(old, "Forgot my umbrella in the car", 201);
    }

    @Test
    void aRideLinkCannotFloodTheDriver() throws Exception {
        var token = guestRide(slot(10));
        for (int i = 0; i < 20; i++) {
            clientSays(token, "message " + i, 201);
        }
        assertThat(clientSays(token, "one more", 429).get("error").asString()).isEqualTo("TOO_MANY_REQUESTS");
        // The driver is not limited
        call(post("/api/rides/" + idOf(token) + "/messages"), ownerToken, Map.of("body", "Please call me"), 201);
    }

    @Test
    void messagesAreDeletedWithTheCustomersPersonalData() throws Exception {
        var token = guestRide(slot(10));
        var id = idOf(token);
        clientSays(token, "My flight is BA304", 201);
        call(post("/api/rides/" + id + "/messages"), ownerToken, Map.of("body", "Noted"), 201);
        var contact = jdbc.sql("select contact_id from rides where id = :id").param("id", id).query(UUID.class).single();

        call(post("/api/admin/contacts/" + contact + "/forget"), ownerToken, null, 204);
        assertThat(messageCount()).isZero();
        eventsDelivered();
        assertThat(jdbc.sql("select count(*) from notifications where kind = 'ride_message'").query(Integer.class).single())
                .as("notices quoting the conversation").isZero();
    }

    @Test
    void messagesAreKept90DaysAfterPickup() throws Exception {
        var token = guestRide(slot(10));
        clientSays(token, "Hello", 201);
        rideRepository.applyRetention();
        assertThat(messageCount()).isEqualTo(1);
        jdbc.sql("update rides set pickup_at = now() - interval '91 days', blocked_range = tstzrange(now() - interval '91 days', now() - interval '90 days') where access_token = :t")
                .param("t", token).update();
        rideRepository.applyRetention();
        assertThat(messageCount()).isZero();
    }

    @Test
    void browserPushIsOffWithoutKeysButTheEndpointsAnswer() throws Exception {
        assertThat(call(get("/api/public/web-push/key"), null, null, 200).get("public_key").isNull()).isTrue();
        var token = guestRide(slot(10));
        call(post("/api/public/bookings/" + token + "/web-push"), null, Map.of("endpoint", "https://fcm.googleapis.com/fcm/send/abc",
                "keys", Map.of("p256dh", "B" + "A".repeat(86), "auth", "A".repeat(22))), 204);
    }
}
