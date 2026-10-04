package com.taxi.notification.internal;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
class NotificationRepository {

    record Notification(long id, UUID recipientId, UUID rideId, String kind, String payload, OffsetDateTime createdAt,
                        OffsetDateTime readAt) {}

    record PushToken(String token, UUID userId) {}

    private final JdbcClient jdbc;
    private final JsonMapper json;

    NotificationRepository(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * Notices are stored by the Kafka consumer, after the change: an account or a ride deleted meanwhile is skipped
     * (instead of a foreign-key error that would send the whole event to the dead-letter topic).
     */
    void insert(UUID recipientId, UUID rideId, String kind, Map<String, Object> payload) {
        jdbc.sql("""
                insert into notifications (recipient_id, ride_id, kind, payload)
                select :r, :ride, :k, cast(:p as jsonb)
                where exists (select 1 from users where id = :r)
                  and (cast(:ride as uuid) is null or exists (select 1 from rides where id = :ride))""")
                .param("r", recipientId).param("ride", rideId).param("k", kind)
                .param("p", json.writeValueAsString(payload == null ? Map.of() : payload))
                .update();
    }

    List<Notification> forUser(UUID userId, int limit) {
        return jdbc.sql("""
                select id, recipient_id, ride_id, kind, payload::text as payload, created_at, read_at
                from notifications where recipient_id = :u order by created_at desc limit :l""")
                .param("u", userId).param("l", limit).query(Notification.class).list();
    }

    void markRead(UUID userId, long id) {
        jdbc.sql("update notifications set read_at = now() where id = :id and recipient_id = :u and read_at is null")
                .param("id", id).param("u", userId).update();
    }

    List<Notification> unpushed(int limit) {
        return jdbc.sql("""
                select id, recipient_id, ride_id, kind, payload::text as payload, created_at, read_at
                from notifications where pushed_at is null order by created_at limit :l for update skip locked""")
                .param("l", limit).query(Notification.class).list();
    }

    void markPushed(List<Long> ids) {
        if (!ids.isEmpty()) {
            jdbc.sql("update notifications set pushed_at = now() where id in (:ids)").param("ids", ids).update();
        }
    }

    List<PushToken> tokens(List<UUID> userIds) {
        if (userIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("select token, user_id from push_tokens where user_id in (:u)").param("u", userIds)
                .query(PushToken.class).list();
    }

    void saveToken(String token, UUID userId) {
        jdbc.sql("""
                insert into push_tokens (token, user_id) values (:t, :u)
                on conflict (token) do update set user_id = excluded.user_id""")
                .param("t", token).param("u", userId).update();
    }

    void deleteToken(String token, UUID userId) {
        jdbc.sql("delete from push_tokens where token = :t and user_id = :u").param("t", token).param("u", userId).update();
    }

    /** Tokens Expo reports as no longer valid (app uninstalled). */
    void deleteTokens(List<String> tokens) {
        if (!tokens.isEmpty()) {
            jdbc.sql("delete from push_tokens where token in (:t)").param("t", tokens).update();
        }
    }

    /** Notices quoting a ride's messages (personal data). */
    void deleteMessageNotices(List<UUID> rideIds) {
        if (!rideIds.isEmpty()) {
            jdbc.sql("delete from notifications where kind = 'ride_message' and ride_id in (:ids)")
                    .param("ids", rideIds).update();
        }
    }

    int deleteOlderThan90Days() {
        return jdbc.sql("delete from notifications where created_at < now() - interval '90 days'").update();
    }
}
