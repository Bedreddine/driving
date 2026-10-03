package com.taxi.shared;

import jakarta.servlet.http.HttpServletRequest;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
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
 * booking website or guessing passwords. In memory: enough for one server; resets on restart.
 * <p>
 * The visitor's address is only as good as the proxy in front: nginx (docker/nginx.conf) replaces any
 * X-Forwarded-For sent by the client with the address it really sees, so it cannot be faked to escape the limits.
 */
@Component
public class RateLimiter {

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();
    private final Clock clock;

    RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** The visitor behind a request, as a limit key (see {@link #visitor(String)}). */
    public static String visitor(HttpServletRequest request) {
        return visitor(request.getRemoteAddr());
    }

    /**
     * The IPv4 address as is; for IPv6 its /64 network, because one home or phone gets a whole /64 and could
     * otherwise change address on every request to escape the limits.
     */
    static String visitor(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return "unknown";
        }
        if (remoteAddr.indexOf(':') < 0 || !remoteAddr.matches("^[0-9a-fA-F:.%\\[\\]]+$")) {
            return remoteAddr;
        }
        try {
            // A literal address (it contains ':'): parsed, never looked up in DNS.
            var address = InetAddress.getByName(remoteAddr.startsWith("[") ? remoteAddr.substring(1, remoteAddr.length() - 1) : remoteAddr);
            if (!(address instanceof Inet6Address)) {
                return address.getHostAddress(); // IPv4-mapped
            }
            var b = address.getAddress();
            return String.format("%x:%x:%x:%x::/64", (b[0] & 0xff) << 8 | (b[1] & 0xff), (b[2] & 0xff) << 8 | (b[3] & 0xff),
                    (b[4] & 0xff) << 8 | (b[5] & 0xff), (b[6] & 0xff) << 8 | (b[7] & 0xff));
        } catch (UnknownHostException | RuntimeException e) {
            return remoteAddr;
        }
    }

    /** True if the action is allowed (and counts it), false if the limit is reached. */
    public boolean allow(String key, int max, Duration window) {
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
