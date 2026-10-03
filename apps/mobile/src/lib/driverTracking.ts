// Phones: the driver's position keeps going to the server with the screen locked or another app open
// (Android shows a notification while it runs). It stops by itself after a few hours.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './http';
import { authStorage } from './storage';

const TASK = 'taxi.driver-location';
const UNTIL = 'taxi.liveUntil';
const MAX_MS = 4 * 60 * 60 * 1000;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  if (Date.now() > Number(authStorage?.getItem(UNTIL) ?? 0)) {
    await stopTracking();
    return;
  }
  const p = data.locations[data.locations.length - 1].coords;
  try {
    await api.post('/api/driver/location', {
      lat: p.latitude,
      lng: p.longitude,
      heading: p.heading != null && p.heading >= 0 ? p.heading : null,
      speed: p.speed != null && p.speed >= 0 ? p.speed : null,
      accuracy: p.accuracy ?? null,
    });
  } catch {
    // no network for a moment: the next position will go through
  }
});

export const backgroundSupported = true;

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TASK);
  } catch {
    return false;
  }
}

/** 'background' when it runs with the screen off, 'denied' without location access at all. */
export async function startTracking(notice: { title: string; body: string }): Promise<'background' | 'foreground-only' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  if (bg?.status !== 'granted') return 'foreground-only';
  authStorage?.setItem(UNTIL, String(Date.now() + MAX_MS));
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: notice.title, notificationBody: notice.body, notificationColor: '#E9A23B' },
  });
  return 'background';
}

export async function stopTracking() {
  authStorage?.removeItem(UNTIL);
  if (await isTracking()) await Location.stopLocationUpdatesAsync(TASK).catch(() => undefined);
}
