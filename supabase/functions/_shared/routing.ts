// Road distance and duration from OSRM (open source, OpenStreetMap data).
// The public demo server is fine for testing; set OSRM_URL to your own instance in production.

export type Point = { lat: number; lng: number };
export type Route = { distance_m: number; duration_s: number; estimated: boolean };

export const DEFAULT_OSRM_URL = "https://router.project-osrm.org";

const R = 6371000;
export function straightLineMeters(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Used when the routing server is down: straight line at 30 km/h plus 15 minutes.
export function fallbackRoute(a: Point, b: Point): Route {
  const meters = straightLineMeters(a, b);
  return {
    distance_m: Math.round(meters * 1.3),
    duration_s: Math.round(meters / (30000 / 3600) + 15 * 60),
    estimated: true,
  };
}

export async function route(
  a: Point,
  b: Point,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Route> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_OSRM_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${baseUrl}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res.ok) return fallbackRoute(a, b);
    const body = await res.json();
    const r = body?.routes?.[0];
    if (body?.code !== "Ok" || typeof r?.distance !== "number" || typeof r?.duration !== "number") {
      return fallbackRoute(a, b);
    }
    return { distance_m: Math.round(r.distance), duration_s: Math.round(r.duration), estimated: false };
  } catch {
    return fallbackRoute(a, b);
  } finally {
    clearTimeout(timer);
  }
}
