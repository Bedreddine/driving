import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { RideCard } from '@/components/RideCard';
import { Button, ErrorText, Label, Loading, Muted, Row, Screen } from '@/components/ui';
import { requestConflicts, type Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayKey, formatDay } from '@/lib/format';
import { useRides } from '@/lib/useRides';

export default function DriverHome() {
  const { t, err, lang, roles, signOut } = useAuth();
  const router = useRouter();
  // Everything from 12 hours ago, so rides still to close stay visible.
  const [since] = useState(() => new Date(Date.now() - 12 * 3600_000).toISOString());
  const { rides, error } = useRides({ from: since, statuses: ['requested', 'price_proposed', 'accepted'] });
  const [conflicts, setConflicts] = useState<Record<string, string>>({});

  const loadConflicts = useCallback(() => void requestConflicts().then(setConflicts), []);
  useEffect(loadConflicts, [loadConflicts, rides]);

  const open = (r: Ride) => router.push({ pathname: '/driver/ride/[id]', params: { id: r.id } });
  const requests = (rides ?? []).filter((r) => r.status === 'requested' || r.status === 'price_proposed');
  const accepted = (rides ?? []).filter((r) => r.status === 'accepted');

  // Group confirmed rides by day (Paris time).
  const days = new Map<string, Ride[]>();
  for (const r of accepted) {
    const k = dayKey(r.pickup_at);
    days.set(k, [...(days.get(k) ?? []), r]);
  }
  const todayKey = dayKey(new Date().toISOString());

  return (
    <Screen>
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button title={`+ ${t('quickAdd')}`} onPress={() => router.push('/driver/quick-add')} style={{ flex: 1 }} />
        <Button kind="secondary" title={t('timeOff')} onPress={() => router.push('/driver/time-off')} />
        {Platform.OS === 'web' && roles.includes('admin') ? (
          <Button kind="secondary" title={t('backOffice')} onPress={() => router.push('/admin')} />
        ) : null}
      </Row>
      <ErrorText>{error ? err(error) : null}</ErrorText>
      {rides === null ? <Loading /> : null}

      <Label>
        {t('requests')} ({requests.length})
      </Label>
      {rides && requests.length === 0 ? <Muted>{t('noRequests')}</Muted> : null}
      {requests.map((r) => (
        <RideCard key={r.id} ride={r} showCustomer conflict={!!conflicts[r.id]} onPress={() => open(r)} />
      ))}

      {[...days.entries()].map(([k, list]) => (
        <RideDay key={k} title={k === todayKey ? t('today') : formatDay(list[0].pickup_at, lang)}>
          {list.map((r) => (
            <RideCard key={r.id} ride={r} showCustomer onPress={() => open(r)} />
          ))}
        </RideDay>
      ))}
      {rides && accepted.length === 0 ? <Muted>{t('noRides')}</Muted> : null}

      <Button kind="secondary" title={t('signOut')} onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
    </Screen>
  );
}

function RideDay({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Label>{title}</Label>
      {children}
    </>
  );
}
