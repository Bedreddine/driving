// What both map versions share: props, route drawing timing, pins and the centre pin.
import { useEffect, useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/lib/motion';
import type { LngLat } from '@/lib/mapStyle';
import { fonts, night } from '@/lib/theme';

export type MapPadding = { top: number; right: number; bottom: number; left: number };

export type MapSceneProps = {
  pickup?: LngLat | null;
  dropoff?: LngLat | null;
  /** The driving route, drawn in amber from start to end when it changes. */
  route?: LngLat[] | null;
  /**
   * orbit: the city turns slowly (landing).
   * trip: the camera frames pickup, drop-off and route.
   * pick: the map moves freely under a centre pin; `onCenterChange` reports where it stops.
   */
  mode: 'orbit' | 'trip' | 'pick';
  /** Where to look in "orbit" and "pick" modes. */
  focus?: LngLat;
  /** Room taken by sheets over the map, so the trip stays visible. */
  padding?: Partial<MapPadding>;
  onPress?: (lngLat: LngLat) => void;
  onCenterChange?: (lngLat: LngLat) => void;
  /** Given: the pin can be dragged to the exact door; called where it is dropped. */
  onPickupMove?: (lngLat: LngLat) => void;
  onDropoffMove?: (lngLat: LngLat) => void;
  /** Search results shown as numbered pins (the camera frames them). */
  candidates?: { lngLat: LngLat; label: string }[] | null;
  onCandidatePress?: (index: number) => void;
  /** The driver's car, live, with its heading in degrees. */
  car?: { lngLat: LngLat; heading?: number | null } | null;
  /** Where the client is (their phone's position). */
  you?: LngLat | null;
  style?: StyleProp<ViewStyle>;
};

/** What the camera should frame in "trip" mode: candidates while searching, otherwise the trip and the car. */
export function framePoints({ candidates, route, pickup, dropoff, car }: MapSceneProps): LngLat[] {
  if (candidates && candidates.length > 0) return candidates.map((c) => c.lngLat);
  return [...(route ?? []), ...(pickup ? [pickup] : []), ...(dropoff ? [dropoff] : []), ...(car ? [car.lngLat] : [])];
}

export const PARIS: LngLat = [2.3212, 48.8656];
export const fullPadding = (p?: Partial<MapPadding>): MapPadding => ({ top: 60, right: 40, bottom: 60, left: 40, ...p });

/** The route as it is being drawn: grows from the first to the last point in 1.1 s (all at once with reduce motion). */
export function useRouteProgress(route: LngLat[] | null | undefined): LngLat[] {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState<{ of: LngLat[] | null; count: number }>({ of: null, count: 0 });
  useEffect(() => {
    if (!route || route.length < 2 || reduced) return;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 1100);
      const eased = 1 - Math.pow(1 - p, 3);
      setProgress({ of: route, count: Math.max(2, Math.ceil(route.length * eased)) });
      if (p >= 1) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [route, reduced]);
  if (!route || route.length < 2) return [];
  if (reduced) return route;
  return progress.of === route ? route.slice(0, progress.count) : [];
}

/** Pickup: amber dot with an asphalt ring. Drop-off: ivory dot with an amber ring. */
export function Pin({ kind }: { kind: 'pickup' | 'dropoff' }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 3,
        backgroundColor: kind === 'pickup' ? night.primary : night.text,
        borderColor: kind === 'pickup' ? night.paper : night.primary,
      }}
    />
  );
}

/** Fixed pin in the middle of the map while the client moves the map under it. */
export function CenterPin() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -11, marginTop: -30, alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: night.paper, backgroundColor: night.primary }} />
      <View style={{ width: 2, height: 10, backgroundColor: night.primary }} />
    </View>
  );
}

/** The driver's car: an amber arrow pointing where it drives. */
export function CarMarker({ heading }: { heading?: number | null }) {
  return (
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: night.paper, borderWidth: 2, borderColor: night.primary, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderBottomWidth: 13,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: night.primary,
          transform: [{ rotate: `${heading ?? 0}deg` }],
        }}
      />
    </View>
  );
}

/** A numbered search result on the map. */
export function CandidateMarker({ n }: { n: number }) {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: night.paper, borderWidth: 2, borderColor: night.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: night.primary, fontSize: 11, fontFamily: fonts.bold }}>{n}</Text>
    </View>
  );
}

/** The client's own position. */
export function YouDot() {
  return <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: night.text, borderWidth: 3, borderColor: night.paper }} />;
}
