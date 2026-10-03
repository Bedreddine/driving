import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './mapControls.css';
import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from '@/lib/motion';
import { boundsOf, loadNightStyle, mapColors, type LngLat } from '@/lib/mapStyle';
import { night } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { MapBoundary } from './MapBoundary';
import { CenterPin, framePoints, fullPadding, PARIS, useRouteProgress, type MapSceneProps } from './shared';

const line = (coords: LngLat[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } });

function dot(size: number, background: string, border: string, borderWidth = 3) {
  const e = document.createElement('div');
  Object.assign(e.style, {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%', borderStyle: 'solid', borderWidth: `${borderWidth}px`,
    boxSizing: 'border-box', background, borderColor: border,
  });
  return e;
}
const pinElement = (kind: 'pickup' | 'dropoff', draggable: boolean) => {
  const e = dot(draggable ? 22 : 18, kind === 'pickup' ? night.primary : night.text, kind === 'pickup' ? night.paper : night.primary);
  if (draggable) e.style.cursor = 'grab';
  return e;
};
function candidateElement(n: number) {
  const e = dot(24, night.paper, night.primary, 2);
  Object.assign(e.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', color: night.primary, font: "700 11px 'Manrope_700Bold', sans-serif", cursor: 'pointer' });
  e.textContent = String(n);
  return e;
}
function carElement() {
  const e = dot(30, night.paper, night.primary, 2);
  Object.assign(e.style, { display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const arrow = document.createElement('div');
  Object.assign(arrow.style, { width: '0', height: '0', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `13px solid ${night.primary}` });
  e.appendChild(arrow);
  return e;
}

/** Website version: maplibre-gl with the recoloured OpenFreeMap style. */
export function MapScene(props: MapSceneProps) {
  const { t } = useAuth();
  return (
    <MapBoundary style={props.style} label={t('mapUnavailable')}>
      <MapView {...props} />
    </MapBoundary>
  );
}

function MapView(props: MapSceneProps) {
  const { pickup, dropoff, route, mode, focus, padding, candidates, car, you, style } = props;
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker | undefined>>({});
  const candidateMarkers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const reduced = useReducedMotion();
  const drawn = useRouteProgress(route);
  // Latest callbacks, without re-binding map events on every render.
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    let alive = true;
    void loadNightStyle()
      .then((styleJson) => {
        if (!alive || !box.current) return;
        const m = new maplibregl.Map({
          container: box.current,
          style: styleJson as maplibregl.StyleSpecification,
          center: focus ?? PARIS,
          zoom: 14.2,
          pitch: 55,
          bearing: -20,
          attributionControl: { compact: true },
        });
        m.on('load', () => {
          m.addSource('route', { type: 'geojson', data: line([]) });
          m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': mapColors.route, 'line-width': 4 } });
          setReady(true);
        });
        m.on('click', (e) => handlers.current.onPress?.([e.lngLat.lng, e.lngLat.lat]));
        m.on('moveend', () => {
          if (handlers.current.mode !== 'pick') return;
          const c = m.getCenter();
          handlers.current.onCenterChange?.([c.lng, c.lat]);
        });
        map.current = m;
      })
      .catch(() => undefined); // no map (offline): the page still works on the sheet alone
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; later changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The route line follows the drawing progress.
  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData(line(drawn));
  }, [drawn, ready]);

  // One marker per key: created once, then moved; removed when its point goes away.
  const place = (key: string, at: LngLat | null | undefined, make: () => maplibregl.Marker) => {
    const m = map.current;
    if (!m) return;
    const current = markers.current[key];
    if (!at) {
      current?.remove();
      markers.current[key] = undefined;
    } else if (current) current.setLngLat(at);
    else markers.current[key] = make().setLngLat(at).addTo(m);
  };

  // Pickup and drop-off pins, draggable when the page lets the client fine-tune them.
  const pickupDraggable = !!props.onPickupMove;
  const dropoffDraggable = !!props.onDropoffMove;
  useEffect(() => {
    if (!ready) return;
    for (const kind of ['pickup', 'dropoff'] as const) {
      const at = mode === 'pick' ? null : kind === 'pickup' ? pickup : dropoff;
      const draggable = kind === 'pickup' ? pickupDraggable : dropoffDraggable;
      const key = `${kind}-${draggable}`;
      place(`${kind}-${!draggable}`, null, () => new maplibregl.Marker()); // the other variant, if any
      place(key, at, () => {
        const mk = new maplibregl.Marker({ element: pinElement(kind, draggable), draggable });
        mk.on('dragend', () => {
          const p = mk.getLngLat();
          const h = handlers.current;
          (kind === 'pickup' ? h.onPickupMove : h.onDropoffMove)?.([p.lng, p.lat]);
        });
        return mk;
      });
    }
  }, [pickup, dropoff, mode, ready, pickupDraggable, dropoffDraggable]);

  // The driver's car and the client's own position.
  useEffect(() => {
    if (!ready) return;
    place('car', car?.lngLat, () => new maplibregl.Marker({ element: carElement(), rotationAlignment: 'map', pitchAlignment: 'viewport' }));
    markers.current.car?.setRotation(car?.heading ?? 0);
    place('you', you, () => new maplibregl.Marker({ element: dot(14, night.text, night.paper) }));
  }, [car, you, ready]);

  // Search results as numbered pins.
  const candidateKey = JSON.stringify(candidates?.map((c) => c.lngLat) ?? []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    candidateMarkers.current.forEach((mk) => mk.remove());
    candidateMarkers.current = (candidates ?? []).map((c, i) => {
      const el = candidateElement(i + 1);
      el.title = c.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.current.onCandidatePress?.(i);
      });
      return new maplibregl.Marker({ element: el }).setLngLat(c.lngLat).addTo(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey, ready]);

  // Camera.
  const pad = JSON.stringify(fullPadding(padding));
  const pts = framePoints(props);
  const target = JSON.stringify([mode, focus, pickup, dropoff, route?.length, candidateKey, !!car]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const p = JSON.parse(pad);
    if (mode === 'orbit') {
      m.easeTo({ center: focus ?? PARIS, zoom: 14.2, pitch: 55, padding: p, duration: reduced ? 0 : 1200 });
      if (reduced) return;
      let frame = 0;
      const spin = () => {
        m.setBearing(m.getBearing() + 0.04);
        frame = requestAnimationFrame(spin);
      };
      const start = setTimeout(() => (frame = requestAnimationFrame(spin)), 1200);
      return () => {
        clearTimeout(start);
        cancelAnimationFrame(frame);
      };
    }
    if (mode === 'pick') {
      m.easeTo({ center: focus ?? m.getCenter(), zoom: 16.5, pitch: 0, bearing: 0, padding: p, duration: reduced ? 0 : 1000 });
      return;
    }
    if (pts.length === 1) m.easeTo({ center: pts[0], zoom: 14.5, pitch: 40, bearing: 0, padding: p, duration: reduced ? 0 : 1000 });
    else if (pts.length > 1) {
      // maplibre adds the padding kept from the last camera move to this one: pass only what is missing.
      const kept = m.getPadding();
      const extra = {
        top: Math.max(0, p.top - (kept.top ?? 0)),
        bottom: Math.max(0, p.bottom - (kept.bottom ?? 0)),
        left: Math.max(0, p.left - (kept.left ?? 0)),
        right: Math.max(0, p.right - (kept.right ?? 0)),
      };
      m.fitBounds(boundsOf(pts), { padding: extra, pitch: 40, bearing: 0, duration: reduced ? 0 : 1200, maxZoom: 15.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pad, ready, reduced]);

  return (
    <View style={[{ backgroundColor: mapColors.land, overflow: 'hidden' }, style]}>
      {createElement('div', { ref: box, style: { position: 'absolute', inset: 0 } })}
      {mode === 'pick' ? <CenterPin /> : null}
    </View>
  );
}
