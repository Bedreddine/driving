// Places clients ask for most often from Paris: airports, stations, palace hotels.
// Picking one fills the address in one tap; the coordinates are the drop-off / pickup doors.
import type { LngLat } from './mapStyle';

export type PlaceKind = 'airport' | 'station' | 'palace';

export type SuggestedPlace = {
  id: string;
  kind: PlaceKind;
  name: { fr: string; en: string };
  detail: { fr: string; en: string };
  /** Short form for the route line: "RITZ → CDG 2E". */
  short: string;
  /** Full address sent with the booking. */
  address: string;
  lngLat: LngLat;
};

const p = (
  id: string,
  kind: PlaceKind,
  fr: string,
  en: string,
  detailFr: string,
  detailEn: string,
  short: string,
  address: string,
  lngLat: LngLat,
): SuggestedPlace => ({ id, kind, name: { fr, en }, detail: { fr: detailFr, en: detailEn }, short, address, lngLat });

export const SUGGESTED_PLACES: SuggestedPlace[] = [
  p('cdg-2e', 'airport', 'Aéroport CDG · Terminal 2E', 'CDG Airport · Terminal 2E', 'Roissy-Charles-de-Gaulle', 'Roissy-Charles-de-Gaulle', 'CDG 2E', 'Aéroport Paris-Charles-de-Gaulle, Terminal 2E, 95700 Roissy-en-France', [2.571, 49.004]),
  p('cdg-1', 'airport', 'Aéroport CDG · Terminal 1', 'CDG Airport · Terminal 1', 'Roissy-Charles-de-Gaulle', 'Roissy-Charles-de-Gaulle', 'CDG 1', 'Aéroport Paris-Charles-de-Gaulle, Terminal 1, 95700 Roissy-en-France', [2.5479, 49.0097]),
  p('orly-4', 'airport', "Aéroport d'Orly · Orly 4", 'Orly Airport · Orly 4', 'Orly', 'Orly', 'ORLY 4', "Aéroport de Paris-Orly, Orly 4, 94390 Orly", [2.3652, 48.7262]),
  p('beauvais', 'airport', 'Aéroport de Beauvais', 'Beauvais Airport', 'Tillé', 'Tillé', 'BEAUVAIS', 'Aéroport Beauvais-Tillé, 60000 Tillé', [2.1128, 49.4545]),
  p('le-bourget', 'airport', 'Aéroport du Bourget', 'Le Bourget Airport', 'Aviation d’affaires', 'Business aviation', 'LE BOURGET', 'Aéroport de Paris-Le Bourget, 93350 Le Bourget', [2.4414, 48.9694]),
  p('gare-du-nord', 'station', 'Gare du Nord', 'Gare du Nord', 'Eurostar · Thalys', 'Eurostar · Thalys', 'GARE DU NORD', 'Gare du Nord, 18 Rue de Dunkerque, 75010 Paris', [2.3553, 48.8809]),
  p('gare-de-lyon', 'station', 'Gare de Lyon', 'Gare de Lyon', 'TGV Sud-Est', 'TGV South-East', 'GARE DE LYON', 'Gare de Lyon, Place Louis-Armand, 75012 Paris', [2.3744, 48.8443]),
  p('montparnasse', 'station', 'Gare Montparnasse', 'Montparnasse Station', 'TGV Atlantique', 'TGV Atlantic', 'MONTPARNASSE', 'Gare Montparnasse, 17 Boulevard de Vaugirard, 75015 Paris', [2.3205, 48.8412]),
  p('gare-de-l-est', 'station', "Gare de l'Est", "Gare de l'Est", 'TGV Est', 'TGV East', "GARE DE L'EST", "Gare de l'Est, Place du 11 Novembre 1918, 75010 Paris", [2.3592, 48.8768]),
  p('saint-lazare', 'station', 'Gare Saint-Lazare', 'Saint-Lazare Station', 'Normandie', 'Normandy', 'SAINT-LAZARE', 'Gare Saint-Lazare, 13 Rue d’Amsterdam, 75008 Paris', [2.3255, 48.8763]),
  p('ritz', 'palace', 'Le Ritz Paris', 'The Ritz Paris', 'Place Vendôme', 'Place Vendôme', 'RITZ', 'Ritz Paris, 15 Place Vendôme, 75001 Paris', [2.329, 48.8681]),
  p('plaza-athenee', 'palace', 'Plaza Athénée', 'Plaza Athénée', 'Avenue Montaigne', 'Avenue Montaigne', 'PLAZA ATHÉNÉE', 'Hôtel Plaza Athénée, 25 Avenue Montaigne, 75008 Paris', [2.3043, 48.8661]),
  p('le-bristol', 'palace', 'Le Bristol', 'Le Bristol', 'Faubourg Saint-Honoré', 'Faubourg Saint-Honoré', 'BRISTOL', 'Le Bristol Paris, 112 Rue du Faubourg Saint-Honoré, 75008 Paris', [2.3147, 48.8717]),
  p('crillon', 'palace', 'Hôtel de Crillon', 'Hôtel de Crillon', 'Place de la Concorde', 'Place de la Concorde', 'CRILLON', 'Hôtel de Crillon, 10 Place de la Concorde, 75008 Paris', [2.3211, 48.8676]),
  p('george-v', 'palace', 'Four Seasons George V', 'Four Seasons George V', 'Avenue George V', 'Avenue George V', 'GEORGE V', 'Four Seasons Hotel George V, 31 Avenue George V, 75008 Paris', [2.3005, 48.8688]),
  p('peninsula', 'palace', 'The Peninsula', 'The Peninsula', 'Avenue Kléber', 'Avenue Kléber', 'PENINSULA', 'The Peninsula Paris, 19 Avenue Kléber, 75116 Paris', [2.2935, 48.8706]),
  p('shangri-la', 'palace', 'Shangri-La Paris', 'Shangri-La Paris', 'Avenue d’Iéna', 'Avenue d’Iéna', 'SHANGRI-LA', 'Shangri-La Paris, 10 Avenue d’Iéna, 75116 Paris', [2.2935, 48.8634]),
  p('cheval-blanc', 'palace', 'Cheval Blanc Paris', 'Cheval Blanc Paris', 'Pont Neuf', 'Pont Neuf', 'CHEVAL BLANC', 'Cheval Blanc Paris, 8 Quai du Louvre, 75001 Paris', [2.3425, 48.8589]),
];

/** "Hôtel Ritz Paris, 15 Place Vendôme, …" → "HÔTEL RITZ PARIS", for addresses that are not suggested places. */
export function shortName(address: string) {
  const first = address.split(',')[0].trim().toUpperCase();
  return first.length > 22 ? `${first.slice(0, 21)}…` : first;
}
