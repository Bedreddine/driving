import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Muted, Notice, Row, styles, Title, Toggle } from '@/components/ui';
import { getDriver } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayNames } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Day = { enabled: boolean; start: string; end: string };
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function fetchHours(): Promise<{ driverId: string; days: Day[] } | null> {
  const driver = await getDriver();
  if (!driver) return null;
  const { data } = await supabase.from('working_hours').select('weekday, start_time, end_time').eq('driver_id', driver.id);
  const days = Array.from({ length: 7 }, () => ({ enabled: false, start: '06:00', end: '22:00' }));
  for (const h of (data ?? []) as { weekday: number; start_time: string; end_time: string }[]) {
    days[h.weekday] = { enabled: true, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) };
  }
  return { driverId: driver.id, days };
}

export default function AdminHours() {
  const { t, err, lang } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [days, setDays] = useState<Day[]>(() => Array.from({ length: 7 }, () => ({ enabled: false, start: '06:00', end: '22:00' })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetchHours().then((r) => {
      if (!r) return;
      setDriverId(r.driverId);
      setDays(r.days);
    });
  }, []);

  const update = (d: number, patch: Partial<Day>) => {
    setSaved(false);
    setDays((prev) => prev.map((x, i) => (i === d ? { ...x, ...patch } : x)));
  };

  const save = async () => {
    if (!driverId) return;
    const rows = days
      .map((d, weekday) => ({ ...d, weekday }))
      .filter((d) => d.enabled);
    if (rows.some((d) => !TIME.test(d.start) || !TIME.test(d.end) || d.start >= d.end)) return setError(err('BAD_INPUT'));
    setError(null);
    const del = await supabase.from('working_hours').delete().eq('driver_id', driverId);
    if (del.error) return setError(err('generic'));
    if (rows.length) {
      const ins = await supabase
        .from('working_hours')
        .insert(rows.map((d) => ({ driver_id: driverId, weekday: d.weekday, start_time: d.start, end_time: d.end })));
      if (ins.error) return setError(err('generic'));
    }
    setSaved(true);
  };

  const names = dayNames(lang);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, maxWidth: 700 }}>
      <Title>{t('hours')}</Title>
      <Muted>{t('hoursHelp')}</Muted>
      <Card>
        {ORDER.map((d) => (
          <Row key={d} style={{ gap: 12, flexWrap: 'wrap' }}>
            <View style={{ width: 150 }}>
              <Toggle label={names[d]} value={days[d].enabled} onChange={(v) => update(d, { enabled: v })} />
            </View>
            {days[d].enabled ? (
              <>
                <View style={{ width: 100 }}>
                  <Field label={t('start')} value={days[d].start} onChangeText={(v) => update(d, { start: v })} />
                </View>
                <View style={{ width: 100 }}>
                  <Field label={t('end')} value={days[d].end} onChangeText={(v) => update(d, { end: v })} />
                </View>
              </>
            ) : (
              <Text style={styles.muted}>—</Text>
            )}
          </Row>
        ))}
      </Card>
      <ErrorText>{error}</ErrorText>
      {saved ? <Notice tone="success">{t('saved')}</Notice> : null}
      <Button title={t('save')} onPress={save} />
    </ScrollView>
  );
}
