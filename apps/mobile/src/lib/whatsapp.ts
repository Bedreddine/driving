// Ready-to-send WhatsApp messages: the driver taps once, WhatsApp opens with the text, the driver presses Send.
import type { Ride } from './api';
import { formatDateTime, formatPrice } from './format';
import type { BusinessInfo } from './publicApi';
import { siteUrl } from './publicApi';

export function rideLink(ride: Ride, business: BusinessInfo | null): string | null {
  const base = siteUrl(business);
  return base ? `${base}/b/${ride.access_token}` : null;
}

export function whatsappMessage(ride: Ride, business: BusinessInfo | null): string {
  const lang = ride.contact?.language === 'en' ? 'en' : 'fr';
  const name = ride.contact?.full_name ?? '';
  const when = formatDateTime(ride.pickup_at, lang);
  const trip = `${ride.pickup_address} → ${ride.dropoff_address}`;
  const price = formatPrice(ride.final_price ?? ride.agreed_price ?? ride.proposed_price ?? ride.estimated_price, ride.currency, lang);
  const link = rideLink(ride, business);
  const brand = business?.name ?? '';
  const follow = link ? (lang === 'en' ? `\nFollow your ride: ${link}` : `\nSuivi de votre course : ${link}`) : '';

  if (lang === 'en') {
    switch (ride.status) {
      case 'requested':
        return `Hello ${name}, I received your request for ${when} (${trip}). I will confirm shortly.${follow}\n${brand}`;
      case 'price_proposed':
        return `Hello ${name}, for your ride on ${when} (${trip}) I can offer ${price}. Please accept or refuse here:${follow}\n${brand}`;
      case 'accepted':
        return `Hello ${name}, your ride on ${when} is confirmed: ${trip}. Price: ${price}.${follow}\n${brand}`;
      case 'cancelled':
        return `Hello ${name}, your ride on ${when} (${trip}) is cancelled.\n${brand}`;
      case 'completed':
        return `Thank you ${name} for riding with us. See you soon!\n${brand}`;
      default:
        return `Hello ${name}, about your ride on ${when} (${trip}).${follow}\n${brand}`;
    }
  }
  switch (ride.status) {
    case 'requested':
      return `Bonjour ${name}, j'ai bien reçu votre demande pour le ${when} (${trip}). Je vous confirme très vite.${follow}\n${brand}`;
    case 'price_proposed':
      return `Bonjour ${name}, pour votre course du ${when} (${trip}), je vous propose ${price}. Merci d'accepter ou de refuser ici :${follow}\n${brand}`;
    case 'accepted':
      return `Bonjour ${name}, votre course du ${when} est confirmée : ${trip}. Prix : ${price}.${follow}\n${brand}`;
    case 'cancelled':
      return `Bonjour ${name}, votre course du ${when} (${trip}) est annulée.\n${brand}`;
    case 'completed':
      return `Merci ${name} pour votre confiance, à très bientôt !\n${brand}`;
    default:
      return `Bonjour ${name}, au sujet de votre course du ${when} (${trip}).${follow}\n${brand}`;
  }
}

/** wa.me link with the message filled in. */
export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
}
