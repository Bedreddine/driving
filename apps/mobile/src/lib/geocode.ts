// Address search with Photon (open source, OpenStreetMap data). No API key needed.
import type { Place } from './api';

const baseUrl = (process.env.EXPO_PUBLIC_GEOCODER_URL ?? 'https://photon.komoot.io').replace(/\/$/, '');
const biasLat = Number(process.env.EXPO_PUBLIC_MAP_BIAS_LAT ?? 48.8566);
const biasLng = Number(process.env.EXPO_PUBLIC_MAP_BIAS_LNG ?? 2.3522);

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    country?: string;
  };
};

export function labelFor(p: PhotonFeature['properties']): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const main = p.name && p.name !== p.street ? p.name : street;
  const parts = [main, main === street ? undefined : street, [p.postcode, p.city].filter(Boolean).join(' ')];
  return parts.filter((x) => x && x.trim()).join(', ');
}

export async function searchAddress(query: string, lang: 'fr' | 'en', signal?: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  const url =
    `${baseUrl}/api/?q=${encodeURIComponent(query.trim())}&limit=6&lang=${lang === 'en' ? 'en' : 'fr'}` +
    `&lat=${biasLat}&lon=${biasLng}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? []).map((f) => ({
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    address: labelFor(f.properties) || `${f.geometry.coordinates[1].toFixed(5)}, ${f.geometry.coordinates[0].toFixed(5)}`,
  }));
}

/** The address of a point on the map (a pin dropped by hand). Falls back to the coordinates. */
export async function reverseGeocode(lng: number, lat: number, lang: 'fr' | 'en', signal?: AbortSignal): Promise<Place> {
  const fallback = { lng, lat, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
  try {
    const res = await fetch(`${baseUrl}/reverse?lon=${lng}&lat=${lat}&lang=${lang === 'en' ? 'en' : 'fr'}`, { signal });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const f = body.features?.[0];
    return f ? { lng, lat, address: labelFor(f.properties) || fallback.address } : fallback;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return fallback;
  }
}
