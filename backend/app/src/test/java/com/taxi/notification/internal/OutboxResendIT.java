package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.support.IntegrationTest;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.common.KafkaException;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.messaging.Message;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** An event Kafka did not take stays in the outbox and is sent again: the booking's email is not lost. */
@TestPropertySource(properties = "taxi.routing.osrm-url=http://127.0.0.1:9") // no map server: cautious estimates
class OutboxResendIT extends IntegrationTest {

    @MockitoSpyBean KafkaTemplate<?, ?> kafka;
    @Autowired IncompleteEventPublications incomplete;
    @Autowired FailedEventPublications failed;

    @AfterEach
    void brokerBack() {
        reset((Object) kafka);
    }

    private void bookWhileKafkaRefuses(String email) throws Exception {
        doReturn(CompletableFuture.failedFuture(new KafkaException("broker unreachable")))
                .when(kafka).send(any(Message.class));
        var client = new LinkedHashMap<String, Object>();
        client.put("full_name", "Alice Martin");
        client.put("email", email);
        client.put("phone", "+44 7700 900123");
        call(post("/api/public/bookings"), null, Map.of("client", client, "ride", ride(slot(10))), 200);

        // The booking is saved; its event waits in the outbox, marked failed
        Awaitility.await().atMost(Duration.ofSeconds(10)).until(() ->
                "FAILED".equals(jdbc.sql("select max(status) from event_publication").query(String.class).single()));
        assertThat(jdbc.sql("select count(*) from event_publication").query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("select count(*) from rides").query(Integer.class).single()).isEqualTo(1);
        assertThat(emails(email)).isZero();
        reset((Object) kafka); // Kafka is back
    }

    private int emails(String email) {
        return jdbc.sql("select count(*) from customer_messages where recipient = :e").param("e", email)
                .query(Integer.class).single();
    }

    @Test
    void aFailedSendIsSentAgainLikeAtRestart() throws Exception {
        bookWhileKafkaRefuses("restart@example.com");
        // What spring.modulith.events.republish-outstanding-events-on-restart does at startup
        incomplete.resubmitIncompletePublications(ResubmissionOptions.defaults());
        eventsDelivered();
        assertThat(emails("restart@example.com")).isEqualTo(1);
    }

    @Test
    void aFailedSendIsSentAgainByTheResubmissionJob() throws Exception {
        bookWhileKafkaRefuses("job@example.com");
        // What EventsConfiguration.Resubmission does every minute (without its minimum age)
        failed.resubmit(ResubmissionOptions.defaults());
        eventsDelivered();
        assertThat(emails("job@example.com")).isEqualTo(1);
    }
}
