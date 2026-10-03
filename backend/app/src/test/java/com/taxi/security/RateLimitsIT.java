package com.taxi.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/**
 * Limits per visitor on the endpoints anyone can call. (Each test uses its own visitor address: the counters live
 * as long as the application.) That a visitor cannot fake their address is nginx's job: docker/nginx.conf.
 */
@TestPropertySource(properties = {
        "taxi.public.max-ride-page-per-hour=3",
        "taxi.auth.max-refreshes-per-hour=3",
})
class RateLimitsIT extends IntegrationTest {

    @Test
    void privateRideLinksCannotBeTriedInBulk() throws Exception {
        for (int i = 0; i < 3; i++) {
            call(get("/api/public/bookings/" + "a".repeat(48)).with(r -> visitor(r, "198.51.100.1")), null, null, 404);
        }
        assertThat(errorOf(get("/api/public/bookings/" + "a".repeat(48)).with(r -> visitor(r, "198.51.100.1")), null, null, 429))
                .isEqualTo("TOO_MANY_REQUESTS");
        assertThat(errorOf(post("/api/public/bookings/" + "a".repeat(48) + "/cancel").with(r -> visitor(r, "198.51.100.1")),
                null, null, 429)).isEqualTo("TOO_MANY_REQUESTS");
        // Another visitor is not affected; malformed tokens get the same answer as unknown ones.
        assertThat(errorOf(get("/api/public/bookings/short").with(r -> visitor(r, "198.51.100.2")), null, null, 404))
                .isEqualTo("NOT_FOUND");
    }

    @Test
    void refreshTokensCannotBeTriedInBulk() throws Exception {
        for (int i = 0; i < 3; i++) {
            call(post("/api/auth/refresh").with(r -> visitor(r, "198.51.100.3")), null, Map.of("refresh_token", "x" + i), 401);
        }
        assertThat(errorOf(post("/api/auth/refresh").with(r -> visitor(r, "198.51.100.3")), null,
                Map.of("refresh_token", "y"), 429)).isEqualTo("TOO_MANY_REQUESTS");
    }

    private static org.springframework.mock.web.MockHttpServletRequest visitor(
            org.springframework.mock.web.MockHttpServletRequest request, String address) {
        request.setRemoteAddr(address);
        return request;
    }
}
