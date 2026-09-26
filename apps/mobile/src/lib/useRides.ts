import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { listRides, subscribeRides, type Ride } from './api';

/** Rides visible to the signed-in user, reloaded on focus and on every live change. */
export function useRides(opts: Parameters<typeof listRides>[0] = {}) {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(opts);

  const reload = useCallback(async () => {
    try {
      setRides(await listRides(JSON.parse(key)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  useEffect(() => subscribeRides(() => void reload()), [reload]);

  return { rides, error, reload };
}
