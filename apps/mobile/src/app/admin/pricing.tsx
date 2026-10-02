import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AddressInput } from '@/components/AddressInput';
import { PriceSimulator } from '@/components/PriceSimulator';
import { Button, Card, CardTitle, Field, Label, Muted, Notice, Row, Segmented, styles, Title, Toggle } from '@/components/ui';
import type { Place } from '@/lib/api';
import { getDriver } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayNames, type TextKey } from '@/lib/i18n';
import { formatPrice, parsePrice } from '@/lib/format';
import { api } from '@/lib/http';
import { fonts } from '@/lib/theme';

type Settings = {
  driver_id: string;
  licence: 'vtc' | 'taxi';
  currency: string;
  base_fare: number;
  per_km: number;
  per_minute: number;
  minimum_fare: number;
  airport_wait_minutes: number;
  meet_greet_minutes: number;
  min_gap_minutes: number;
  lead_time_minutes: number;
  distance_tiers: Tier[];
  van_percent: number;
  meet_greet_fee: number;
  child_seat_fee: number;
  included_luggage: number;
  extra_luggage_fee: number;
  waiting_per_minute: number;
};
type Tier = { from_km: number; per_km: number };
type Zone = { id: string; name: string; kind: 'airport' | 'station' | 'other'; radius_m: number };
type Fixed = { id: string; from_zone: string; to_zone: string; price: number; both_directions: boolean };
type Surcharge = { id: string; name: string; days: number[]; start_time: string; end_time: string; percent: number };

const moneyFields = ['base_fare', 'per_km', 'per_minute', 'minimum_fare'] as const;
const extraMoneyFields = ['meet_greet_fee', 'child_seat_fee', 'extra_luggage_fee', 'waiting_per_minute'] as const;
const extraIntFields = ['included_luggage', 'van_percent'] as const;
const extraLabels: Record<(typeof extraMoneyFields)[number] | (typeof extraIntFields)[number], TextKey> = {
  meet_greet_fee: 'meetGreetFee',
  child_seat_fee: 'childSeatFee',
  extra_luggage_fee: 'extraLuggageFee',
  waiting_per_minute: 'waitingPerMinute',
  included_luggage: 'includedLuggage',
  van_percent: 'vanPercent',
};
const minuteFields = ['airport_wait_minutes', 'meet_greet_minutes', 'min_gap_minutes', 'lead_time_minutes'] as const;
const minuteLabels: Record<(typeof minuteFields)[number], TextKey> = {
  airport_wait_minutes: 'airportWait',
  meet_greet_minutes: 'meetGreetMin',
  min_gap_minutes: 'minGap',
  lead_time_minutes: 'leadTime',
};

async function fetchPricing() {
  const driver = await getDriver();
  if (!driver) return null;
  const all = await api.get<{ settings: Settings; zones: Zone[]; fixed_prices: Fixed[]; surcharges: Surcharge[] }>(
    `/api/admin/pricing/${driver.id}`,
  );
  return { settings: all.settings, zones: all.zones, fixed: all.fixed_prices, surcharges: all.surcharges };
}

