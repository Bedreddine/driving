package com.taxi.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.taxi.support.IntegrationTest;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AuthIT extends IntegrationTest {

    @Test
    void signUpGivesTheCustomerRoleAndAContact() throws Exception {
        var me = call(get("/api/me"), clientToken, null, 200);
        assertThat(me.get("email").asString()).isEqualTo("client@taxi.test");
        assertThat(me.get("roles").get(0).asString()).isEqualTo("customer");
        assertThat(contactOf(clientId)).isNotNull();

        var owner = call(get("/api/me"), ownerToken, null, 200);
        assertThat(owner.get("roles").toString()).contains("admin", "driver");
    }

    @Test
    void signUpValidatesInput() throws Exception {
        assertThat(errorOf(post("/api/auth/signup"), null, Map.of("email", "CLIENT@taxi.test", "password", "password123"), 409))
                .isEqualTo("EMAIL_TAKEN");
        assertThat(errorOf(post("/api/auth/signup"), null, Map.of("email", "new@taxi.test", "password", "short"), 400))
                .isEqualTo("WEAK_PASSWORD");
        assertThat(errorOf(post("/api/auth/signup"), null, Map.of("email", "not-an-email", "password", "password123"), 400))
                .isEqualTo("BAD_EMAIL");
    }

    @Test
    void wrongPasswordIsRefused() throws Exception {
        assertThat(errorOf(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "nope"), 401))
                .isEqualTo("INVALID_CREDENTIALS");
        assertThat(errorOf(post("/api/auth/login"), null, Map.of("email", "nobody@taxi.test", "password", "nope"), 401))
                .isEqualTo("INVALID_CREDENTIALS");
    }

    @Test
    void refreshTokensWorkOnceAndLogoutRevokes() throws Exception {
        var tokens = call(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "password123"), 200);
        var refresh = tokens.get("refresh_token").asString();

        var renewed = call(post("/api/auth/refresh"), null, Map.of("refresh_token", refresh), 200);
        assertThat(renewed.get("access_token").asString()).isNotBlank();
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", refresh), 401); // already used

        var next = renewed.get("refresh_token").asString();
        call(post("/api/auth/logout"), null, Map.of("refresh_token", next), 204);
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", next), 401);
    }

    @Test
    void forgedOrMissingTokensAreRejected() throws Exception {
        assertThat(errorOf(get("/api/me"), null, null, 401)).isEqualTo("UNAUTHENTICATED");
        call(get("/api/me"), clientToken.substring(0, clientToken.length() - 3) + "abc", null, 401);
    }

    @Test
    void profileCanBeUpdatedAndThePhoneCleared() throws Exception {
        var body = new HashMap<String, Object>();
        body.put("full_name", "New Name");
        body.put("language", "en");
        body.put("phone", "");
        var me = call(patch("/api/me"), clientToken, body, 200);
        assertThat(me.get("full_name").asString()).isEqualTo("New Name");
        assertThat(me.get("language").asString()).isEqualTo("en");
        assertThat(me.get("phone").isNull()).isTrue();
        // The driver sees the same name and language on the customer card
        var contact = jdbc.sql("select full_name, language from contacts where user_id = :u").param("u", clientId).query().singleRow();
        assertThat(contact).containsEntry("full_name", "New Name").containsEntry("language", "en");
    }

    @Test
    void everyErrorHasTheSameShape() throws Exception {
        assertThat(errorOf(get("/api/does-not-exist"), clientToken, null, 404)).isEqualTo("NOT_FOUND");
        assertThat(errorOf(get("/api/admin/working-hours"), clientToken, null, 403)).isEqualTo("FORBIDDEN");
        assertThat(errorOf(get("/actuator/modulith"), clientToken, null, 403)).isEqualTo("FORBIDDEN");
        // A surcharge for a driver that does not exist: refused as bad input, not a server error
        assertThat(errorOf(post("/api/admin/pricing/" + java.util.UUID.randomUUID() + "/surcharges"), ownerToken,
                Map.of("name", "x", "days", java.util.List.of(1), "start_time", "20:00", "end_time", "22:00", "percent", 10), 400))
                .isEqualTo("BAD_INPUT");
    }

    // ------------------------------------------------------------------ security

    @Test
    void aReplayedRefreshTokenEndsTheWholeSignIn() throws Exception {
        var first = call(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "password123"), 200)
                .get("refresh_token").asString();
        var second = call(post("/api/auth/refresh"), null, Map.of("refresh_token", first), 200).get("refresh_token").asString();

        // Someone replays the first token (a copy): refused, and the token the real user holds stops working too.
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", first), 401);
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", second), 401);

        // Other sign-ins (another phone) are not affected.
        var other = call(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "password123"), 200)
                .get("refresh_token").asString();
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", other), 200);
        // Unknown tokens are simply refused.
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", "x".repeat(43)), 401);
        call(post("/api/auth/refresh"), null, new HashMap<String, Object>(), 401);
    }

    @Test
    void logoutEndsTheSignInEvenWithAnOlderToken() throws Exception {
        var first = call(post("/api/auth/login"), null, Map.of("email", "client@taxi.test", "password", "password123"), 200)
                .get("refresh_token").asString();
        var second = call(post("/api/auth/refresh"), null, Map.of("refresh_token", first), 200).get("refresh_token").asString();
        call(post("/api/auth/logout"), null, Map.of("refresh_token", second), 204);
        call(post("/api/auth/refresh"), null, Map.of("refresh_token", second), 401);
        assertThat(jdbc.sql("select count(*) from refresh_tokens where revoked_at is null and user_id = :u")
                .param("u", clientId).query(Integer.class).single()).as("only the sign-up session is left").isEqualTo(1);
    }

    @Test
    void passwordsLongerThanBcryptAcceptsAreHandled() throws Exception {
        var tooLong = "p".repeat(73);
        assertThat(errorOf(post("/api/auth/signup"), null, Map.of("email", "long@taxi.test", "password", tooLong), 400))
                .isEqualTo("PASSWORD_TOO_LONG");
        call(post("/api/auth/signup"), null, Map.of("email", "long@taxi.test", "password", "p".repeat(72)), 201);
        // At login: a wrong password like any other, not a server error.
        assertThat(errorOf(post("/api/auth/login"), null, Map.of("email", "long@taxi.test", "password", tooLong), 401))
                .isEqualTo("INVALID_CREDENTIALS");
        assertThat(errorOf(post("/api/auth/signup"), null,
                Map.of("email", "a".repeat(250) + "@x.fr", "password", "password123"), 400)).isEqualTo("BAD_EMAIL");
    }

    @Test
    void tokensFromAnotherIssuerOrWithoutSignatureAreRejected() throws Exception {
        var now = java.time.Instant.now();
        java.util.function.Function<String, String> sign = issuer -> hs256("{\"iss\":\"" + issuer + "\",\"sub\":\"" + clientId
                + "\",\"iat\":" + now.getEpochSecond() + ",\"exp\":" + (now.getEpochSecond() + 60) + ",\"roles\":[\"customer\"]}");
        call(get("/api/me"), sign.apply("taxi"), null, 200); // same key and issuer: accepted
        call(get("/api/me"), sign.apply("someone-else"), null, 401);
        var expired = hs256("{\"iss\":\"taxi\",\"sub\":\"" + clientId + "\",\"iat\":" + (now.getEpochSecond() - 1200)
                + ",\"exp\":" + (now.getEpochSecond() - 300) + "}");
        call(get("/api/me"), expired, null, 401);

        // alg "none" with the client's claims but an admin role: refused.
        var b64 = java.util.Base64.getUrlEncoder().withoutPadding();
        var none = b64.encodeToString("{\"alg\":\"none\"}".getBytes()) + "."
                + b64.encodeToString(("{\"iss\":\"taxi\",\"sub\":\"" + clientId + "\",\"exp\":"
                + (now.getEpochSecond() + 60) + ",\"roles\":[\"admin\"]}").getBytes()) + ".";
        call(get("/api/admin/working-hours"), none, null, 401);
    }

    /** A token signed with the test secret (HS256), with the given claims. */
    private static String hs256(String claims) {
        try {
            var b64 = java.util.Base64.getUrlEncoder().withoutPadding();
            var unsigned = b64.encodeToString("{\"alg\":\"HS256\"}".getBytes()) + "." + b64.encodeToString(claims.getBytes());
            var mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(
                    "integration-test-secret-0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return unsigned + "." + b64.encodeToString(mac.doFinal(unsigned.getBytes()));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void theExampleJwtSecretIsRefusedAtStartup() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new SecurityProperties(
                        "change-me-to-at-least-32-random-characters-please", null, null, null))
                .isInstanceOf(IllegalStateException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new SecurityProperties("too-short", null, null, null))
                .isInstanceOf(IllegalStateException.class);
    }
}
