package com.taxi.notification.internal;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.apache.http.util.EntityUtils;
import org.springframework.stereotype.Component;

/**
 * Standard Web Push (RFC 8030 / 8291 / 8292) with the server's VAPID keys. The web-push library encrypts the
 * message and signs the VAPID header; the JDK's HTTP client sends it (timeouts, no redirects followed).
 */
@Component
class VapidWebPushSender implements WebPushSender {

    /** A ride-day message is worthless after a few hours: the push service drops it if the browser stays offline. */
    private static final int TTL_SECONDS = 4 * 3600;
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    /** Headers the JDK client sets itself. */
    private static final Set<String> RESTRICTED = Set.of("content-length", "host", "connection", "expect", "upgrade");

    private final WebPushKeys keys;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private volatile PushService service;

    VapidWebPushSender(WebPushKeys keys) {
        this.keys = keys;
    }

    @Override
    public int send(String endpoint, String p256dh, String auth, byte[] payload) throws Exception {
        var notification = new Notification(endpoint, p256dh, auth, payload, TTL_SECONDS);
        var post = service().preparePost(notification, Encoding.AES128GCM);
        var request = HttpRequest.newBuilder(URI.create(endpoint)).timeout(TIMEOUT);
        for (var h : post.getAllHeaders()) {
            if (!RESTRICTED.contains(h.getName().toLowerCase(Locale.ROOT))) {
                request.setHeader(h.getName(), h.getValue());
            }
        }
        if (post.getEntity() != null && post.getEntity().getContentType() != null) {
            request.setHeader("Content-Type", post.getEntity().getContentType().getValue());
        }
        var body = post.getEntity() == null ? new byte[0] : EntityUtils.toByteArray(post.getEntity());
        request.POST(HttpRequest.BodyPublishers.ofByteArray(body));
        return http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    private PushService service() throws Exception {
        if (service == null) {
            synchronized (this) {
                if (service == null) {
                    if (!keys.enabled()) {
                        throw new IllegalStateException("browser push is off");
                    }
                    service = new PushService(keys.publicKey(), keys.privateKey(), keys.subject());
                }
            }
        }
        return service;
    }
}
