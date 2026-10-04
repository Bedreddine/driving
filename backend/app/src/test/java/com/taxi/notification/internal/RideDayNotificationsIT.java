package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.notification.VapidKeys;
import com.taxi.support.IntegrationTest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** Browser push for guests, and who is told about ride-day moments and messages. */
@TestPropertySource(properties = "taxi.routing.osrm-url=http://127.0.0.1:9") // no map server: cautious estimates
class RideDayNotificationsIT extends IntegrationTest {

    private static final VapidKeys KEYS = VapidKeys.generate();
    private static final String P256DH = VapidKeys.generate().publicKey(); // any P-256 point, like a browser's
    private static final String AUTH = "AAAAAAAAAAAAAAAAAAAAAA"; // 16 bytes
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-1";

    @DynamicPropertySource
    static void vapid(DynamicPropertyRegistry registry) {
        registry.add("taxi.web-push.public-key", KEYS::publicKey);
        registry.add("taxi.web-push.private-key", KEYS::privateKey);
    }

    @MockitoBean WebPushSender sender;
    @MockitoSpyBean LiveUpdates live;

    private String token;
    private UUID rideId;
    private UUID driverUser;

    @BeforeEach
    void guestRide() throws Exception {
        when(sender.send(anyString(), anyString(), anyString(), any())).thenReturn(201);
        var client = new LinkedHashMap<String, Object>();
        client.put("full_name", "Alice Martin");
        client.put("phone", "+44 7700 900123");
        client.put("email", "alice@example.com");
        client.put("language", "en");
        var r = call(post("/api/public/bookings"), null, Map.of("client", client, "ride", ride(slot(10))), 200);
        token = r.get("access_token").asString();
        rideId = jdbc.sql("select id from rides where access_token = :t").param("t", token).query(UUID.class).single();
        driverUser = jdbc.sql("select user_id from drivers where id = :d").param("d", DRIVER).query(UUID.class).single();
    }

    private static Map<String, Object> subscription(String endpoint, String p256dh, String auth) {
        return Map.of("endpoint", endpoint, "keys", Map.of("p256dh", p256dh, "auth", auth));
    }

    private void subscribe(String endpoint) throws Exception {
        call(post("/api/public/bookings/" + token + "/web-push"), null, subscription(endpoint, P256DH, AUTH), 204);
    }

    private List<String> endpoints() {
        return jdbc.sql("select endpoint from web_push_subscriptions order by created_at").query(String.class).list();
    }

    @Test
    void thePageGetsTheServerKeyAndRegistersTheBrowser() throws Exception {
        assertThat(call(get("/api/public/web-push/key"), null, null, 200).get("public_key").asString())
                .isEqualTo(KEYS.publicKey());

        subscribe(ENDPOINT);
        subscribe(ENDPOINT); // same browser again: updated, not doubled
        assertThat(endpoints()).containsExactly(ENDPOINT);

        // At most 5 browsers per ride: the oldest goes
        for (int i = 2; i <= 6; i++) {
            subscribe("https://updates.push.services.mozilla.com/wpush/v2/device-" + i);
        }
        assertThat(endpoints()).hasSize(5).doesNotContain(ENDPOINT);

        call(delete("/api/public/bookings/" + token + "/web-push"), null,
                Map.of("endpoint", "https://updates.push.services.mozilla.com/wpush/v2/device-6"), 204);
        assertThat(endpoints()).hasSize(4);
    }

    @Test
    void subscriptionsAreChecked() throws Exception {
        for (var bad : List.of(
                subscription("http://fcm.googleapis.com/fcm/send/x", P256DH, AUTH),
                subscription("https://127.0.0.1/push", P256DH, AUTH),
                subscription("https://fcm.googleapis.com/" + "x".repeat(1000), P256DH, AUTH),
                subscription(ENDPOINT, "short", AUTH),
                subscription(ENDPOINT, P256DH, "AAAA"),
                Map.of("endpoint", ENDPOINT))) {
            assertThat(errorOf(post("/api/public/bookings/" + token + "/web-push"), null, bad, 400)).isEqualTo("BAD_INPUT");
        }
        call(post("/api/public/bookings/" + "x".repeat(48) + "/web-push"), null, subscription(ENDPOINT, P256DH, AUTH), 404);
        assertThat(endpoints()).isEmpty();
    }

