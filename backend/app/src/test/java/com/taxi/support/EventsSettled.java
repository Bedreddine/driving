package com.taxi.support;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutionException;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.awaitility.Awaitility;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Waits until every published domain event went all the way: sent to Kafka (outbox table empty) and handled by
 * the notification consumer (its group has committed every message of the event topics).
 * Event handling is asynchronous now; tests call this before checking what the events should have done
 * (or not done).
 */
public final class EventsSettled {

    private static final String GROUP = "taxi-notification";
    private static final List<String> TOPICS = List.of("taxi.ride-events", "taxi.customer-events");
    private static Admin admin;

    private EventsSettled() {}

    public static void await(JdbcClient jdbc) {
        Awaitility.await("domain events sent and handled")
                .atMost(Duration.ofSeconds(30)).pollDelay(Duration.ZERO).pollInterval(Duration.ofMillis(50))
                .until(() -> outboxEmpty(jdbc) && consumed());
    }

    static boolean outboxEmpty(JdbcClient jdbc) {
        return jdbc.sql("select count(*) from event_publication").query(Integer.class).single() == 0;
    }

    static synchronized Admin admin() {
        if (admin == null) {
            var props = new Properties();
            props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, TestcontainersConfiguration.KAFKA.getBootstrapServers());
            admin = Admin.create(props);
        }
        return admin;
    }

    /** True when the consumer group's committed offset has reached the end of every partition of the topics. */
    static boolean consumed() throws ExecutionException, InterruptedException {
        var partitions = admin().describeTopics(TOPICS).allTopicNames().get().values().stream()
                .flatMap(t -> t.partitions().stream().map(p -> new TopicPartition(t.name(), p.partition())))
                .toList();
        var request = new HashMap<TopicPartition, OffsetSpec>();
        partitions.forEach(p -> request.put(p, OffsetSpec.latest()));
        var ends = admin().listOffsets(request).all().get();
        Map<TopicPartition, OffsetAndMetadata> committed =
                admin().listConsumerGroupOffsets(GROUP).partitionsToOffsetAndMetadata().get();
        for (var p : partitions) {
            long end = ends.get(p).offset();
            var c = committed.get(p);
            if (end > 0 && (c == null || c.offset() < end)) {
                return false;
            }
        }
        return true;
    }
}
