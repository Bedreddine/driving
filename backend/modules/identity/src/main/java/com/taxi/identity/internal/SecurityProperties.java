package com.taxi.identity.internal;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * taxi.security.* settings.
 *
 * @param jwtSecret      HMAC key for access tokens, at least 32 bytes (env JWT_SECRET)
 * @param accessTokenTtl lifetime of an access token; roles are re-read when it is refreshed
 * @param refreshTokenTtl lifetime of a refresh token (stay signed in on the phone)
 * @param corsOrigins    browser origins allowed to call the API (the back office)
 */
@ConfigurationProperties("taxi.security")
record SecurityProperties(String jwtSecret, Duration accessTokenTtl, Duration refreshTokenTtl, List<String> corsOrigins) {

    SecurityProperties {
        if (jwtSecret == null || jwtSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "taxi.security.jwt-secret (env JWT_SECRET) must be set to at least 32 characters");
        }
        // The example value from .env.example is public: anyone could sign admin tokens with it.
        if (jwtSecret.startsWith("change-me")) {
            throw new IllegalStateException(
                    "taxi.security.jwt-secret (env JWT_SECRET) is still the example value: set a random one (openssl rand -base64 48)");
        }
        accessTokenTtl = accessTokenTtl == null ? Duration.ofMinutes(15) : accessTokenTtl;
        refreshTokenTtl = refreshTokenTtl == null ? Duration.ofDays(30) : refreshTokenTtl;
        corsOrigins = corsOrigins == null ? List.of() : corsOrigins;
    }
}