export default function AdminPricing() {
  const { t, err, lang } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [fixed, setFixed] = useState<Fixed[]>([]);
  const [surcharges, setSurcharges] = useState<Surcharge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tiers, setTiers] = useState<{ from_km: string; per_km: string }[]>([]);

  // new zone / fixed price / surcharge
  const [zonePlace, setZonePlace] = useState<Place | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneKind, setZoneKind] = useState<Zone['kind']>('other');
  const [zoneRadius, setZoneRadius] = useState('1000');
  const [fxFrom, setFxFrom] = useState<string | null>(null);
  const [fxTo, setFxTo] = useState<string | null>(null);
  const [fxPrice, setFxPrice] = useState('');
  const [fxBoth, setFxBoth] = useState(true);
  const [scName, setScName] = useState('');
  const [scDays, setScDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [scStart, setScStart] = useState('20:00');
  const [scEnd, setScEnd] = useState('07:00');
  const [scPercent, setScPercent] = useState('15');

  const load = useCallback(
    () =>
      fetchPricing().then((r) => {
        if (!r) return;
        setSettings(r.settings);
        if (r.settings) {
          const st = r.settings;
          setForm(Object.fromEntries([...moneyFields, ...minuteFields, ...extraMoneyFields, ...extraIntFields].map((k) => [k, String(st[k] ?? '')])));
          setTiers((st.distance_tiers ?? []).map((x) => ({ from_km: String(x.from_km), per_km: String(x.per_km) })));
        }
        setZones(r.zones);
        setFixed(r.fixed);
        setSurcharges(r.surcharges);
      }),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a change, shows its error if any, reloads on success. */
  const mutate = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
      await load();
      return true;
    } catch (e) {
      setError(err((e as Error).message));
      return false;
    }
  };

  /** The settings as typed on the page (saved or not); null when a value is not valid. */
  const typedSettings = (): Record<string, unknown> | null => {
    if (!settings) return null;
    const update: Record<string, unknown> = { licence: settings.licence };
    for (const k of [...moneyFields, ...extraMoneyFields]) {
      const v = parsePrice(form[k] ?? '');
      if (v === null) return null;
      update[k] = v;
    }
    for (const k of [...minuteFields, ...extraIntFields]) {
      const v = Number(form[k]);
      if (!Number.isInteger(v) || v < 0) return null;
      update[k] = v;
    }
    const list: Tier[] = [];
    for (const tier of tiers) {
      const from = parsePrice(tier.from_km);
      const rate = parsePrice(tier.per_km);
      if (from === null || from <= 0 || rate === null) return null;
      list.push({ from_km: from, per_km: rate });
    }
    update.distance_tiers = list.sort((a, b) => a.from_km - b.from_km);
    return update;
  };

  const saveSettings = async () => {
    if (!settings) return;
    const update = typedSettings();
    if (!update) return setError(err('BAD_INPUT'));
    if (await mutate(() => api.put(`/api/admin/pricing/${settings.driver_id}/settings`, update))) setSaved(true);
  };
  const setField = (k: string) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const zoneName_ = (id: string) => zones.find((z) => z.id === id)?.name ?? '?';

  if (!settings) return <Muted style={{ padding: 20 }}>…</Muted>;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 96, gap: 16, maxWidth: 900 }}>
        <Title>{t('pricing')}</Title>

        <Card>
          <CardTitle icon="sliders">{t('licence')}</CardTitle>
          <Segmented<'vtc' | 'taxi'>
            options={[
              { value: 'vtc', label: 'VTC' },
              { value: 'taxi', label: 'Taxi' },
            ]}
            value={settings.licence}
            onChange={(v) => (setSettings({ ...settings, licence: v }), setSaved(false))}
          />
          <Muted>{t('licenceHelp')}</Muted>
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>
            {moneyFields.map((k) => (
              <View key={k} style={{ minWidth: 160, flex: 1 }}>
                <Field
                  label={t(
                    k === 'base_fare'
                      ? 'baseFare'
                      : k === 'per_km'
                        ? 'perKm'
                        : k === 'per_minute'
                          ? 'perMinute'
                          : 'minimumFare',
                  )}
                  value={form[k]}
                  onChangeText={(v) => (setForm({ ...form, [k]: v }), setSaved(false))}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </Row>
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>
            {minuteFields.map((k) => (
              <View key={k} style={{ minWidth: 200, flex: 1 }}>
                <Field
                  label={t(minuteLabels[k])}
                  value={form[k]}
                  onChangeText={(v) => (setForm({ ...form, [k]: v }), setSaved(false))}
                  keyboardType="number-pad"
                />
              </View>
            ))}
          </Row>
        </Card>

        <Card>
          <CardTitle icon="trending-down" help={t('distanceTiersHelp')}>{t('distanceTiers')}</CardTitle>
          {tiers.map((tier, i) => (
            <Row key={i} style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <View style={{ minWidth: 140, flex: 1 }}>
                <Field
                  label={t('fromKm')}
                  value={tier.from_km}
                  onChangeText={(v) => (setTiers((l) => l.map((x, j) => (j === i ? { ...x, from_km: v } : x))), setSaved(false))}
                  keyboardType="decimal-pad"
                  mono
                />
              </View>
              <View style={{ minWidth: 140, flex: 1 }}>
                <Field
                  label={t('perKmTier')}
                  value={tier.per_km}
                  onChangeText={(v) => (setTiers((l) => l.map((x, j) => (j === i ? { ...x, per_km: v } : x))), setSaved(false))}
                  keyboardType="decimal-pad"
                  mono
                />
              </View>
              <Button kind="danger" size="sm" icon="trash-2" title={t('remove')} onPress={() => (setTiers((l) => l.filter((_, j) => j !== i)), setSaved(false))} />
            </Row>
          ))}
          {tiers.length < 5 ? (
            <Button kind="secondary" icon="plus" title={t('addTier')} onPress={() => setTiers((l) => [...l, { from_km: '', per_km: '' }])} />
          ) : null}
        </Card>

        <Card>
          <CardTitle icon="plus-square">{t('extrasTitle')}</CardTitle>
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>
            {[...extraMoneyFields, ...extraIntFields].map((k) => (
              <View key={k} style={{ minWidth: 200, flex: 1 }}>
                <Field
                  label={t(extraLabels[k])}
                  value={form[k] ?? ''}
                  onChangeText={setField(k)}
                  keyboardType={k === 'included_luggage' || k === 'van_percent' ? 'number-pad' : 'decimal-pad'}
                  mono
                />
              </View>
            ))}
          </Row>
          <Muted>{t('vanHelp')}</Muted>
          <Muted>{t('waitingHelp')}</Muted>
        </Card>

        {saved ? <Notice tone="success">{t('saved')}</Notice> : null}
        <Button icon="check" title={t('save')} onPress={saveSettings} />

        <PriceSimulator driverId={settings.driver_id} currency={settings.currency} typedSettings={typedSettings} />

        <Card>
          <CardTitle icon="moon" help={t('surchargesHelp')}>{t('surcharges')}</CardTitle>
          {surcharges.map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between' }}>
              <Text style={styles.text}>
                {s.name}: +{s.percent}% · {s.days.map((d) => dayNames(lang)[d]).join(' ')} · {s.start_time.slice(0, 5)}{' '}
                → {s.end_time.slice(0, 5)}
              </Text>
              <Button
                kind="danger"
                size="sm"
                icon="trash-2"
                title={t('delete')}
                onPress={() => void mutate(() => api.del(`/api/admin/surcharges/${s.id}`))}
              />
            </Row>
          ))}
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <View style={{ minWidth: 140, flex: 1 }}>
              <Field label={t('name')} value={scName} onChangeText={setScName} />
            </View>
            <View style={{ width: 100 }}>
              <Field label={t('start')} value={scStart} onChangeText={setScStart} />
            </View>
            <View style={{ width: 100 }}>
              <Field label={t('end')} value={scEnd} onChangeText={setScEnd} />
            </View>
            <View style={{ width: 80 }}>
              <Field label="%" value={scPercent} onChangeText={setScPercent} keyboardType="decimal-pad" />
            </View>
          </Row>
          <DayPicker value={scDays} onChange={setScDays} />
          <Button
            kind="secondary"
            icon="plus"
            title={t('surcharges')}
            onPress={async () => {
              const pct = parsePrice(scPercent);
              if (
                !scName.trim() ||
                pct === null ||
                !/^\d\d:\d\d$/.test(scStart) ||
                !/^\d\d:\d\d$/.test(scEnd) ||
                !scDays.length
              ) {
                return setError(err('BAD_INPUT'));
              }
              const body = { name: scName.trim(), days: scDays, start_time: scStart, end_time: scEnd, percent: pct };
              if (await mutate(() => api.post(`/api/admin/pricing/${settings.driver_id}/surcharges`, body)))
                setScName('');
            }}
          />
        </Card>

        <Card>
          <CardTitle icon="target" help={t('zonesHelp')}>{t('zones')}</CardTitle>
          {zones.map((z) => (
            <Row key={z.id} style={{ justifyContent: 'space-between' }}>
              <Text style={styles.text}>
                {z.name} · {t(`zone_${z.kind}`)} · {z.radius_m} m
              </Text>
              <Button
                kind="danger"
                size="sm"
                icon="trash-2"
                title={t('delete')}
                onPress={() => void mutate(() => api.del(`/api/admin/zones/${z.id}`))}
              />
            </Row>
          ))}
          <AddressInput
            label={t('center')}
            value={zonePlace}
            onChange={(p) => (setZonePlace(p), p && !zoneName && setZoneName(p.address.split(',')[0]))}
          />
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <View style={{ minWidth: 160, flex: 1 }}>
              <Field label={t('name')} value={zoneName} onChangeText={setZoneName} />
            </View>
            <View style={{ width: 120 }}>
              <Field label={t('radius')} value={zoneRadius} onChangeText={setZoneRadius} keyboardType="number-pad" />
            </View>
          </Row>
          <Segmented<Zone['kind']>
            options={[
              { value: 'other', label: t('zone_other') },
              { value: 'airport', label: t('zone_airport') },
              { value: 'station', label: t('zone_station') },
            ]}
            value={zoneKind}
            onChange={setZoneKind}
          />
          <Button
            kind="secondary"
            icon="plus"
            title={t('zones')}
            onPress={async () => {
              const radius = Number(zoneRadius);
              if (!zonePlace || !zoneName.trim() || !Number.isInteger(radius) || radius <= 0)
                return setError(err('BAD_INPUT'));
              const body = {
                name: zoneName.trim(),
                kind: zoneKind,
                center_lat: zonePlace.lat,
                center_lng: zonePlace.lng,
                radius_m: radius,
              };
              if (await mutate(() => api.post('/api/admin/zones', body))) {
                setZonePlace(null);
                setZoneName('');
              }
            }}
          />
        </Card>

        <Card>
          <CardTitle icon="tag">{t('fixedPrices')}</CardTitle>
          {fixed.map((f) => (
            <Row key={f.id} style={{ justifyContent: 'space-between' }}>
              <Text style={styles.text}>
                {zoneName_(f.from_zone)} {f.both_directions ? '↔' : '→'} {zoneName_(f.to_zone)}:{' '}
                {formatPrice(f.price, settings.currency, lang)}
              </Text>
              <Button
                kind="danger"
                size="sm"
                icon="trash-2"
                title={t('delete')}
                onPress={() => void mutate(() => api.del(`/api/admin/fixed-prices/${f.id}`))}
              />
            </Row>
          ))}
          <Label>{t('from')}</Label>
          <Segmented<string>
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            value={fxFrom ?? ''}
            onChange={setFxFrom}
          />
          <Label>{t('to')}</Label>
          <Segmented<string>
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            value={fxTo ?? ''}
            onChange={setFxTo}
          />
          <Field label={t('price')} value={fxPrice} onChangeText={setFxPrice} keyboardType="decimal-pad" />
          <Toggle label={t('bothDirections')} value={fxBoth} onChange={setFxBoth} />
          <Button
            kind="secondary"
            icon="plus"
            title={t('fixedPrices')}
            onPress={async () => {
              const p = parsePrice(fxPrice);
              if (!fxFrom || !fxTo || p === null) return setError(err('BAD_INPUT'));
              const body = { from_zone: fxFrom, to_zone: fxTo, price: p, both_directions: fxBoth };
              if (await mutate(() => api.post(`/api/admin/pricing/${settings.driver_id}/fixed-prices`, body)))
                setFxPrice('');
            }}
          />
        </Card>
      </ScrollView>
      {error ? (
        // Pinned to the bottom of the screen: visible whichever card's button was pressed.
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, maxWidth: 860 }}>
          <Notice tone="warning">
            {error}{' '}
            <Text onPress={() => setError(null)} style={{ fontFamily: fonts.semibold }}>
              {' '}
              ✕
            </Text>
          </Notice>
        </View>
      ) : null}
    </View>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { lang } = useAuth();
  const names = dayNames(lang);
  return (
    <Row style={{ gap: 6, flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const n = names[d];
        const on = value.includes(d);
        return (
          <Button
            key={d}
            kind={on ? 'primary' : 'secondary'}
            title={n}
            onPress={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            style={{ paddingVertical: 6, minHeight: 36 }}
          />
        );
      })}
    </Row>
  );
}