    @Test
    void aMomentIsPushedToTheGuestsBrowser() throws Exception {
        subscribe(ENDPOINT);
        call(post("/api/rides/" + rideId + "/accept"), ownerToken, null, 204);
        call(post("/api/rides/" + rideId + "/moments"), ownerToken, Map.of("kind", "on_the_way"), 204);

        var payload = ArgumentCaptor.forClass(byte[].class);
        verify(sender, timeout(5000)).send(eq(ENDPOINT), eq(P256DH), eq(AUTH), payload.capture());
        var sent = json.readTree(payload.getValue());
        assertThat(sent.get("title").asString()).isEqualTo("Élysée Chauffeur");
        assertThat(sent.get("body").asString()).isEqualTo("Your driver is on the way.");
        assertThat(sent.get("url").asString()).isEqualTo("/b/" + token);
        assertThat(sent.get("tag").asString()).isEqualTo("ride-" + rideId);
        verify(live, timeout(5000).times(3)).ridesChanged(argThat(ids -> ids.contains(driverUser))); // booking, accept, moment

        // A repeated tap pushes nothing
        call(post("/api/rides/" + rideId + "/moments"), ownerToken, Map.of("kind", "on_the_way"), 204);
        verify(sender, after(500).times(1)).send(anyString(), anyString(), anyString(), any());
    }

    @Test
    void browsersThePushServiceNoLongerKnowsAreForgotten() throws Exception {
        when(sender.send(anyString(), anyString(), anyString(), any())).thenReturn(410);
        subscribe(ENDPOINT);
        call(post("/api/rides/" + rideId + "/accept"), ownerToken, null, 204);
        call(post("/api/rides/" + rideId + "/moments"), ownerToken, Map.of("kind", "arrived"), 204);
        verify(sender, timeout(5000)).send(eq(ENDPOINT), anyString(), anyString(), any());
        for (int i = 0; i < 50 && !endpoints().isEmpty(); i++) {
            Thread.sleep(100);
        }
        assertThat(endpoints()).isEmpty();
    }

    @Test
    void eachSideIsToldAboutTheOthersMessages() throws Exception {
        subscribe(ENDPOINT);
        call(post("/api/public/bookings/" + token + "/messages"), null, Map.of("body", "I'm at door B"), 201);
        verify(live, timeout(5000)).rideMessage(List.of(driverUser), rideId);
        verify(sender, after(300).never()).send(anyString(), anyString(), anyString(), any()); // not to the client

        call(post("/api/rides/" + rideId + "/messages"), ownerToken, Map.of("body", "Coming!"), 201);
        var payload = ArgumentCaptor.forClass(byte[].class);
        verify(sender, timeout(5000)).send(eq(ENDPOINT), anyString(), anyString(), payload.capture());
        assertThat(json.readTree(payload.getValue()).get("body").asString()).isEqualTo("Message from your driver: Coming!");
    }

    @Test
    void anAccountCustomerGetsTheDriversMessagesInTheApp() throws Exception {
        var id = bookId(clientToken, ride(slot(12)));
        call(post("/api/rides/" + id + "/messages"), ownerToken, Map.of("body", "Which terminal?"), 201);
        verify(live, timeout(5000)).rideMessage(List.of(clientId), id);
        var notice = call(get("/api/notifications"), clientToken, null, 200).get(0);
        assertThat(notice.get("kind").asString()).isEqualTo("ride_message");
        assertThat(notice.get("payload").get("from").asString()).isEqualTo("driver");
        assertThat(Messages.text("ride_message", "fr", Map.of("from", "driver", "preview", "Quel terminal ?")))
                .isEqualTo("Message de votre chauffeur: Quel terminal ?");

        // The customer answers from the app, as the client
        var answer = call(post("/api/rides/" + id + "/messages"), clientToken, Map.of("body", "T2E"), 201);
        assertThat(answer.get("from").asString()).isEqualTo("client");
        assertThat(Messages.text("ride_message", "fr", Map.of("from", "client", "from_name", "Test", "preview", "T2E")))
                .isEqualTo("Message de Test: T2E");
    }

    @Test
    void browsersAreForgottenWithTheCustomer() throws Exception {
        subscribe(ENDPOINT);
        var contact = jdbc.sql("select contact_id from rides where id = :id").param("id", rideId).query(UUID.class).single();
        call(post("/api/admin/contacts/" + contact + "/forget"), ownerToken, null, 204);
        assertThat(endpoints()).isEmpty();
        verify(sender, never()).send(anyString(), anyString(), anyString(), any());
    }
}
