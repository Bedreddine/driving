package com.taxi.identity;

import java.util.Optional;
import java.util.UUID;

/** Checks an access token outside normal HTTP requests (e.g. the WebSocket handshake). */
public interface AccessTokens {

    Optional<UUID> verify(String token);
}
