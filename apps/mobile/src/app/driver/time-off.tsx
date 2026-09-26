import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { Button, Card, ErrorText, Field, Label, Muted, Row, Screen, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { api } from '@/lib/http';

type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string | null };

export default function TimeOffScreen() {
  const { t, err, lang } = useAuth();
  const [items, setItems] = useState<TimeOff[]>([]);
  const [start, setStart] = useState(() => new Date(Date.now() + 86400_000).toISOString());
  const [end, setEnd] = useState(() => new Date(Date.now() + 86400_000 + 4 * 3600_000).toISOString());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .get<TimeOff[]>('/api/driver/time-off')
        .then(setItems)
        .catch((e: Error) => setError(err(e.message))),
    [err],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setError(null);
    if (new Date(end) <= new Date(start)) return setError(err('BAD_INPUT'));
    try {
      await api.post('/api/driver/time-off', { starts_at: start, ends_at: end, reason: reason.trim() || null });
      setReason('');
      await load();
    } catch (e) {
      setError(err((e as Error).message));
    }
  };

  const remove = async (id: string) => {
    await api.del(`/api/driver/time-off/${id}`).catch(() => undefined);
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
      {items.map((x) => (
        <Card key={x.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[styles.text, { flex: 1 }]}>
              {formatDateTime(x.starts_at, lang)} → {formatDateTime(x.ends_at, lang)}
              {x.reason ? `\n${x.reason}` : ''}
            </Text>
            <Button kind="danger" title={t('delete')} onPress={() => void remove(x.id)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
