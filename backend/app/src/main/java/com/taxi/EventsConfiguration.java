package com.taxi;

import com.taxi.booking.EventTopics;
import com.taxi.shared.EventJson;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executor;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.config.TopicConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.support.converter.ByteArrayJacksonJsonMessageConverter;
import org.springframework.modulith.events.EventExternalizationConfiguration;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.modulith.events.core.EventSerializer;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * Domain events to Kafka, with a transactional outbox (Spring Modulith):
 * <ol>
 *   <li>A module publishes an event annotated {@code @Externalized} inside its transaction; Spring Modulith saves it
 *       in the event_publication table in that same transaction (no change without its event, no event without its
 *       change).</li>
 *   <li>After the commit it is sent to Kafka (topic and key from the annotation). Once Kafka has it, the row is
 *       deleted (completion-mode delete).</li>
 *   <li>A failed send leaves the row: sent again by {@link Resubmission} (every minute while the app runs) and at
 *       the next start (republish-outstanding-events-on-restart).</li>
 * </ol>
 * Delivery is therefore at least once; consumers are idempotent (notification: processed_events).
 */
@Configuration(proxyBeanMethods = false)
class EventsConfiguration {

    /** 3 partitions (one ride's events always in the same one), one copy: a single broker. */
    static final int PARTITIONS = 3;

    /** Messages hold names, phone numbers and addresses: Kafka keeps them 7 days (dead letters 14), then deletes. */
    private static final Duration KEEP = Duration.ofDays(7);
    private static final Duration KEEP_DEAD_LETTERS = Duration.ofDays(14);

    @Bean
    NewTopic rideEventsTopic() {
        return topic(EventTopics.RIDE_EVENTS, KEEP);
    }

    @Bean
    NewTopic rideEventsDeadLetterTopic() {
        return topic(EventTopics.RIDE_EVENTS + EventTopics.DEAD_LETTER_SUFFIX, KEEP_DEAD_LETTERS);
    }

    @Bean
    NewTopic customerEventsTopic() {
        return topic(EventTopics.CUSTOMER_EVENTS, KEEP);
    }

    @Bean
    NewTopic customerEventsDeadLetterTopic() {
        return topic(EventTopics.CUSTOMER_EVENTS + EventTopics.DEAD_LETTER_SUFFIX, KEEP_DEAD_LETTERS);
    }

    private static NewTopic topic(String name, Duration retention) {
        return TopicBuilder.name(name).partitions(PARTITIONS).replicas(1)
                .config(TopicConfig.RETENTION_MS_CONFIG, String.valueOf(retention.toMillis()))
                .build();
    }

    /**
     * Events annotated {@code @Externalized} in the application's packages, routed by the annotation
     * ("topic::key"), with a header naming the event so consumers need no Java class names.
     */
    @Bean
    EventExternalizationConfiguration eventExternalizationConfiguration() {
        return EventExternalizationConfiguration.defaults(TaxiApplication.class.getPackageName())
                .headers(event -> Map.of(EventTopics.EVENT_TYPE_HEADER, event.getClass().getSimpleName()))
                .build();
    }

    /** Kafka message bodies: the events' JSON (also used by the consumers to read them). */
    @Bean
    ByteArrayJacksonJsonMessageConverter kafkaMessageConverter(EventJson json) {
        return new ByteArrayJacksonJsonMessageConverter(json.mapper());
    }

    /** The outbox table holds the same JSON. */
    @Bean
    EventSerializer eventSerializer(EventJson json) {
        return new EventSerializer() {
            @Override
            public Object serialize(Object event) {
                return json.mapper().writeValueAsString(event);
            }

            @Override
            public <T> T deserialize(Object serialized, Class<T> type) {
                return json.mapper().readValue(serialized.toString(), type);
            }
        };
    }

    /**
     * Sending to Kafka happens after the commit on this single background thread, in commit order, so one ride's
     * events reach their partition in the order they happened (the producer keeps the order of the sends).
     * Only {@code @Async} methods use it (Spring Modulith's sender); web requests keep Spring Boot's own executor.
     */
    @Component
    static class OutboxSender implements AsyncConfigurer, DisposableBean {

        private final ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();

        OutboxSender() {
            executor.setCorePoolSize(1);
            executor.setMaxPoolSize(1);
            executor.setThreadNamePrefix("outbox-");
            executor.setWaitForTasksToCompleteOnShutdown(true);
            executor.setAwaitTerminationSeconds(10);
            executor.initialize();
        }

        @Override
        public Executor getAsyncExecutor() {
            return executor;
        }

        @Override
        public void destroy() {
            executor.shutdown(); // unsent events stay in event_publication and go at the next start
        }
    }

    /**
     * Sends again the events Kafka did not take (broker down, timeout). Publications stuck in another state are
     * marked failed by Spring Modulith's staleness check (spring.modulith.events.staleness.*), then picked up here.
     * Runs with the other background jobs (taxi.scheduling.enabled).
     */
    @Component
    static class Resubmission {

        private static final Logger log = LoggerFactory.getLogger(Resubmission.class);

        private final FailedEventPublications failed;

        Resubmission(FailedEventPublications failed) {
            this.failed = failed;
        }

        @Scheduled(fixedDelayString = "${taxi.events.resubmit-every:PT1M}", initialDelayString = "PT1M")
        void resubmitFailed() {
            try {
                failed.resubmit(ResubmissionOptions.defaults().withMinAge(Duration.ofMinutes(1)).withBatchSize(100));
            } catch (RuntimeException e) {
                log.warn("Could not resubmit failed event publications: {}", e.getClass().getSimpleName());
            }
        }
    }
}
