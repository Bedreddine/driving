package com.taxi.notification.internal;

import com.taxi.booking.EventTopics;
import java.time.Duration;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.ExponentialBackOffWithMaxRetries;

/**
 * What happens when handling an event fails: retried in place (the partition waits, so one ride's events keep their
 * order) with a growing pause, then the message is copied to the dead-letter topic (same name + ".DLT", same
 * partition) and the consumer moves on. Unreadable messages skip the retries.
 * Logs name the topic, partition and offset only, never the content (it holds names, phone numbers, addresses).
 */
@Configuration(proxyBeanMethods = false)
class EventConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(EventConsumerConfig.class);

    @Bean
    DefaultErrorHandler eventErrorHandler(KafkaOperations<?, ?> kafka,
                                          @Value("${taxi.events.retry.first-pause:1s}") Duration firstPause,
                                          @Value("${taxi.events.retry.max-pause:30s}") Duration maxPause,
                                          @Value("${taxi.events.retry.attempts:6}") int retries) {
        var deadLetters = new DeadLetterPublishingRecoverer(kafka,
                (record, e) -> new TopicPartition(record.topic() + EventTopics.DEAD_LETTER_SUFFIX, record.partition()));
        var backOff = new ExponentialBackOffWithMaxRetries(retries);
        backOff.setInitialInterval(firstPause.toMillis());
        backOff.setMultiplier(2);
        backOff.setMaxInterval(maxPause.toMillis());
        var handler = new DefaultErrorHandler((record, e) -> {
            log.error("Event at {}-{}@{} could not be handled ({}): moved to the dead-letter topic", record.topic(),
                    record.partition(), record.offset(), rootCause(e).getClass().getName());
            deadLetters.accept(record, e);
        }, backOff);
        handler.addNotRetryableExceptions(DomainEventConsumer.UnreadableEvent.class);
        return handler;
    }

    private static Throwable rootCause(Throwable e) {
        var cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        return cause;
    }
}
