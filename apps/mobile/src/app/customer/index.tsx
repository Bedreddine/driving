import { useRouter } from 'expo-router';
import { RideCard } from '@/components/RideCard';
import { Button, ErrorText, Label, Loading, Muted, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/useNow';
import { useRides } from '@/lib/useRides';

export default function CustomerHome() {
  const { t, err } = useAuth();
  const router = useRouter();
  const { rides, error } = useRides();

  const now = useNow();
  const open = ['requested', 'price_proposed', 'accepted'];
  const upcoming = (rides ?? []).filter((r) => open.includes(r.status) && new Date(r.pickup_at).getTime() > now - 3 * 3600_000);
  const past = (rides ?? []).filter((r) => !upcoming.includes(r)).reverse();

  return (
    <Screen>
      <Row style={{ gap: 8 }}>
        <Button title={`+ ${t('bookRide')}`} onPress={() => router.push('/customer/book')} style={{ flex: 1 }} />
        <Button kind="secondary" title={t('account')} onPress={() => router.push('/customer/account')} />
      </Row>
      <ErrorText>{error ? err(error) : null}</ErrorText>
      {rides === null ? <Loading /> : null}

      <Label>{t('upcoming')}</Label>
      {rides && upcoming.length === 0 ? <Muted>{t('noRides')}</Muted> : null}
      {upcoming.map((r) => (
        <RideCard key={r.id} ride={r} onPress={() => router.push({ pathname: '/customer/ride/[id]', params: { id: r.id } })} />
      ))}

      {past.length > 0 ? <Label>{t('past')}</Label> : null}
      {past.map((r) => (
        <RideCard key={r.id} ride={r} onPress={() => router.push({ pathname: '/customer/ride/[id]', params: { id: r.id } })} />
      ))}
    </Screen>
  );
}
