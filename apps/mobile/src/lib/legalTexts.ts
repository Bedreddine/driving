// The three legal pages (mentions légales, CGV, privacy policy), in French and English, filled with the
// company details the owner enters in the back office. A template to have checked by a professional:
// the back office says so; the facts about data (what is kept, how long, who receives it) match the code.
import type { Lang } from './i18n';
import type { BusinessInfo, LegalInfo } from './publicApi';

export type LegalPage = 'legal' | 'terms' | 'privacy';
export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = { title: string; sections: LegalSection[] };

/** Fields a business site must show; the back office lists the missing ones. */
export const REQUIRED_LEGAL: (keyof LegalInfo)[] = ['company_name', 'legal_form', 'siret', 'address', 'publication_director', 'host_name', 'host_address', 'mediator_name'];

export function missingLegal(b: BusinessInfo | null): (keyof LegalInfo)[] {
  return REQUIRED_LEGAL.filter((k) => !b?.legal?.[k]);
}

const dash = '—';
const v = (x: string | null | undefined) => (x && x.trim() ? x.trim() : dash);
const money = (n: number | null | undefined, lang: Lang) =>
  n ? new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: 'EUR' }).format(n) : null;

export function legalDoc(page: LegalPage, b: BusinessInfo | null, lang: Lang, waitingPerMinute?: number | null): LegalDoc {
  const l: Partial<LegalInfo> = b?.legal ?? {};
  const name = v(l.company_name ?? b?.name);
  const brand = b?.name ?? name;
  const email = v(b?.email);
  const phone = v(b?.phone);
  const site = v(b?.site_url);
  const fr = lang === 'fr';
  const waiting = money(waitingPerMinute, lang);

  if (page === 'legal') {
    return fr
      ? {
          title: 'Mentions légales',
          sections: [
            {
              heading: 'Éditeur du site',
              paragraphs: [
                `${name} (${brand}), ${v(l.legal_form)}.`,
                `Adresse : ${v(l.address)}.`,
                `SIRET : ${v(l.siret)}. TVA intracommunautaire : ${v(l.vat_number)}.`,
                `Inscription au registre des exploitants de voitures de transport avec chauffeur (VTC) : ${v(l.evtc_number)}.`,
                `Contact : ${email} · ${phone}.`,
                `Directeur de la publication : ${v(l.publication_director)}.`,
              ],
            },
            { heading: 'Hébergement', paragraphs: [`${v(l.host_name)}, ${v(l.host_address)}.`] },
            {
              heading: 'Crédits',
              paragraphs: [
                'Cartes : © les contributeurs OpenStreetMap, OpenMapTiles, OpenFreeMap. Recherche d’adresses : Photon (komoot). Itinéraires : OSRM.',
                'Polices Instrument Serif, Manrope et JetBrains Mono sous licence SIL Open Font License. Icônes Feather sous licence MIT.',
              ],
            },
            { heading: 'Propriété intellectuelle', paragraphs: [`Les textes, photos et éléments graphiques propres à ${brand} ne peuvent être réutilisés sans autorisation.`] },
          ],
        }
      : {
          title: 'Legal notice',
          sections: [
            {
              heading: 'Publisher',
              paragraphs: [
                `${name} (${brand}), ${v(l.legal_form)}.`,
                `Address: ${v(l.address)}.`,
                `SIRET: ${v(l.siret)}. EU VAT number: ${v(l.vat_number)}.`,
                `Registered as a French private-hire (VTC) operator: ${v(l.evtc_number)}.`,
                `Contact: ${email} · ${phone}.`,
                `Publication director: ${v(l.publication_director)}.`,
              ],
            },
            { heading: 'Hosting', paragraphs: [`${v(l.host_name)}, ${v(l.host_address)}.`] },
            {
              heading: 'Credits',
              paragraphs: [
                'Maps: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap. Address search: Photon (komoot). Routes: OSRM.',
                'Fonts Instrument Serif, Manrope and JetBrains Mono under the SIL Open Font License. Feather icons under the MIT licence.',
              ],
            },
            { heading: 'Intellectual property', paragraphs: [`Texts, photos and graphics belonging to ${brand} may not be reused without permission.`] },
          ],
        };
  }

  if (page === 'terms') {
    return fr
      ? {
          title: 'Conditions générales de vente',
          sections: [
            { heading: '1. Objet', paragraphs: [`Les présentes conditions s’appliquent aux courses de transport de personnes avec chauffeur réservées auprès de ${name} (${brand}) sur ${site} ou l’application.`] },
            {
              heading: '2. Réservation',
              paragraphs: [
                'Le client indique le départ, l’arrivée, la date, l’heure, le nombre de passagers et de bagages, ses options et ses coordonnées, puis envoie une demande.',
                'La demande devient une réservation lorsque le chauffeur la confirme ; le client en est informé par e-mail et sur sa page de suivi. Si le chauffeur propose un autre prix, la réservation n’est confirmée que si le client l’accepte avant l’heure limite indiquée.',
              ],
            },
            {
              heading: '3. Prix',
              paragraphs: [
                'Le prix est affiché en euros, toutes taxes comprises, avant l’envoi de la demande. Il tient compte du trajet, de l’heure (majorations éventuelles de nuit ou de week-end) et des options choisies, dont le prix est indiqué à côté de chacune.',
                'Le prix confirmé est le prix dû, sauf changement de trajet demandé pendant la course' +
                  (waiting ? ` ou attente au-delà du temps inclus, facturée ${waiting} la minute.` : '.'),
              ],
            },
            { heading: '4. Paiement', paragraphs: [`Aucun paiement n’est demandé en ligne. La course est réglée au chauffeur à la fin du trajet. Moyens acceptés : ${v(l.payment_methods)}.`] },
            {
              heading: '5. Annulation',
              paragraphs: [
                'Le client peut annuler sans frais depuis sa page de suivi jusqu’à l’heure de prise en charge. Passé cette heure, il contacte directement le chauffeur.',
                'Le chauffeur peut refuser ou annuler une course en cas d’indisponibilité ; le client en est informé immédiatement.',
              ],
            },
            { heading: '6. Droit de rétractation', paragraphs: ['Conformément à l’article L221-2 du Code de la consommation, le droit de rétractation ne s’applique pas aux contrats de transport de passagers.'] },
            {
              heading: '7. À bord',
              paragraphs: [
                'Le véhicule est non-fumeur. Les enfants voyagent dans un siège adapté, à demander lors de la réservation. Le client reste responsable de ses bagages et objets personnels ; les objets oubliés sont conservés et restitués sur demande.',
              ],
            },
            { heading: '8. Responsabilité et assurance', paragraphs: [`Assurance : ${v(l.insurance)}.`] },
            {
              heading: '9. Réclamations et médiation',
              paragraphs: [
                `Toute réclamation est à adresser à ${email}.`,
                `À défaut de solution, le client peut recourir gratuitement au médiateur de la consommation : ${v(l.mediator_name)}${l.mediator_url ? ` (${l.mediator_url})` : ''}.`,
              ],
            },
            { heading: '10. Données personnelles', paragraphs: ['Voir la politique de confidentialité.'] },
            { heading: '11. Droit applicable', paragraphs: ['Les présentes conditions sont soumises au droit français.'] },
          ],
        }
      : {
          title: 'Terms of sale',
          sections: [
            { heading: '1. Scope', paragraphs: [`These terms apply to chauffeur rides booked with ${name} (${brand}) on ${site} or the app.`] },
            {
              heading: '2. Booking',
              paragraphs: [
                'The client gives the pickup, drop-off, date, time, passengers, luggage, options and contact details, then sends a request.',
                'The request becomes a booking when the driver confirms it; the client is told by email and on their ride page. If the driver proposes another price, the booking is confirmed only if the client accepts it before the deadline shown.',
              ],
            },
            {
              heading: '3. Price',
              paragraphs: [
                'The price is shown in euros, all taxes included, before the request is sent. It reflects the trip, the time (any night or weekend surcharge) and the chosen options, each shown with its price.',
                'The confirmed price is the price due, unless the trip is changed at the client’s request during the ride' + (waiting ? ` or waiting exceeds the included time, charged ${waiting} per minute.` : '.'),
              ],
            },
            { heading: '4. Payment', paragraphs: [`No payment is taken online. The ride is paid to the driver at the end of the trip. Accepted: ${v(l.payment_methods)}.`] },
            {
              heading: '5. Cancellation',
              paragraphs: [
                'The client can cancel free of charge from their ride page until the pickup time. After that, they contact the driver directly.',
                'The driver may decline or cancel a ride if unavailable; the client is told at once.',
              ],
            },
            { heading: '6. Right of withdrawal', paragraphs: ['Under article L221-2 of the French Consumer Code, the right of withdrawal does not apply to passenger transport contracts.'] },
            {
              heading: '7. On board',
              paragraphs: ['The car is non-smoking. Children travel in a suitable seat, to be requested when booking. Clients remain responsible for their luggage and belongings; forgotten items are kept and returned on request.'],
            },
            { heading: '8. Liability and insurance', paragraphs: [`Insurance: ${v(l.insurance)}.`] },
            {
              heading: '9. Complaints and mediation',
              paragraphs: [`Complaints: ${email}.`, `If no solution is found, the client may refer the matter free of charge to the consumer mediator: ${v(l.mediator_name)}${l.mediator_url ? ` (${l.mediator_url})` : ''}.`],
            },
            { heading: '10. Personal data', paragraphs: ['See the privacy policy.'] },
            { heading: '11. Governing law', paragraphs: ['These terms are governed by French law.'] },
          ],
        };
  }

  // privacy
  return fr
    ? {
        title: 'Politique de confidentialité',
        sections: [
          { heading: 'Responsable du traitement', paragraphs: [`${name}, ${v(l.address)}. Contact : ${email}.`] },
          {
            heading: 'Données traitées',
            paragraphs: [
              'Pour une course : nom, téléphone, e-mail, adresses et coordonnées de départ et d’arrivée, date et heure, nombre de passagers et de bagages, options, numéro de vol ou de train et remarques éventuelles.',
              'Pour un compte : en plus, un mot de passe (enregistré chiffré) et la langue choisie.',
              'Pour un avis : la note, le commentaire et la ville éventuelle ; le nom public n’est affiché qu’avec votre accord, sous la forme « J. Smith ».',
              'Messages : ce que le client et le chauffeur s’écrivent au sujet d’une course, avec la date et l’heure. Ils sont conservés avec la course et ne servent qu’à l’organiser.',
              'Notifications du navigateur, si vous les activez (« Me prévenir ») : l’adresse d’abonnement fournie par votre navigateur et ses clés de chiffrement, enregistrées avec la course.',
            ],
          },
          {
            heading: 'Pourquoi et sur quelle base',
            paragraphs: [
              'Organiser et réaliser la course, vous contacter à son sujet (e-mail, SMS, WhatsApp, messages sur la page de la course) : exécution du contrat.',
              'Vous envoyer des notifications dans le navigateur : votre consentement, que vous retirez avec « Ne plus me prévenir ».',
              'Conserver les courses effectuées pour la comptabilité : obligation légale.',
              'Publier votre avis, mémoriser vos coordonnées sur votre appareil : votre consentement, que vous pouvez retirer à tout moment.',
              'Limiter les abus (nombre de demandes) et assurer la sécurité : intérêt légitime ; les adresses IP n’apparaissent que dans les journaux techniques du serveur, de taille et de durée limitées.',
            ],
          },
          {
            heading: 'Destinataires',
            paragraphs: [
              `Le chauffeur et ${name} uniquement. Prestataires techniques : l’hébergeur (${v(l.host_name)}) et le service d’envoi des e-mails.`,
              'Les recherches d’adresses sont envoyées à Photon (komoot) et l’affichage de la carte à OpenFreeMap, directement depuis votre navigateur ; le calcul d’itinéraire (OSRM) ne reçoit que des coordonnées, sans votre identité.',
              'Les notifications du navigateur passent par le service de notification de l’éditeur de votre navigateur (Google, Mozilla, Apple ou Microsoft) ; leur contenu est chiffré de bout en bout.',
              'Aucune donnée n’est vendue ni utilisée pour de la publicité.',
            ],
          },
          {
            heading: 'Durées de conservation',
            paragraphs: [
              'Courses effectuées : 10 ans (comptabilité) ; les adresses exactes sont réduites à la ville après 3 ans.',
              'Demandes refusées, expirées ou annulées : supprimées après 12 mois.',
              'Clients sans course effectuée ni activité : supprimés après 24 mois.',
              'Historique des e-mails et SMS envoyés : 90 jours. Position du chauffeur : seule la dernière est gardée, et montrée au client uniquement autour de l’heure de sa course.',
              'Messages entre le client et le chauffeur : gardés avec la course et supprimés selon les mêmes règles que ses données.',
              'Abonnement aux notifications du navigateur : gardé avec la course et supprimé avec elle ; vous pouvez le désactiver à tout moment avec « Ne plus me prévenir » ou dans les réglages du navigateur.',
              'Compte et avis : jusqu’à leur suppression, à votre demande ou depuis l’application.',
            ],
          },
          {
            heading: 'Sur votre appareil',
            paragraphs: [
              'Pas de cookies publicitaires ni de mesure d’audience. Votre appareil garde la langue choisie, votre connexion si vous avez un compte, les liens de vos courses et, seulement si vous cochez « Se souvenir de moi », vos coordonnées et derniers lieux. « Oublier mes données sur cet appareil » efface tout.',
            ],
          },
          {
            heading: 'Vos droits',
            paragraphs: [
              `Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou la portabilité de vos données, et vous opposer à leur traitement, en écrivant à ${email}. Vous pouvez aussi adresser une réclamation à la CNIL (www.cnil.fr).`,
            ],
          },
        ],
      }
    : {
        title: 'Privacy policy',
        sections: [
          { heading: 'Data controller', paragraphs: [`${name}, ${v(l.address)}. Contact: ${email}.`] },
          {
            heading: 'Data we process',
            paragraphs: [
              'For a ride: name, phone, email, pickup and drop-off addresses and coordinates, date and time, passengers and luggage, options, flight or train number and any notes.',
              'For an account: also a password (stored hashed) and your language.',
              'For a review: the rating, comment and optional city; your public name is shown only with your consent, as “J. Smith”.',
              'Messages: what the client and the driver write to each other about a ride, with the date and time. They are kept with the ride and only used to organise it.',
              'Browser notifications, if you turn them on (“Notify me”): the subscription address given by your browser and its encryption keys, stored with the ride.',
            ],
          },
          {
            heading: 'Why, and on what basis',
            paragraphs: [
              'To organise and carry out the ride and contact you about it (email, SMS, WhatsApp, messages on the ride page): performance of the contract.',
              'To send you browser notifications: your consent, which you withdraw with “Turn off”.',
              'To keep completed rides for accounting: legal obligation.',
              'To publish your review and remember your details on your device: your consent, which you can withdraw at any time.',
              'To limit abuse (number of requests) and keep the service secure: legitimate interest; IP addresses only appear in the server’s technical logs, which are limited in size and time.',
            ],
          },
          {
            heading: 'Who receives it',
            paragraphs: [
              `Only the driver and ${name}. Technical providers: the host (${v(l.host_name)}) and the email sending service.`,
              'Address searches go to Photon (komoot) and the map to OpenFreeMap, directly from your browser; the route service (OSRM) only receives coordinates, without your identity.',
              'Browser notifications go through the push service of your browser’s maker (Google, Mozilla, Apple or Microsoft); their content is end-to-end encrypted.',
              'No data is sold or used for advertising.',
            ],
          },
          {
            heading: 'How long we keep it',
            paragraphs: [
              'Completed rides: 10 years (accounting); exact addresses are reduced to the city after 3 years.',
              'Declined, expired or cancelled requests: deleted after 12 months.',
              'Clients with no completed ride and no activity: deleted after 24 months.',
              'Log of emails and SMS sent: 90 days. Driver position: only the latest is kept, shown to a client only around their ride time.',
              'Messages between client and driver: kept with the ride and deleted under the same rules as its data.',
              'Browser notification subscription: kept with the ride and deleted with it; you can turn it off at any time with “Turn off” or in your browser settings.',
              'Account and reviews: until you delete them, or ask us to.',
            ],
          },
          {
            heading: 'On your device',
            paragraphs: [
              'No advertising cookies and no audience measurement. Your device keeps your language, your sign-in if you have an account, your ride links and, only if you tick “Remember me”, your details and last places. “Forget my details on this device” erases it all.',
            ],
          },
          {
            heading: 'Your rights',
            paragraphs: [
              `You can ask for access, correction, erasure, restriction or portability of your data, and object to its processing, by writing to ${email}. You can also complain to the French data protection authority, the CNIL (www.cnil.fr).`,
            ],
          },
        ],
      };
}
