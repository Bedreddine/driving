import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { RideDetail } from '@/components/RideDetail';
import { Button, Loading, Muted } from '@/components/ui';
import { getRide, subscribeRides, type Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLicence } from '@/lib/useLicence';

/** A ride opened from the back office: same actions as the driver screen, inside the back-office menu. */
export default function AdminRide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, err } = useAuth();
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null | undefined>(undefined);
  const licence = useLicence();

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
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, maxWidth: 720 }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Button kind="secondary" title={`← ${t('rides')}`} onPress={() => router.navigate('/admin')} />
      </View>
      {ride === undefined ? <Loading /> : null}
      {ride === null ? <Muted>{err('NOT_FOUND')}</Muted> : null}
      {ride ? <RideDetail ride={ride} as="driver" licence={licence} onChanged={load} /> : null}
    </ScrollView>
  );
}
