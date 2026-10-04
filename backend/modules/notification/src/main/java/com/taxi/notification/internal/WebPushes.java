package com.taxi.notification.internal;

import com.taxi.booking.CustomerForgotten;
import com.taxi.booking.RideDirectory;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Browser push subscriptions of guests following a ride on its private link, and sending to them.
 * Sending happens on a small background pool after the change is saved: never blocks a request, and a lost
 * message (server restart) only means one notice less; the ride page shows the state anyway.
 * The endpoint (the browser's push address) and its keys are secrets: never logged, only the push service's host.
 */
@Component
class WebPushes implements DisposableBean {

    /** What the browser's service worker shows: title, text, page opened on tap, and a tag (one notice per ride). */
    record Payload(String title, String body, String url, String tag) {}

    record Subscription(UUID id, UUID rideId, String endpoint, String p256dh, String auth, OffsetDateTime createdAt) {}

    static final int MAX_PER_RIDE = 5;
    private static final Set<String> OPEN = Set.of("requested", "price_proposed", "accepted");
    private static final Logger log = LoggerFactory.getLogger(WebPushes.class);

    private final JdbcClient jdbc;
    private final WebPushKeys keys;
    private final WebPushSender sender;
    private final JsonMapper json;
    private final RideDirectory rides;
    private final ThreadPoolExecutor pool = new ThreadPoolExecutor(1, 4, 60, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(1000), r -> {
                var t = new Thread(r, "web-push");
                t.setDaemon(true);
                return t;
            }, (r, executor) -> log.warn("Browser push queue full: one message dropped"));

    WebPushes(JdbcClient jdbc, WebPushKeys keys, WebPushSender sender, JsonMapper json, RideDirectory rides) {
        this.jdbc = jdbc;
        this.keys = keys;
        this.sender = sender;
        this.json = json;
        this.rides = rides;
    }

    /** One row per browser (endpoint): subscribing again updates it; a ride keeps its 5 most recent browsers. */
    @Transactional
    public void subscribe(UUID rideId, String endpoint, String p256dh, String auth) {
        jdbc.sql("""
                insert into web_push_subscriptions (ride_id, endpoint, p256dh, auth) values (:r, :e, :p, :a)
                on conflict (endpoint) do update set ride_id = excluded.ride_id, p256dh = excluded.p256dh,
                  auth = excluded.auth, created_at = now()""")
                .param("r", rideId).param("e", endpoint).param("p", p256dh).param("a", auth).update();
        jdbc.sql("""
                delete from web_push_subscriptions where ride_id = :r and id not in (
                  select id from web_push_subscriptions where ride_id = :r order by created_at desc, id limit :max)""")
                .param("r", rideId).param("max", MAX_PER_RIDE).update();
    }

    void unsubscribe(UUID rideId, String endpoint) {
        jdbc.sql("delete from web_push_subscriptions where ride_id = :r and endpoint = :e")
                .param("r", rideId).param("e", endpoint).update();
    }

    List<Subscription> forRide(UUID rideId) {
        return jdbc.sql("select id, ride_id, endpoint, p256dh, auth, created_at from web_push_subscriptions where ride_id = :r")
                .param("r", rideId).query(Subscription.class).list();
    }

    /** Queues the message for every browser following the ride. Call after the change is committed. */
    void send(UUID rideId, Payload payload) {
        if (!keys.enabled()) {
            return;
        }
        var subscriptions = forRide(rideId);
        if (subscriptions.isEmpty()) {
            return;
        }
        var bytes = json.writeValueAsBytes(payload);
        for (var s : subscriptions) {
            pool.execute(() -> deliver(s, bytes));
        }
    }

    private void deliver(Subscription s, byte[] payload) {
        try {
            int status = sender.send(s.endpoint(), s.p256dh(), s.auth(), payload);
            if (status == 404 || status == 410) {
                jdbc.sql("delete from web_push_subscriptions where id = :id").param("id", s.id()).update();
                log.info("Browser push: subscription at {} is gone (HTTP {}), removed", host(s.endpoint()), status);
            } else if (status < 200 || status >= 300) {
                log.warn("Browser push to {} refused: HTTP {}", host(s.endpoint()), status);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Browser push to {} failed: {}", host(s.endpoint()), e.getClass().getSimpleName());
        }
    }

    /** Only the push service's host name ("fcm.googleapis.com"): the rest of the endpoint identifies the browser. */
    static String host(String endpoint) {
        try {
            var host = URI.create(endpoint).getHost();
            return host == null ? "?" : host;
        } catch (RuntimeException e) {
            return "?";
        }
    }

    /** An erased customer: their browsers are forgotten too. Called by {@link DomainEventConsumer} (from Kafka). */
    void on(CustomerForgotten e) {
        if (!e.rideIds().isEmpty()) {
            jdbc.sql("delete from web_push_subscriptions where ride_id in (:ids)").param("ids", e.rideIds()).update();
        }
    }

    /** Retention: once a ride is closed (or 2 days after its pickup) there is nothing more to tell its browsers. */
    @Scheduled(cron = "0 55 3 * * *", zone = "UTC")
    @Transactional
    void retention() {
        var rideIds = jdbc.sql("select distinct ride_id from web_push_subscriptions").query(UUID.class).list();
        if (rideIds.isEmpty()) {
            return;
        }
        var facts = rides.find(rideIds);
        var cutoff = OffsetDateTime.now().minusDays(2);
        var over = rideIds.stream().filter(id -> {
            var f = facts.get(id);
            return f == null || !OPEN.contains(f.status()) || f.pickupAt().isBefore(cutoff);
        }).toList();
        if (!over.isEmpty()) {
            jdbc.sql("delete from web_push_subscriptions where ride_id in (:ids)").param("ids", over).update();
        }
    }

    @Override
    public void destroy() {
        pool.shutdown();
    }
}
