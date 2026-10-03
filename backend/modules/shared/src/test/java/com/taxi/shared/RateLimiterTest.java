package com.taxi.shared;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    @Test
    void countsPerKeyInASlidingWindow() {
        var limiter = new RateLimiter(Clock.fixed(Instant.parse("2026-01-01T10:00:00Z"), ZoneOffset.UTC));
        assertThat(limiter.allow("a", 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.allow("a", 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.allow("a", 2, Duration.ofMinutes(1))).isFalse();
        assertThat(limiter.allow("b", 2, Duration.ofMinutes(1))).isTrue();
    }

    @Test
    void ipv6VisitorsAreCountedPerSlash64() {
        assertThat(RateLimiter.visitor("203.0.113.7")).isEqualTo("203.0.113.7");
        assertThat(RateLimiter.visitor("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))
                .isEqualTo(RateLimiter.visitor("2001:db8:1:2::1"))
                .isEqualTo("2001:db8:1:2::/64");
        assertThat(RateLimiter.visitor("2001:db8:1:3::1")).isNotEqualTo(RateLimiter.visitor("2001:db8:1:2::1"));
        assertThat(RateLimiter.visitor("0:0:0:0:0:0:0:1")).isEqualTo("0:0:0:0::/64");
        assertThat(RateLimiter.visitor("::ffff:203.0.113.7")).isEqualTo("203.0.113.7");
        assertThat(RateLimiter.visitor((String) null)).isEqualTo("unknown");
        assertThat(RateLimiter.visitor("not:an address")).isEqualTo("not:an address");
    }
}
