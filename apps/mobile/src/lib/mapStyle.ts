// The free OpenFreeMap vector style, recoloured for "Nuit Blanche" (DESIGN.md › map-* tokens).
// Same style object on the website (maplibre-gl) and on phones (MapLibre React Native).

export type LngLat = [number, number];

type Layer = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
type Style = { layers: Layer[]; [k: string]: unknown };

export const mapColors = {
  land: '#121417',
  water: '#1B2430',
  park: '#14181A',
  building: '#1A1D22',
  road: '#23272D',
  major: '#343841',
  rail: '#202328',
  label: '#77736B',
  halo: '#0D0F12',
  route: '#E9A23B',
};

const STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/dark';

const hide = (l: Layer) => ({ ...l, layout: { ...l.layout, visibility: 'none' } });
const paint = (l: Layer, p: Record<string, unknown>) => {
  // Textures (wood, grass…) need sprite images and would show through the night colours.
  const { 'fill-pattern': _pattern, ...rest } = l.paint ?? {};
  return { ...l, paint: { ...rest, ...p } };
};

/** Recolours every layer by its kind; hides points of interest, shields and borders so the route stands out. */
export function nightStyle(style: Style): Style {
  const c = mapColors;
  const layers = style.layers.map((l): Layer => {
    const id = l.id;
    switch (l.type) {
      case 'background':
        return paint(l, { 'background-color': c.land });
      case 'fill':
        if (/water/.test(id)) return paint(l, { 'fill-color': c.water });
        if (/park|wood|grass|landcover|landuse|cemetery|pitch/.test(id)) return paint(l, { 'fill-color': c.park });
        if (/building/.test(id)) return paint(l, { 'fill-color': c.building });
        return paint(l, { 'fill-color': c.land });
      case 'fill-extrusion':
        return paint(l, { 'fill-extrusion-color': c.building, 'fill-extrusion-opacity': 0.85 });
      case 'line':
        if (/water|river|stream|canal/.test(id)) return paint(l, { 'line-color': c.water });
        if (/rail|transit/.test(id)) return paint(l, { 'line-color': c.rail });
        if (/boundary|admin|aeroway/.test(id)) return hide(l);
        if (/motorway|trunk|primary/.test(id)) return paint(l, { 'line-color': c.major });
        return paint(l, { 'line-color': c.road });
      case 'symbol':
        if (/poi|housenumber|aeroway|transit|airport|shield|oneway|mountain/.test(id)) return hide(l);
        return paint(l, { 'text-color': c.label, 'text-halo-color': c.halo });
      default:
        return l;
    }
  });
  return { ...style, layers };
}

let cached: Promise<Style> | null = null;

/** Downloads the base style once per app run and recolours it. */
export function loadNightStyle(): Promise<Style> {
  cached ??= fetch(STYLE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`map style ${r.status}`);
      return r.json() as Promise<Style>;
    })
    .then(nightStyle)
    .catch((e) => {
      cached = null; // try again next time
      throw e;
    });
  return cached;
}

/** Straight-line distance in km, for suggestions before the real route is known. */
export function distanceKm(a: LngLat, b: LngLat) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/** "48.8681° N · 2.3290° E" */
export function formatCoords([lng, lat]: LngLat) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
}

/** Bounds [west, south, east, north] around a set of points. */
export function boundsOf(points: LngLat[]): [number, number, number, number] {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
