package com.taxi.notification.internal;

import com.taxi.identity.AccessTokens;
import java.io.IOException;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

/**
 * Live updates: open screens connect to /ws?token=ACCESS_TOKEN and receive {"type":"rides-changed"}
 * whenever one of their rides changes, then reload. (Browsers cannot send headers on WebSocket, hence the query.)
 */
@Component
class LiveUpdates extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(LiveUpdates.class);
    private static final String USER = "userId";
    private static final TextMessage RIDES_CHANGED = new TextMessage("{\"type\":\"rides-changed\"}");

    private final Map<UUID, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        var userId = (UUID) session.getAttributes().get(USER);
        var safe = new ConcurrentWebSocketSessionDecorator(session, 5_000, 64 * 1024);
        sessions.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(safe);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        var userId = (UUID) session.getAttributes().get(USER);
        var set = sessions.get(userId);
        if (set != null) {
            set.removeIf(s -> s.getId().equals(session.getId()));
        }
    }

    void ridesChanged(Collection<UUID> userIds) {
        for (var userId : Set.copyOf(userIds)) {
            for (var s : sessions.getOrDefault(userId, Set.of())) {
                try {
                    if (s.isOpen()) {
                        s.sendMessage(RIDES_CHANGED);
                    }
                } catch (IOException | IllegalStateException e) {
                    log.debug("Could not notify a closed session: {}", e.getMessage());
                }
            }
        }
    }

    int openSessions() {
        return sessions.values().stream().mapToInt(Set::size).sum();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebSocket
    static class Config implements WebSocketConfigurer {

        private final LiveUpdates handler;
        private final AccessTokens tokens;

        Config(LiveUpdates handler, AccessTokens tokens) {
            this.handler = handler;
            this.tokens = tokens;
        }

        @Override
        public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
            registry.addHandler(handler, "/ws").addInterceptors(new TokenCheck(tokens)).setAllowedOriginPatterns("*");
        }
    }

    /** Refuses the connection unless ?token= is a valid access token. */
    record TokenCheck(AccessTokens tokens) implements HandshakeInterceptor {

        @Override
        public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler h,
                                       Map<String, Object> attributes) {
            if (!(request instanceof ServletServerHttpRequest servlet)) {
                return false;
            }
            var userId = tokens.verify(servlet.getServletRequest().getParameter("token"));
            userId.ifPresent(id -> attributes.put(USER, id));
            if (userId.isEmpty()) {
                response.setStatusCode(org.springframework.http.HttpStatus.UNAUTHORIZED);
            }
            return userId.isPresent();
        }

        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler h,
                                   Exception exception) {}
    }
}
