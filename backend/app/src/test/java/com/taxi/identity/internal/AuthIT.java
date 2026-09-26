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
        call(get("/api/me"), null, null, 401);
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
    }
}
