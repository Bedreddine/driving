package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.support.IntegrationTest;
import com.taxi.support.KafkaProbe;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.node.ObjectNode;

/**
 * Domain events through the real Kafka: published with the change, consumed by the notification module,
 * handled once even when delivered twice, and parked in the dead-letter topic when they cannot be handled.
 */
@TestPropertySource(properties = "taxi.routing.osrm-url=http://127.0.0.1:9") // no map server: cautious estimates
class DomainEventsIT extends IntegrationTest {

    private static final String RIDE_EVENTS = "taxi.ride-events";
    private static final String DEAD_LETTERS = "taxi.ride-events.DLT";

    private UUID guestBooking(String email) throws Exception {
        var client = new LinkedHashMap<String, Object>();
        client.put("full_name", "Alice Martin");
        client.put("email", email);
        client.put("phone", "+44 7700 900123");
        client.put("language", "en");
        var r = call(post("/api/public/bookings"), null, Map.of("client", client, "ride", ride(slot(10))), 200);
        return jdbc.sql("select id from rides where access_token = :t").param("t", r.get("access_token").asString())
                .query(UUID.class).single();
    }

    private int emailsTo(String email) {
        return jdbc.sql("select count(*) from customer_messages where channel = 'email' and recipient = :e")
                .param("e", email).query(Integer.class).single();
    }

    private int notices(UUID rideId) {
        return jdbc.sql("select count(*) from notifications where ride_id = :r").param("r", rideId)
                .query(Integer.class).single();
    }

    @Test
    void aBookingGoesThroughKafkaToTheCustomersEmailAndTheDriversApp() throws Exception {
        var rideId = guestBooking("alice@example.com");
        eventsDelivered();

        var records = KafkaProbe.read(RIDE_EVENTS, rideId.toString());
        assertThat(records).hasSize(1);
        var record = records.getFirst();
        assertThat(KafkaProbe.header(record, "taxi-event")).isEqualTo("RideChanged");
        var event = json.readTree(record.value());
        assertThat(event.get("ride_id").asString()).isEqualTo(rideId.toString());
        assertThat(event.get("notices").findValuesAsString("kind")).containsExactly("new_request", "request_received");
        var eventId = UUID.fromString(event.get("event_id").asString());

        assertThat(jdbc.sql("select count(*) from processed_events where event_id = :id").param("id", eventId)
                .query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select subject from customer_messages where recipient = 'alice@example.com'")
                .query(String.class).single()).endsWith("Booking request received");
        assertThat(notices(rideId)).as("the driver's 'new request' notice").isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from event_publication").query(Integer.class).single())
                .as("outbox emptied once Kafka has the event").isZero();
    }

    @Test
    void anEventDeliveredTwiceIsHandledOnce() throws Exception {
        var rideId = guestBooking("bob@example.com");
        eventsDelivered();
        assertThat(emailsTo("bob@example.com")).isEqualTo(1);
        assertThat(notices(rideId)).isEqualTo(1);

        var original = KafkaProbe.read(RIDE_EVENTS, rideId.toString()).getFirst();
        for (int i = 0; i < 2; i++) {
            KafkaProbe.send(new ProducerRecord<>(RIDE_EVENTS, null, original.key(), original.value(), original.headers()));
        }
        eventsDelivered();

        assertThat(KafkaProbe.read(RIDE_EVENTS, rideId.toString())).hasSize(3);
        assertThat(emailsTo("bob@example.com")).isEqualTo(1);
        assertThat(notices(rideId)).isEqualTo(1);
    }

    @Test
    void unreadableMessagesGoStraightToTheDeadLetterTopic() throws Exception {
        var key = "poison-" + UUID.randomUUID();
        var notJson = new ProducerRecord<String, byte[]>(RIDE_EVENTS, key, "{not json".getBytes(StandardCharsets.UTF_8));
        notJson.headers().add("taxi-event", "RideChanged".getBytes(StandardCharsets.UTF_8));
        KafkaProbe.send(notJson);
        var unknownKey = "unknown-" + UUID.randomUUID();
        var unknown = new ProducerRecord<String, byte[]>(RIDE_EVENTS, unknownKey, "{}".getBytes(StandardCharsets.UTF_8));
        unknown.headers().add("taxi-event", "SomethingElse".getBytes(StandardCharsets.UTF_8));
        KafkaProbe.send(unknown);
        eventsDelivered(); // the consumer moved past both

        for (var k : new String[] {key, unknownKey}) {
            var dead = KafkaProbe.read(DEAD_LETTERS, k);
            assertThat(dead).hasSize(1);
            assertThat(KafkaProbe.header(dead.getFirst(), "kafka_dlt-exception-cause-fqcn")).endsWith("UnreadableEvent");
            assertThat(KafkaProbe.header(dead.getFirst(), "kafka_dlt-original-topic")).isEqualTo(RIDE_EVENTS);
        }
        assertThat(KafkaProbe.read(DEAD_LETTERS, key).getFirst().value())
                .isEqualTo("{not json".getBytes(StandardCharsets.UTF_8));

        // and the next events are handled as usual
        guestBooking("carol@example.com");
        eventsDelivered();
        assertThat(emailsTo("carol@example.com")).isEqualTo(1);
    }

    @Test
    void anEventThatKeepsFailingIsRetriedThenParkedInTheDeadLetterTopic() throws Exception {
        var rideId = guestBooking("dave@example.com");
        eventsDelivered();
        var original = KafkaProbe.read(RIDE_EVENTS, rideId.toString()).getFirst();
        // Readable, but handling it fails every time (no notices list): not a duplicate, a new event id
        var broken = (ObjectNode) json.readTree(original.value());
        var brokenId = UUID.randomUUID();
        broken.put("event_id", brokenId.toString());
        broken.putNull("notices");
        KafkaProbe.send(new ProducerRecord<>(RIDE_EVENTS, null, original.key(), json.writeValueAsBytes(broken),
                original.headers()));
        eventsDelivered();

        var dead = KafkaProbe.read(DEAD_LETTERS, rideId.toString());
        assertThat(dead).hasSize(1);
        assertThat(KafkaProbe.header(dead.getFirst(), "kafka_dlt-exception-cause-fqcn"))
                .isEqualTo(NullPointerException.class.getName());
        assertThat(jdbc.sql("select count(*) from processed_events where event_id = :id").param("id", brokenId)
                .query(Integer.class).single()).as("its transaction was rolled back").isZero();
        assertThat(emailsTo("dave@example.com")).isEqualTo(1);
    }
}
