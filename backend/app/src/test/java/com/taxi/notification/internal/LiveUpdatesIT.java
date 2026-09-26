package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.taxi.support.TestcontainersConfiguration;
import java.net.URI;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.client.RestClient;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;

/** Open screens are told to reload when one of their rides changes. Uses a real server port. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "taxi.security.jwt-secret=integration-test-secret-0123456789abcdef",
        "taxi.scheduling.enabled=false",
        "taxi.push.enabled=false",
        "taxi.routing.osrm-url=http://127.0.0.1:9", // unreachable on purpose: the cautious estimate is used
})
@Import(TestcontainersConfiguration.class)
class LiveUpdatesIT {

    @LocalServerPort int port;
    @Autowired JdbcClient jdbc;

    @Test
    void theDriverScreenIsToldWhenACustomerBooks() throws Exception {
        jdbc.sql("truncate notifications, ride_events, rides, contacts, drivers, refresh_tokens, user_roles, users cascade").update();
        var http = RestClient.builder().baseUrl("http://localhost:" + port).build();
        jdbc.sql("insert into drivers (display_name) values ('Taxi') returning id").query(java.util.UUID.class).single();
        jdbc.sql("insert into pricing_settings (driver_id, minimum_fare) select id, 20 from drivers").update();

        var owner = signUp(http, "live-owner@taxi.test");
        jdbc.sql("insert into user_roles select id, r from users, unnest(array['admin','driver']) r where email = 'live-owner@taxi.test'").update();
        jdbc.sql("update drivers set user_id = (select id from users where email = 'live-owner@taxi.test')").update();
        owner = login(http, "live-owner@taxi.test");
        var client = signUp(http, "live-client@taxi.test");

        var messages = new LinkedBlockingQueue<String>();
        WebSocketSession session = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage m) {
                messages.add(m.getPayload());
            }
        }, null, URI.create("ws://localhost:" + port + "/ws?token=" + owner)).get(10, TimeUnit.SECONDS);

        var pickup = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
        var ride = Map.of("pickup_at", pickup.toString(),
                "pickup", Map.of("lat", 48.8606, "lng", 2.3376, "address", "Louvre"),
                "dropoff", Map.of("lat", 48.8738, "lng", 2.2950, "address", "Arc"));
        var result = http.post().uri("/api/rides").header("Authorization", "Bearer " + client)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("ride", ride)).retrieve().body(JsonNode.class);
        assertThat(result.get("ok").asBoolean()).as(result.toString()).isTrue();
        assertThat(result.get("route_estimated").asBoolean()).isTrue(); // map server down: bookings still work

        assertThat(messages.poll(5, TimeUnit.SECONDS)).isEqualTo("{\"type\":\"rides-changed\"}");
        session.close();
    }

    @Test
    void connectionsWithoutAValidTokenAreRefused() {
        assertThatThrownBy(() -> new StandardWebSocketClient()
                .execute(new TextWebSocketHandler(), null, URI.create("ws://localhost:" + port + "/ws?token=forged"))
                .get(10, TimeUnit.SECONDS))
                .isInstanceOf(java.util.concurrent.ExecutionException.class);
    }

    private static String signUp(RestClient http, String email) {
        return http.post().uri("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", email, "password", "password123", "full_name", email))
                .retrieve().body(JsonNode.class).get("access_token").asString();
    }

    private static String login(RestClient http, String email) {
        return http.post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", email, "password", "password123"))
                .retrieve().body(JsonNode.class).get("access_token").asString();
    }
}
