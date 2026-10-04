import { useState } from 'react';
import { View } from 'react-native';
import type { BookingResult, Place } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatKm, formatMinutes, formatPrice } from '@/lib/format';
import { api } from '@/lib/http';
import { SUGGESTED_PLACES } from '@/lib/places';
import { priceLines } from '@/lib/priceLines';
import { AddressInput } from './AddressInput';
import { DateTimeField } from './DateTimeField';
import { MapScene } from './map/MapScene';
import { Chip, CountUp, MonoLine, PriceDetail } from './scene';
import { Button, Card, CardTitle, colors, Notice, Row, Segmented, Stepper, Toggle } from './ui';
import { radius } from '@/lib/theme';

type Simulation = BookingResult & { estimate: number; currency: string; route: [number, number][] | null };

const QUICK = ['ritz', 'gare-du-nord', 'gare-de-lyon', 'cdg-2e', 'orly-4'];
const asPlace = (id: string): Place => {
  const p = SUGGESTED_PLACES.find((x) => x.id === id)!;
  return { lng: p.lngLat[0], lat: p.lngLat[1], address: p.address };
};

/**
 * Tries a trip with the prices typed on the Tarifs page (saved or not): map, route, price and its detail.
 * Nothing is saved.
 */
export function PriceSimulator({
  driverId,
  currency,
  typedSettings,
}: {
  driverId: string;
  currency: string;
  typedSettings: () => Record<string, unknown> | null;
}) {
  const { t, err, lang } = useAuth();
  const [from, setFrom] = useState<Place | null>(() => asPlace('ritz'));
  const [to, setTo] = useState<Place | null>(() => asPlace('cdg-2e'));
  const [when, setWhen] = useState(() => new Date(Date.now() + 24 * 3600_000).toISOString());
  const [vehicle, setVehicle] = useState<'sedan' | 'van'>('sedan');
  const [luggage, setLuggage] = useState(2);
  const [childSeats, setChildSeats] = useState(0);
  const [meetGreet, setMeetGreet] = useState(false);
  const [result, setResult] = useState<Simulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const money = (n: number | null | undefined) => formatPrice(n, result?.currency ?? currency, lang);

  const run = async () => {
    const settings = typedSettings();
    if (!from || !to || !settings) {
      setError(err('BAD_INPUT'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.post<Simulation>(`/api/admin/pricing/${driverId}/simulate`, {
          pickup: { lat: from.lat, lng: from.lng },
          dropoff: { lat: to.lat, lng: to.lng },
          pickup_at: when,
          vehicle,
          luggage,
          child_seats: childSeats,
          meet_greet: meetGreet,
          settings,
        }),
      );
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle icon="activity" help={t('simulatorHelp')}>{t('simulator')}</CardTitle>
      <AddressInput label={t('from')} value={from} onChange={setFrom} />
      <Row style={{ gap: 6, flexWrap: 'wrap' }}>
        {QUICK.map((id) => (
          <Chip key={id} label={SUGGESTED_PLACES.find((x) => x.id === id)!.short} selected={from?.address === asPlace(id).address} onPress={() => setFrom(asPlace(id))} />
        ))}
      </Row>
      <AddressInput label={t('to')} value={to} onChange={setTo} />
      <Row style={{ gap: 6, flexWrap: 'wrap' }}>
        {QUICK.map((id) => (
          <Chip key={id} label={SUGGESTED_PLACES.find((x) => x.id === id)!.short} selected={to?.address === asPlace(id).address} onPress={() => setTo(asPlace(id))} />
        ))}
      </Row>
      <DateTimeField label={t('when')} value={when} onChange={setWhen} />
      <Segmented<'sedan' | 'van'> options={[{ value: 'sedan', label: t('sedan') }, { value: 'van', label: t('van') }]} value={vehicle} onChange={setVehicle} />
      <Stepper label={t('luggage')} value={luggage} max={8} onChange={setLuggage} />
      <Stepper label={t('childSeats')} value={childSeats} max={3} onChange={setChildSeats} />
      <Toggle label={t('meetGreet')} value={meetGreet} onChange={setMeetGreet} />
      <Button icon="play" title={t('simulate')} onPress={run} loading={busy} />
      {error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <View style={{ gap: 10, marginTop: 6 }}>
          {from && to ? (
            <MapScene
              style={{ height: 240, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}
              mode="trip"
              pickup={[from.lng, from.lat]}
              dropoff={[to.lng, to.lat]}
              route={result.route ?? [[from.lng, from.lat], [to.lng, to.lat]]}
              padding={{ top: 30, bottom: 30, left: 30, right: 30 }}
            />
          ) : null}
          <MonoLine muted>
            {`${formatKm(result.distance_m ?? 0, lang)} · ${formatMinutes(result.duration_s ?? 0)}${result.route_estimated ? ` · ${t('estimateShort')}` : ''}`}
          </MonoLine>
          <CountUp value={Number(result.estimate)} format={money} size={44} />
          {result.breakdown?.length ? <PriceDetail lines={priceLines(result.breakdown, t, lang, money)} total={money(result.estimate)} /> : null}
        </View>
      ) : null}
    </Card>
  );
}
