// The phone's (or browser's) position, only after the person asks for it.
import * as Location from 'expo-location';
import type { LngLat } from './mapStyle';

/** One position now; null when refused or unavailable. */
export async function currentPosition(): Promise<LngLat | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return [p.coords.longitude, p.coords.latitude];
  } catch {
    return null;
  }
}

export type LivePosition = { lngLat: LngLat; heading: number | null; speed: number | null; accuracy: number | null };

/** Follows the position while the screen is open. Returns a function that stops it. */
export async function followPosition(onChange: (p: LivePosition) => void, everyMs = 5000): Promise<(() => void) | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: everyMs, distanceInterval: 10 },
      (p) =>
        onChange({
          lngLat: [p.coords.longitude, p.coords.latitude],
          heading: p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : null,
          speed: p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : null,
          accuracy: p.coords.accuracy ?? null,
        }),
    );
    return () => sub.remove();
  } catch {
    return null;
  }
}
