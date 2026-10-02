package com.taxi.booking.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Counts actions per visitor (IP address) in a sliding window, to stop scripts flooding the public
 * booking website. In memory: enough for one server; resets on restart.
 */
@Component
class RateLimiter {

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();
    private final Clock clock;

    RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** True if the action is allowed (and counts it), false if the limit is reached. */
    boolean allow(String key, int max, Duration window) {
        var now = clock.instant();
        var times = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && times.peekFirst().isBefore(now.minus(window))) {
                times.pollFirst();
            }
            if (times.size() >= max) {
                return false;
            }
            times.addLast(now);
            return true;
        }
    }

    /** Forget visitors not seen for a day (keeps memory small). */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelayString = "PT1H")
    void cleanUp() {
        var cutoff = clock.instant().minus(Duration.ofDays(1));
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(cutoff);
            }
        });
    }
}
