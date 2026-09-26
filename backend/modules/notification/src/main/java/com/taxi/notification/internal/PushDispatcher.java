package com.taxi.notification.internal;

import com.taxi.identity.UserDirectory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/**
 * Sends stored notifications to phones through Expo's free push service, every 30 seconds.
 * Notifications for people without a phone token are marked as sent too: they see them in the app.
 */
@Component
class PushDispatcher {

    record ExpoMessage(String to, String title, String body, Map<String, Object> data) {}

    private record ExpoTicket(String status, Map<String, Object> details) {}

    private record ExpoResponse(List<ExpoTicket> data) {}

    private static final Logger log = LoggerFactory.getLogger(PushDispatcher.class);

    private final NotificationRepository repo;
    private final UserDirectory users;
    private final JsonMapper json;
    private final RestClient http;
    private final boolean enabled;

    PushDispatcher(NotificationRepository repo, UserDirectory users, JsonMapper json, RestClient.Builder builder,
                   @Value("${taxi.push.expo-url:https://exp.host/--/api/v2/push/send}") String expoUrl,
                   @Value("${taxi.push.enabled:true}") boolean enabled) {
        this.repo = repo;
        this.users = users;
        this.json = json;
        this.http = builder.baseUrl(expoUrl).build();
        this.enabled = enabled;
    }

    @Scheduled(fixedDelayString = "${taxi.push.delay:PT30S}", initialDelayString = "PT20S")
    @Transactional
    void dispatch() {
        if (!enabled) {
            return;
        }
        var pending = repo.unpushed(200);
        if (pending.isEmpty()) {
            return;
        }
        var recipients = pending.stream().map(NotificationRepository.Notification::recipientId).distinct().toList();
        var tokens = repo.tokens(recipients);
        var languages = users.languages(recipients);

        var messages = new ArrayList<ExpoMessage>();
        for (var n : pending) {
            var payload = readPayload(n.payload());
            var text = Messages.text(n.kind(), languages.getOrDefault(n.recipientId(), "fr"), payload);
            var data = new java.util.HashMap<String, Object>();
            data.put("kind", n.kind());
            data.put("ride_id", n.rideId() == null ? null : n.rideId().toString());
            tokens.stream().filter(t -> t.userId().equals(n.recipientId()))
                    .forEach(t -> messages.add(new ExpoMessage(t.token(), "Taxi", text, data)));
        }

        var invalid = new ArrayList<String>();
        for (int i = 0; i < messages.size(); i += 100) { // Expo accepts up to 100 per request
            var batch = messages.subList(i, Math.min(i + 100, messages.size()));
            try {
                var response = http.post().body(batch).retrieve().body(ExpoResponse.class);
                if (response != null && response.data() != null) {
                    for (int j = 0; j < response.data().size() && j < batch.size(); j++) {
                        var ticket = response.data().get(j);
                        if ("error".equals(ticket.status()) && ticket.details() != null
                                && "DeviceNotRegistered".equals(ticket.details().get("error"))) {
                            invalid.add(batch.get(j).to());
                        }
                    }
                }
            } catch (RuntimeException e) {
                // Leave them unpushed; the next run retries.
                log.warn("Expo push failed, will retry: {}", e.getMessage());
                return;
            }
        }
        repo.deleteTokens(invalid);
        repo.markPushed(pending.stream().map(NotificationRepository.Notification::id).toList());
    }

    @Scheduled(cron = "0 45 3 * * *", zone = "UTC")
    @Transactional
    void retention() {
        repo.deleteOlderThan90Days();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readPayload(String payload) {
        try {
            return payload == null ? Map.of() : json.readValue(payload, Map.class);
        } catch (RuntimeException e) {
            return Map.of();
        }
    }
}
