package com.taxi.notification.internal;

import java.util.Map;
import java.util.function.Function;

/** Push notification texts by kind and language ("fr" by default). */
final class Messages {

    private Messages() {}

    private record Text(Function<Map<String, Object>, String> fr, Function<Map<String, Object>, String> en) {}

    private static Text of(String fr, String en) {
        return new Text(p -> fr, p -> en);
    }

    private static final Map<String, Text> TEXTS = Map.ofEntries(
            Map.entry("driver_on_the_way", of("Votre chauffeur est en route", "Your driver is on the way")),
            Map.entry("driver_arriving", of("Votre chauffeur arrive dans environ 5 minutes",
                    "Your driver will arrive in about 5 minutes")),
            Map.entry("driver_arrived", of("Votre chauffeur est arrivé au point de prise en charge",
                    "Your driver has arrived at the pickup point")),
            // payload: from ("driver" / "client"), from_name (client's first name), preview (first 80 characters)
            Map.entry("ride_message", new Text(
                    p -> ("driver".equals(p.get("from")) ? "Message de votre chauffeur" : "Message de " + name(p, "client"))
                            + ": " + p.getOrDefault("preview", ""),
                    p -> ("driver".equals(p.get("from")) ? "Message from your driver" : "Message from " + name(p, "the client"))
                            + ": " + p.getOrDefault("preview", ""))),
            Map.entry("new_request", of("Nouvelle demande de course", "New ride request")),
            Map.entry("request_received", of("Demande envoyée, le chauffeur va confirmer", "Request sent, the driver will confirm")),
            Map.entry("ride_cancelled_confirmation", of("Votre course a bien été annulée", "Your ride has been cancelled")),
            Map.entry("ride_accepted", of("Votre course est confirmée", "Your ride is confirmed")),
            Map.entry("ride_booked", of("Votre course est réservée", "Your ride is booked")),
            Map.entry("price_proposed", new Text(
                    p -> "Le chauffeur propose " + p.get("price") + " €. Acceptez-vous ?",
                    p -> "The driver proposes €" + p.get("price") + ". Do you accept?")),
            Map.entry("price_accepted", of("Le client a accepté votre prix", "The customer accepted your price")),
            Map.entry("price_refused", of("Le client a refusé votre prix", "The customer refused your price")),
            Map.entry("ride_declined", of("Le chauffeur n'est pas disponible", "The driver is not available")),
            Map.entry("ride_cancelled_by_customer",
                    of("Une course a été annulée par le client", "A customer cancelled a ride")),
            Map.entry("ride_cancelled_by_driver", new Text(
                    p -> "Votre course a été annulée" + suffix(p, " : "),
                    p -> "Your ride was cancelled" + suffix(p, ": "))),
            Map.entry("ride_expired", of("Une demande a expiré sans réponse", "A request expired without an answer")),
            Map.entry("ride_completed", new Text(
                    p -> "Course terminée : " + p.get("final_price") + " €",
                    p -> "Ride completed: €" + p.get("final_price"))),
            Map.entry("ride_no_show", of("Course marquée comme non présentée", "Ride marked as no-show")),
            Map.entry("new_review", of("Nouvel avis client à valider", "New customer review to approve")),
            Map.entry("close_ride_reminder",
                    of("Course à clôturer : terminée ou client absent ?", "Ride to close: completed or no-show?")));

    static String text(String kind, String language, Map<String, Object> payload) {
        var t = TEXTS.get(kind);
        var en = "en".equals(language);
        if (t == null) {
            return en ? "Ride update" : "Mise à jour de votre course";
        }
        return (en ? t.en() : t.fr()).apply(payload == null ? Map.of() : payload);
    }

    static java.util.Set<String> kinds() {
        return TEXTS.keySet();
    }

    private static String name(Map<String, Object> p, String fallback) {
        var name = p.get("from_name");
        return name == null || name.toString().isBlank() ? fallback : name.toString();
    }

    private static String suffix(Map<String, Object> p, String sep) {
        var reason = p.get("reason");
        return reason == null || reason.toString().isBlank() ? "" : sep + reason;
    }
}
