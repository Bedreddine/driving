import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AddressInput } from '@/components/AddressInput';
import { Button, Card, ErrorText, Field, Label, Muted, Notice, Row, Segmented, styles, Title } from '@/components/ui';
import type { Place } from '@/lib/api';
import { getDriver } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayNames, type TextKey } from '@/lib/i18n';
import { formatPrice, parsePrice } from '@/lib/format';
import { supabase } from '@/lib/supabase';

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
};
type Zone = { id: string; name: string; kind: 'airport' | 'station' | 'other'; radius_m: number };
type Fixed = { id: string; from_zone: string; to_zone: string; price: number; both_directions: boolean };
type Surcharge = { id: string; name: string; days: number[]; start_time: string; end_time: string; percent: number };

const moneyFields = ['base_fare', 'per_km', 'per_minute', 'minimum_fare'] as const;
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
  const [s, z, f, sc] = await Promise.all([
    supabase.from('pricing_settings').select('*').eq('driver_id', driver.id).maybeSingle(),
    supabase.from('zones').select('id, name, kind, radius_m').order('name'),
    supabase.from('fixed_prices').select('id, from_zone, to_zone, price, both_directions').eq('driver_id', driver.id),
    supabase.from('surcharges').select('id, name, days, start_time, end_time, percent').eq('driver_id', driver.id),
  ]);
  return {
    settings: s.data as Settings | null,
    zones: (z.data as Zone[]) ?? [],
    fixed: (f.data as Fixed[]) ?? [],
    surcharges: (sc.data as Surcharge[]) ?? [],
  };
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

  // new zone / fixed price / surcharge
  const [zonePlace, setZonePlace] = useState<Place | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneKind, setZoneKind] = useState<Zone['kind']>('other');
  const [zoneRadius, setZoneRadius] = useState('1000');
  const [fxFrom, setFxFrom] = useState<string | null>(null);
  const [fxTo, setFxTo] = useState<string | null>(null);
  const [fxPrice, setFxPrice] = useState('');
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
          setForm(Object.fromEntries([...moneyFields, ...minuteFields].map((k) => [k, String(st[k])])));
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

  const check = (e: { message: string } | null) => {
    setError(e ? err('generic') : null);
    return !e;
  };

  const saveSettings = async () => {
    if (!settings) return;
    const update: Record<string, number | string> = { licence: settings.licence };
    for (const k of moneyFields) {
      const v = parsePrice(form[k] ?? '');
      if (v === null) return setError(err('BAD_INPUT'));
      update[k] = v;
    }
    for (const k of minuteFields) {
      const v = Number(form[k]);
      if (!Number.isInteger(v) || v < 0) return setError(err('BAD_INPUT'));
      update[k] = v;
    }
    if (check((await supabase.from('pricing_settings').update(update).eq('driver_id', settings.driver_id)).error)) {
      setSaved(true);
      await load();
    }
  };

  const zoneName_ = (id: string) => zones.find((z) => z.id === id)?.name ?? '?';

  if (!settings) return <Muted style={{ padding: 20 }}>…</Muted>;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 900 }}>
      <Title>{t('pricing')}</Title>
      <ErrorText>{error}</ErrorText>

      <Card>
        <Label>{t('licence')}</Label>
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
                label={t(k === 'base_fare' ? 'baseFare' : k === 'per_km' ? 'perKm' : k === 'per_minute' ? 'perMinute' : 'minimumFare')}
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
              <Field label={t(minuteLabels[k])} value={form[k]} onChangeText={(v) => (setForm({ ...form, [k]: v }), setSaved(false))} keyboardType="number-pad" />
            </View>
          ))}
        </Row>
        {saved ? <Notice tone="success">{t('saved')}</Notice> : null}
        <Button title={t('save')} onPress={saveSettings} />
      </Card>

      <Card>
        <Label>{t('surcharges')}</Label>
        <Muted>{t('surchargesHelp')}</Muted>
        {surcharges.map((s) => (
          <Row key={s.id} style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>
              {s.name}: +{s.percent}% · {s.days.map((d) => dayNames(lang)[d]).join(' ')} ·{' '}
              {s.start_time.slice(0, 5)} → {s.end_time.slice(0, 5)}
            </Text>
            <Button kind="danger" title={t('delete')} onPress={async () => check((await supabase.from('surcharges').delete().eq('id', s.id)).error) && load()} />
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
          title={`+ ${t('surcharges')}`}
          onPress={async () => {
            const pct = parsePrice(scPercent);
            if (!scName.trim() || pct === null || !/^\d\d:\d\d$/.test(scStart) || !/^\d\d:\d\d$/.test(scEnd) || !scDays.length) {
              return setError(err('BAD_INPUT'));
            }
            const e = (
              await supabase.from('surcharges').insert({
                driver_id: settings.driver_id,
                name: scName.trim(),
                days: scDays,
                start_time: scStart,
                end_time: scEnd,
                percent: pct,
              })
            ).error;
            if (check(e)) {
              setScName('');
              await load();
            }
          }}
        />
      </Card>

      <Card>
        <Label>{t('zones')}</Label>
        <Muted>{t('zonesHelp')}</Muted>
        {zones.map((z) => (
          <Row key={z.id} style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>
              {z.name} · {t(`zone_${z.kind}`)} · {z.radius_m} m
            </Text>
            <Button kind="danger" title={t('delete')} onPress={async () => check((await supabase.from('zones').delete().eq('id', z.id)).error) && load()} />
          </Row>
        ))}
        <AddressInput label={t('center')} value={zonePlace} onChange={(p) => (setZonePlace(p), p && !zoneName && setZoneName(p.address.split(',')[0]))} />
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
          title={`+ ${t('zones')}`}
          onPress={async () => {
            const radius = Number(zoneRadius);
            if (!zonePlace || !zoneName.trim() || !Number.isInteger(radius) || radius <= 0) return setError(err('BAD_INPUT'));
            const e = (
              await supabase.from('zones').insert({
                name: zoneName.trim(),
                kind: zoneKind,
                center_lat: zonePlace.lat,
                center_lng: zonePlace.lng,
                radius_m: radius,
              })
            ).error;
            if (check(e)) {
              setZonePlace(null);
              setZoneName('');
              await load();
            }
          }}
        />
      </Card>

      <Card>
        <Label>{t('fixedPrices')}</Label>
        {fixed.map((f) => (
          <Row key={f.id} style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>
              {zoneName_(f.from_zone)} {f.both_directions ? '↔' : '→'} {zoneName_(f.to_zone)}: {formatPrice(f.price, settings.currency, lang)}
            </Text>
            <Button kind="danger" title={t('delete')} onPress={async () => check((await supabase.from('fixed_prices').delete().eq('id', f.id)).error) && load()} />
          </Row>
        ))}
        <Label>{t('from')}</Label>
        <Segmented<string> options={zones.map((z) => ({ value: z.id, label: z.name }))} value={fxFrom ?? ''} onChange={setFxFrom} />
        <Label>{t('to')}</Label>
        <Segmented<string> options={zones.map((z) => ({ value: z.id, label: z.name }))} value={fxTo ?? ''} onChange={setFxTo} />
        <Field label={t('price')} value={fxPrice} onChangeText={setFxPrice} keyboardType="decimal-pad" />
        <Button
          kind="secondary"
          title={`+ ${t('fixedPrices')}`}
          onPress={async () => {
            const p = parsePrice(fxPrice);
            if (!fxFrom || !fxTo || p === null) return setError(err('BAD_INPUT'));
            const e = (
              await supabase.from('fixed_prices').insert({ driver_id: settings.driver_id, from_zone: fxFrom, to_zone: fxTo, price: p })
            ).error;
            if (check(e)) {
              setFxPrice('');
              await load();
            }
          }}
        />
      </Card>
    </ScrollView>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { lang } = useAuth();
  const names = dayNames(lang);
  return (
    <Row style={{ gap: 6, flexWrap: 'wrap' }}>
      {names.map((n, d) => {
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
