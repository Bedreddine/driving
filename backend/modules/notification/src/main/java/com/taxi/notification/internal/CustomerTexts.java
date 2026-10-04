package com.taxi.notification.internal;

import com.taxi.booking.Business;
import com.taxi.booking.RideChanged;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Email and SMS texts sent to customers (guests and account holders), in French or English. */
final class CustomerTexts {

    private CustomerTexts() {}

    record Email(String subject, String body) {}

    /** Kinds that are worth an email / SMS to the customer. */
    static final Set<String> KINDS = Set.of("request_received", "ride_accepted", "ride_booked", "price_proposed",
            "ride_declined", "ride_cancelled_by_driver", "ride_cancelled_confirmation", "ride_expired", "ride_completed");

    static Email email(String kind, Map<String, Object> payload, RideChanged.Customer c, RideChanged.Trip trip,
                       Business.Info business) {
        var en = "en".equals(c.language());
        var when = when(trip, en);
        var link = business.rideLink(trip.accessToken());
        var headline = headline(kind, payload, en, trip);
        var body = new StringBuilder()
                .append(en ? "Hello " : "Bonjour ").append(c.fullName()).append(",\n\n")
                .append(headline).append("\n\n")
                .append(en ? "Pickup: " : "Départ : ").append(when).append("\n")
                .append(en ? "From: " : "De : ").append(trip.pickupAddress()).append("\n")
                .append(en ? "To: " : "À : ").append(trip.dropoffAddress()).append("\n");
        if (link != null && "ride_completed".equals(kind)) {
            // Same private link: the ride page lets the client leave a review once the ride is completed.
            body.append("\n").append(en ? "How was your ride? Leave us a review: " : "Votre avis compte : laissez-nous un avis sur votre course : ")
                    .append(link).append("\n");
        } else if (link != null) {
            body.append("\n").append(en ? "Follow or manage your ride: " : "Suivre ou gérer votre course : ").append(link).append("\n");
        }
        if (business.phone() != null) {
            body.append("\n").append(en ? "Questions? Call " : "Une question ? Appelez le ").append(business.phone()).append("\n");
        }
        body.append("\n").append(business.name());
        var subject = business.name() + " – " + subject(kind, en);
        return new Email(subject, body.toString());
    }

    /** The one-line text of a notice, e.g. for a browser push. */
    static String line(String kind, Map<String, Object> payload, String language, RideChanged.Trip trip) {
        return headline(kind, payload, "en".equals(language), trip);
    }

    static String sms(String kind, Map<String, Object> payload, RideChanged.Customer c, RideChanged.Trip trip,
                      Business.Info business) {
        var en = "en".equals(c.language());
        var link = business.rideLink(trip.accessToken());
        return business.name() + ": " + headline(kind, payload, en, trip) + " (" + when(trip, en) + ")"
                + (link == null ? "" : " " + link);
    }

    private static String when(RideChanged.Trip trip, boolean en) {
        var fmt = DateTimeFormatter.ofPattern(en ? "EEE d MMM, HH:mm" : "EEE d MMM 'à' HH:mm", en ? Locale.UK : Locale.FRANCE);
        return trip.pickupAt().atZone(ZoneId.of(trip.timezone() == null ? "Europe/Paris" : trip.timezone())).format(fmt);
    }

    private static String subject(String kind, boolean en) {
        return switch (kind) {
            case "request_received" -> en ? "Booking request received" : "Demande de réservation reçue";
            case "ride_accepted", "ride_booked" -> en ? "Your ride is confirmed" : "Votre course est confirmée";
            case "price_proposed" -> en ? "Price proposal for your ride" : "Proposition de prix pour votre course";
            case "ride_declined" -> en ? "Ride not available" : "Course indisponible";
            case "ride_cancelled_by_driver" -> en ? "Your ride was cancelled" : "Votre course a été annulée";
            case "ride_cancelled_confirmation" -> en ? "Cancellation confirmed" : "Annulation confirmée";
            case "ride_expired" -> en ? "Booking request expired" : "Demande expirée";
            case "ride_completed" -> en ? "Thank you for riding with us" : "Merci pour votre confiance";
            case "driver_on_the_way" -> en ? "Your driver is on the way" : "Votre chauffeur est en route";
            case "driver_arriving" -> en ? "Your driver is arriving" : "Votre chauffeur arrive";
            case "driver_arrived" -> en ? "Your driver has arrived" : "Votre chauffeur est arrivé";
            default -> en ? "Ride update" : "Mise à jour de votre course";
        };
    }

    private static String headline(String kind, Map<String, Object> p, boolean en, RideChanged.Trip trip) {
        return switch (kind) {
            case "request_received" -> en
                    ? "We received your booking request. The driver will confirm it shortly."
                    : "Nous avons bien reçu votre demande. Le chauffeur va la confirmer rapidement.";
            case "ride_accepted", "ride_booked" -> en ? "Your ride is confirmed." : "Votre course est confirmée.";
            case "price_proposed" -> en
                    ? "The driver proposes " + money(p.get("price"), trip, true) + " for this ride. Please accept or refuse it."
                    : "Le chauffeur propose " + money(p.get("price"), trip, false) + " pour cette course. Merci de l'accepter ou de la refuser.";
            case "ride_declined" -> en
                    ? "Unfortunately the driver is not available for this ride."
                    : "Malheureusement, le chauffeur n'est pas disponible pour cette course.";
            case "ride_cancelled_by_driver" -> (en ? "The driver had to cancel your ride." : "Le chauffeur a dû annuler votre course.")
                    + reason(p, en);
            case "ride_cancelled_confirmation" -> en ? "Your ride has been cancelled." : "Votre course a bien été annulée.";
            case "ride_expired" -> en
                    ? "Your request could not be confirmed in time. Please book again or call us."
                    : "Votre demande n'a pas pu être confirmée à temps. Merci de réserver à nouveau ou de nous appeler.";
            case "ride_completed" -> (en
                    ? "Thank you for your ride. Total: " + money(p.get("final_price"), trip, true) + "."
                    : "Merci pour votre course. Total : " + money(p.get("final_price"), trip, false) + ".")
                    + reason(p, en);
            case "driver_on_the_way" -> en ? "Your driver is on the way." : "Votre chauffeur est en route.";
            case "driver_arriving" -> en
                    ? "Your driver will arrive in about 5 minutes."
                    : "Votre chauffeur arrive dans environ 5 minutes.";
            case "driver_arrived" -> en
                    ? "Your driver has arrived at the pickup point."
                    : "Votre chauffeur est arrivé au point de prise en charge.";
            default -> en ? "Your ride was updated." : "Votre course a été mise à jour.";
        };
    }

    private static String reason(Map<String, Object> p, boolean en) {
        var r = p.get("reason");
        return r == null || r.toString().isBlank() ? "" : (en ? " Reason: " : " Raison : ") + r;
    }

    private static String money(Object amount, RideChanged.Trip trip, boolean en) {
        var currency = "EUR".equals(trip.currency()) ? "€" : trip.currency();
        return en ? currency + amount : amount + " " + currency;
    }
}
