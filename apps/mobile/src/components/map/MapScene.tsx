import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from '@/lib/motion';
import { boundsOf, loadNightStyle, mapColors } from '@/lib/mapStyle';
import { useAuth } from '@/lib/auth';
import { MapBoundary } from './MapBoundary';
import { CandidateMarker, CarMarker, CenterPin, framePoints, fullPadding, PARIS, Pin, useRouteProgress, YouDot, type MapSceneProps } from './shared';

type StyleJson = Awaited<ReturnType<typeof loadNightStyle>>;

/** Phone version: MapLibre React Native (needs a development build, not Expo Go). */
export function MapScene(props: MapSceneProps) {
  const { t } = useAuth();
  return (
    <MapBoundary style={props.style} label={t('mapUnavailable')}>
      <MapView {...props} />
    </MapBoundary>
  );
}

function MapView(props: MapSceneProps) {
  const { pickup, dropoff, route, mode, focus, padding, onPress, onCenterChange, onPickupMove, onDropoffMove, candidates, onCandidatePress, car, you, style } = props;
  const [styleJson, setStyleJson] = useState<StyleJson | null>(null);
  const camera = useRef<CameraRef>(null);
  const reduced = useReducedMotion();
  const drawn = useRouteProgress(route);

  useEffect(() => {
    let alive = true;
    void loadNightStyle()
      .then((s) => alive && setStyleJson(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const pad = JSON.stringify(fullPadding(padding));
  const pts = framePoints(props);
  const candidateKey = JSON.stringify(candidates?.map((c) => c.lngLat) ?? []);
  const target = JSON.stringify([mode, focus, pickup, dropoff, route?.length, candidateKey, !!car]);
  useEffect(() => {
    const cam = camera.current;
    if (!styleJson || !cam) return;
    const p = JSON.parse(pad);
    if (mode === 'orbit') {
      let bearing = -20;
      cam.easeTo({ center: focus ?? PARIS, zoom: 14.2, pitch: 55, bearing, padding: p, duration: reduced ? 0 : 1200 });
      if (reduced) return;
      // The city turns slowly: one linear step every 4 s.
      const id = setInterval(() => {
        bearing += 10;
        cam.easeTo({ center: focus ?? PARIS, bearing, duration: 4000, easing: 'linear' });
      }, 4000);
      return () => clearInterval(id);
    }
    if (mode === 'pick') {
      cam.easeTo({ center: focus ?? PARIS, zoom: 16.5, pitch: 0, bearing: 0, padding: p, duration: reduced ? 0 : 1000 });
      return;
    }
    if (pts.length === 1) cam.easeTo({ center: pts[0], zoom: 14.5, pitch: 40, bearing: 0, padding: p, duration: reduced ? 0 : 1000 });
    else if (pts.length > 1) cam.fitBounds(boundsOf(pts), { padding: p, pitch: 40, bearing: 0, duration: reduced ? 0 : 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pad, styleJson, reduced]);

  if (!styleJson) return <View style={[{ backgroundColor: mapColors.land }, style]} />;
  return (
    <View style={[{ backgroundColor: mapColors.land, overflow: 'hidden' }, style]}>
      <Map
        style={{ flex: 1 }}
        mapStyle={styleJson as never}
        attributionPosition={{ bottom: 8, left: 8 }}
        logo={false}
        compass={false}
        onPress={(e) => onPress?.(e.nativeEvent.lngLat)}
        onRegionDidChange={(e) => mode === 'pick' && onCenterChange?.(e.nativeEvent.center)}
      >
        <Camera ref={camera} initialViewState={{ center: focus ?? PARIS, zoom: 14.2, pitch: 55, bearing: -20 }} />
        {/* The native map refuses a line with fewer than two points: no source at all until a route exists. */}
        {drawn.length > 1 ? (
          <GeoJSONSource id="route" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawn } }}>
            <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': mapColors.route, 'line-width': 4 }} />
          </GeoJSONSource>
        ) : null}
        {pickup && mode !== 'pick' ? (
          <ViewAnnotation
            id="pickup"
            lngLat={pickup}
            draggable={!!onPickupMove}
            onDragEnd={(e) => onPickupMove?.(e.nativeEvent.lngLat)}
          >
            <Pin kind="pickup" />
          </ViewAnnotation>
        ) : null}
        {dropoff && mode !== 'pick' ? (
          <ViewAnnotation
            id="dropoff"
            lngLat={dropoff}
            draggable={!!onDropoffMove}
            onDragEnd={(e) => onDropoffMove?.(e.nativeEvent.lngLat)}
          >
            <Pin kind="dropoff" />
          </ViewAnnotation>
        ) : null}
        {(candidates ?? []).map((c, i) => (
          <ViewAnnotation key={`c${i}`} id={`candidate-${i}`} lngLat={c.lngLat} onPress={() => onCandidatePress?.(i)}>
            <CandidateMarker n={i + 1} />
          </ViewAnnotation>
        ))}
        {car ? (
          <ViewAnnotation id="car" lngLat={car.lngLat}>
            <CarMarker heading={car.heading} />
          </ViewAnnotation>
        ) : null}
        {you ? (
          <ViewAnnotation id="you" lngLat={you}>
            <YouDot />
          </ViewAnnotation>
        ) : null}
      </Map>
      {mode === 'pick' ? <CenterPin /> : null}
    </View>
  );
}
