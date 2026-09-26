// Push notification texts, by notification kind and language.

type Lang = "fr" | "en";
type Payload = Record<string, unknown>;

const texts: Record<string, Record<Lang, (p: Payload) => string>> = {
  new_request: { fr: () => "Nouvelle demande de course", en: () => "New ride request" },
  ride_accepted: { fr: () => "Votre course est confirmée", en: () => "Your ride is confirmed" },
  ride_booked: { fr: () => "Votre course est réservée", en: () => "Your ride is booked" },
  price_proposed: {
    fr: (p) => `Le chauffeur propose ${p.price} €. Acceptez-vous ?`,
    en: (p) => `The driver proposes €${p.price}. Do you accept?`,
  },
  price_accepted: { fr: () => "Le client a accepté votre prix", en: () => "The customer accepted your price" },
  price_refused: { fr: () => "Le client a refusé votre prix", en: () => "The customer refused your price" },
  ride_declined: { fr: () => "Le chauffeur n'est pas disponible", en: () => "The driver is not available" },
  ride_cancelled_by_customer: { fr: () => "Une course a été annulée par le client", en: () => "A customer cancelled a ride" },
  ride_cancelled_by_driver: {
    fr: (p) => `Votre course a été annulée${p.reason ? ` : ${p.reason}` : ""}`,
    en: (p) => `Your ride was cancelled${p.reason ? `: ${p.reason}` : ""}`,
  },
  ride_expired: { fr: () => "Une demande a expiré sans réponse", en: () => "A request expired without an answer" },
  ride_completed: {
    fr: (p) => `Course terminée : ${p.final_price} €`,
    en: (p) => `Ride completed: €${p.final_price}`,
  },
  ride_no_show: { fr: () => "Course marquée comme non présentée", en: () => "Ride marked as no-show" },
  close_ride_reminder: {
    fr: () => "Course à clôturer : terminée ou client absent ?",
    en: () => "Ride to close: completed or no-show?",
  },
};

export function messageFor(kind: string, lang: string, payload: Payload = {}): string {
  const l: Lang = lang === "en" ? "en" : "fr";
  return texts[kind]?.[l](payload) ?? (l === "fr" ? "Mise à jour de votre course" : "Ride update");
}

export const knownKinds = Object.keys(texts);
