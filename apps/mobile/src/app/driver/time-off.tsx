import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { Button, Card, ErrorText, Field, Label, Muted, Row, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type TimeOff = { id: string; period: string; reason: string | null };

// Postgres returns ranges as text: ["2027-01-01 10:00:00+00","2027-01-01 12:00:00+00")
function parseRange(period: string): [string, string] {
  const m = /^[[(]"?([^",]+)"?,"?([^")]+)"?[\])]$/.exec(period);
  return m ? [new Date(m[1].replace(' ', 'T')).toISOString(), new Date(m[2].replace(' ', 'T')).toISOString()] : [period, period];
}

export default function TimeOffScreen() {
  const { t, err, lang } = useAuth();
  const [items, setItems] = useState<TimeOff[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [start, setStart] = useState(() => new Date(Date.now() + 86400_000).toISOString());
  const [end, setEnd] = useState(() => new Date(Date.now() + 86400_000 + 4 * 3600_000).toISOString());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      supabase
        .from('time_off')
        .select('id, period, reason')
        .order('period', { ascending: true })
        .then(({ data }) => {
          const now = Date.now();
          setItems(((data as TimeOff[]) ?? []).filter((x) => new Date(parseRange(x.period)[1]).getTime() > now));
        }),
    [],
  );

  useEffect(() => {
    void supabase.rpc('my_driver_id').then(({ data }) => setDriverId((data as string | null) ?? null));
    void load();
  }, [load]);

  const add = async () => {
    setError(null);
    if (!driverId || new Date(end) <= new Date(start)) return setError(err('BAD_INPUT'));
    const { error: e } = await supabase
      .from('time_off')
      .insert({ driver_id: driverId, period: `[${start},${end})`, reason: reason.trim() || null });
    if (e) return setError(err('generic'));
    setReason('');
    await load();
  };

  const remove = async (id: string) => {
    await supabase.from('time_off').delete().eq('id', id);
    await load();
  };

  return (
    <Screen>
      <Card>
        <Label>{t('addTimeOff')}</Label>
        <DateTimeField label={t('start')} value={start} onChange={setStart} />
        <DateTimeField label={t('end')} value={end} onChange={setEnd} />
        <Field label={t('reason')} value={reason} onChangeText={setReason} />
        <ErrorText>{error}</ErrorText>
        <Button title={t('save')} onPress={add} />
      </Card>
      {items.length === 0 ? <Muted>—</Muted> : null}
      {items.map((x) => {
        const [s, e] = parseRange(x.period);
        return (
          <Card key={x.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={[styles.text, { flex: 1 }]}>
                {formatDateTime(s, lang)} → {formatDateTime(e, lang)}
                {x.reason ? `\n${x.reason}` : ''}
              </Text>
              <Button kind="danger" title={t('delete')} onPress={() => void remove(x.id)} />
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
