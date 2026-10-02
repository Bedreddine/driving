import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RideDetail } from '@/components/RideDetail';
import { Loading, Muted, Notice, Screen } from '@/components/ui';
import { getRide, subscribeRides, type Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function CustomerRide() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { t, err } = useAuth();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);

  const load = useCallback(
    () =>
      void getRide(id)
        .then(setRide)
        .catch(() => setRide(null)),
    [id],
  );
  useEffect(load, [load]);
  useEffect(() => subscribeRides(load), [load]);

  return (
    <Screen>
      {sent === '1' && ride?.status === 'requested' ? <Notice tone="success">{t('requestSent')}</Notice> : null}
      {ride === undefined ? <Loading /> : null}
      {ride === null ? <Muted>{err('NOT_FOUND')}</Muted> : null}
      {ride ? <RideDetail ride={ride} as="customer" onChanged={load} /> : null}
    </Screen>
  );
}
