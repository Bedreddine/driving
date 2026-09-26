import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ridePrice, StatusBadge } from '@/components/RideCard';
import { Card, colors, ErrorText, Field, Loading, Row, Segmented, styles, Title } from '@/components/ui';
import type { Ride, RideStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { useRides } from '@/lib/useRides';

type Filter = 'upcoming' | 'requests' | 'past' | 'all';
const OPEN: RideStatus[] = ['requested', 'price_proposed', 'accepted'];

export default function AdminRides() {
  const { t, err, lang } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [search, setSearch] = useState('');
  const { rides, error } = useRides({ limit: 1000 });
  const now = useNow();

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rides ?? [])
      .filter((r) => {
        const future = new Date(r.pickup_at).getTime() >= now - 3 * 3600_000;
        if (filter === 'upcoming') return future && OPEN.includes(r.status);
        if (filter === 'requests') return r.status === 'requested' || r.status === 'price_proposed';
        if (filter === 'past') return !future || !OPEN.includes(r.status);
        return true;
      })
      .filter(
        (r) =>
          !q ||
          r.contact?.full_name.toLowerCase().includes(q) ||
          r.contact?.phone?.includes(q) ||
          r.pickup_address.toLowerCase().includes(q) ||
          r.dropoff_address.toLowerCase().includes(q),
      )
      .sort((a, b) => (filter === 'past' ? b.pickup_at.localeCompare(a.pickup_at) : a.pickup_at.localeCompare(b.pickup_at)));
  }, [rides, filter, search, now]);

  const total = shown.reduce((sum, r) => sum + (r.status === 'completed' ? Number(r.final_price ?? 0) : 0), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Title>{t('rides')}</Title>
      <Row style={{ gap: 12, flexWrap: 'wrap' }}>
        <Segmented<Filter>
          options={[
            { value: 'upcoming', label: t('upcoming') },
            { value: 'requests', label: t('requests') },
            { value: 'past', label: t('past') },
            { value: 'all', label: t('all') },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <View style={{ minWidth: 240, flex: 1 }}>
          <Field label={t('search')} value={search} onChangeText={setSearch} />
        </View>
      </Row>
      <ErrorText>{error ? err(error) : null}</ErrorText>
      {rides === null ? <Loading /> : null}
      {filter === 'past' && total > 0 ? (
        <Text style={styles.muted}>
          {t('status_completed')}: {formatPrice(total, 'EUR', lang)}
        </Text>
      ) : null}

      <Card style={{ padding: 0, gap: 0 }}>
        <Row style={[tableRow, { backgroundColor: colors.bg }]}>
          <Text style={[cell, { flex: 1.3, fontWeight: '700' }]}>{t('when')}</Text>
          <Text style={[cell, { flex: 1.2, fontWeight: '700' }]}>{t('customer')}</Text>
          <Text style={[cell, { flex: 3, fontWeight: '700' }]}>
            {t('from')} → {t('to')}
          </Text>
          <Text style={[cell, { flex: 0.8, fontWeight: '700' }]}>{t('price')}</Text>
          <Text style={[cell, { flex: 1, fontWeight: '700' }]}> </Text>
        </Row>
        {shown.map((r: Ride) => (
          <Pressable key={r.id} onPress={() => router.push({ pathname: '/driver/ride/[id]', params: { id: r.id } })}>
            {({ pressed }) => (
              <Row style={[tableRow, pressed ? { backgroundColor: colors.bg } : null]}>
                <Text style={[cell, { flex: 1.3 }]}>{formatDateTime(r.pickup_at, lang)}</Text>
                <Text style={[cell, { flex: 1.2 }]} numberOfLines={1}>
                  {r.contact?.full_name ?? '—'}
                  {r.source !== 'app' ? ` (${t(`source_${r.source}`)})` : ''}
                </Text>
                <Text style={[cell, { flex: 3 }]} numberOfLines={1}>
                  {r.pickup_address} → {r.dropoff_address}
                </Text>
                <Text style={[cell, { flex: 0.8 }]}>{formatPrice(ridePrice(r), r.currency, lang)}</Text>
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <StatusBadge status={r.status} />
                </View>
              </Row>
            )}
          </Pressable>
        ))}
        {rides && shown.length === 0 ? <Text style={[cell, { padding: 16 }]}>{t('noRides')}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const tableRow = { paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 };
const cell = { fontSize: 14, color: colors.text };
