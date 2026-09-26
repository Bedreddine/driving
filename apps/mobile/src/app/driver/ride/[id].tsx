import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RideDetail } from '@/components/RideDetail';
import { Loading, Muted, Screen } from '@/components/ui';
import { getRide, subscribeRides, type Ride } from '@/lib/api';
import { useLicence } from '@/lib/useLicence';

export default function DriverRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const licence = useLicence();

  const load = useCallback(() => void getRide(id).then(setRide), [id]);
  useEffect(load, [load]);
  useEffect(() => subscribeRides(load), [load]);

  return (
    <Screen>
      {ride === undefined ? <Loading /> : null}
      {ride === null ? <Muted>404</Muted> : null}
      {ride ? <RideDetail ride={ride} as="driver" licence={licence} onChanged={load} /> : null}
    </Screen>
  );
}
