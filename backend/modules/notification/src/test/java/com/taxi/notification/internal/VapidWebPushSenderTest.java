package com.taxi.notification.internal;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import com.taxi.notification.VapidKeys;
import java.net.InetSocketAddress;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** The web-push library works on this Java version with keys made by {@link VapidKeys}. */
class VapidWebPushSenderTest {

    @Test
    void sendsAnEncryptedMessageSignedWithTheVapidKey() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var seen = new ConcurrentHashMap<String, String>();
        server.createContext("/push/", exchange -> {
            seen.put("encoding", String.valueOf(exchange.getRequestHeaders().getFirst("Content-Encoding")));
            seen.put("authorization", String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
            seen.put("ttl", String.valueOf(exchange.getRequestHeaders().getFirst("TTL")));
            seen.put("length", String.valueOf(exchange.getRequestBody().readAllBytes().length));
            int status = exchange.getRequestURI().getPath().endsWith("gone") ? 410 : 201;
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        });
        server.start();
        try {
            var server_ = VapidKeys.generate();
            var keys = new WebPushKeys(server_.publicKey(), server_.privateKey(), "mailto:test@example.com",
                    new MockEnvironment());
            assertThat(keys.enabled()).isTrue();
            var sender = new VapidWebPushSender(keys);

            var browser = VapidKeys.generate().publicKey(); // any P-256 public key, as a browser's p256dh
            var auth = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);
            var base = "http://127.0.0.1:" + server.getAddress().getPort() + "/push/";
            var payload = "{\"title\":\"Taxi\",\"body\":\"Hello\"}".getBytes();

            assertThat(sender.send(base + "abc", browser, auth, payload)).isEqualTo(201);
            assertThat(seen).containsEntry("encoding", "aes128gcm").containsEntry("ttl", "14400");
            assertThat(seen.get("authorization")).startsWith("vapid t=").contains("k=" + server_.publicKey());
            assertThat(Integer.parseInt(seen.get("length"))).isGreaterThan(payload.length); // encrypted, padded
            assertThat(sender.send(base + "gone", browser, auth, payload)).isEqualTo(410);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void withoutKeysBrowserPushIsOff() {
        assertThat(new WebPushKeys("", "", "", new MockEnvironment()).publicKey()).isNull();
        assertThat(new WebPushKeys("bad", "keys", "", new MockEnvironment()).enabled()).isFalse();
        var dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        assertThat(new WebPushKeys("", "", "", dev).publicKey()).hasSize(87); // 65 bytes, base64url
    }

    @Test
    void endpointsAndKeysAreChecked() {
        assertThat(WebPushController.validEndpoint("https://fcm.googleapis.com/fcm/send/abc")).isTrue();
        for (var bad : new String[] {"http://fcm.googleapis.com/x", "https://localhost/x", "https://127.0.0.1/x",
                "https://[::1]/x", "https://intranet/x", "https://a:b@push.example.com/x", "javascript:x",
                "https://push.example.com/" + "x".repeat(1000)}) {
            assertThat(WebPushController.validEndpoint(bad)).as(bad).isFalse();
        }
        assertThat(WebPushController.base64url(VapidKeys.generate().publicKey(), 65)).isTrue();
        assertThat(WebPushController.base64url("AAAAAAAAAAAAAAAAAAAAAA", 16)).isTrue();
        assertThat(WebPushController.base64url("AAAA", 16)).isFalse();
        assertThat(WebPushController.base64url("not base64!", 16)).isFalse();
    }
}
