// Ideas the driver can add to « À bord » in one tap, in both languages (then edit freely).
import type { Amenity } from './publicApi';

const a = (label_fr: string, label_en: string, detail_fr: string | null = null, detail_en: string | null = null): Amenity => ({
  label_fr,
  label_en,
  detail_fr,
  detail_en,
});

export const AMENITY_IDEAS: Amenity[] = [
  a('Eau plate', 'Still water', 'fraîche, offerte', 'chilled, included'),
  a('Eau gazeuse', 'Sparkling water', 'offerte', 'included'),
  a('Softs', 'Soft drinks', 'sur demande', 'on request'),
  a('Douceurs', 'Sweets', 'chocolats', 'chocolates'),
  a('Non-fumeur', 'Non-smoking', 'toujours', 'always'),
  a('Chargeurs', 'Chargers', 'USB-C · Lightning', 'USB-C · Lightning'),
  a('Wi-Fi', 'Wi-Fi', 'offert', 'free'),
  a('Siège enfant', 'Child seat', 'sur demande', 'on request'),
  a('Journaux', 'Newspapers', 'du jour', 'today’s'),
  a('Parapluie', 'Umbrella', 'à disposition', 'available'),
];
