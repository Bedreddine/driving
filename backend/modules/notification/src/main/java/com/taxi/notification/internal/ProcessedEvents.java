package com.taxi.notification.internal;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotent consumer: the ids of the events already handled (table processed_events). Marked in the same
 * transaction as what the event writes, so an event delivered twice (Kafka delivers at least once; the outbox may
 * send again after a crash) is handled exactly once.
 */
@Component
class ProcessedEvents {

    private final JdbcClient jdbc;

    ProcessedEvents(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Marks the event as handled; false when it already was. Call inside the transaction of the event's writes:
     * a second delivery running at the same time waits on the row, then sees it.
     */
    boolean firstTime(UUID eventId) {
        return jdbc.sql("insert into processed_events (event_id) values (:id) on conflict do nothing")
                .param("id", eventId).update() == 1;
    }

    boolean seen(UUID eventId) {
        return jdbc.sql("select exists (select 1 from processed_events where event_id = :id)")
                .param("id", eventId).query(Boolean.class).single();
    }

    /** Kafka keeps messages 7 days, the outbox resends within minutes: 30 days of ids is plenty. */
    @Scheduled(cron = "0 5 4 * * *", zone = "UTC")
    @Transactional
    void retention() {
        jdbc.sql("delete from processed_events where processed_at < now() - interval '30 days'").update();
    }
}
