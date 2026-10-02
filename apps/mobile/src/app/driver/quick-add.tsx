import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { BookingForm } from '@/components/BookingForm';
import { Button, Card, ErrorText, Field, Label, Row, Screen, Segmented, styles, Toggle } from '@/components/ui';
import type { BookingInput } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parsePrice } from '@/lib/format';
import { isPhone } from '@/lib/validate';
import { api } from '@/lib/http';
import { fonts } from '@/lib/theme';

type Contact = { id: string; full_name: string; phone: string | null };
type Source = NonNullable<BookingInput['source']>;

export default function QuickAdd() {
  const { t, err } = useAuth();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [notice, setNotice] = useState(false);
  const [source, setSource] = useState<Source>('phone');
  const [agreed, setAgreed] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();
  const visibleResults = q.length < 2 ? [] : results;

  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      const found = await api.get<Contact[]>(`/api/contacts?limit=8&q=${encodeURIComponent(q)}`).catch(() => []);
      setResults(found);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const createContact = async () => {
    setError(null);
    try {
      setContact(
        await api.post<Contact>('/api/contacts', { full_name: newName.trim(), phone: newPhone.trim() || null, notice_given: notice }),
      );
      setCreating(false);
    } catch (e) {
      setError(err((e as Error).message));
    }
  };

  const agreedPrice = agreed.trim() ? parsePrice(agreed) : undefined;
  const extra = useMemo<Partial<BookingInput>>(
    () => ({ contact_id: contact?.id, source, agreed_price: agreedPrice ?? undefined }),
    [contact, source, agreedPrice],
  );

  return (
    <Screen>
      <Label>{t('customer')}</Label>
      {contact ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>
              {contact.full_name} {contact.phone ? `· ${contact.phone}` : ''}
            </Text>
            <Button kind="secondary" title="✕" onPress={() => setContact(null)} />
          </Row>
        </Card>
      ) : creating ? (
        <Card>
          <Field label={t('fullName')} value={newName} onChangeText={setNewName} />
          <Field label={t('phone')} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
          {newPhone.trim() && !isPhone(newPhone) ? <ErrorText>{err('BAD_PHONE')}</ErrorText> : null}
          <Toggle label={t('noticeGiven')} value={notice} onChange={setNotice} />
          <Button title={t('save')} onPress={createContact} disabled={!newName.trim() || (!!newPhone.trim() && !isPhone(newPhone))} />
          <Button kind="secondary" title={t('back')} onPress={() => setCreating(false)} />
        </Card>
      ) : (
        <>
          <Field label={t('search')} value={query} onChangeText={setQuery} placeholder={t('pickCustomer')} />
          {visibleResults.map((c) => (
            <Pressable key={c.id} onPress={() => setContact(c)}>
              <Card>
                <Text style={styles.text}>
                  {c.full_name} {c.phone ? `· ${c.phone}` : ''}
                </Text>
              </Card>
            </Pressable>
          ))}
          <Button kind="secondary" title={`+ ${t('newCustomer')}`} onPress={() => (setCreating(true), setNewName(query))} />
        </>
      )}
      <ErrorText>{error}</ErrorText>

      <BookingForm
        mode="quick_add"
        extra={extra}
        canSubmit={!!contact && agreedPrice !== null}
        extraFields={
          <>
            <Label>{t('source')}</Label>
            <Segmented<Source>
              options={(['phone', 'whatsapp', 'in_person', 'other'] as const).map((s) => ({
                value: s,
                label: t(`source_${s}`),
              }))}
              value={source}
              onChange={setSource}
            />
            <Field label={t('agreedPrice')} value={agreed} onChangeText={setAgreed} keyboardType="decimal-pad" />
            {agreedPrice === null ? <ErrorText>{err('BAD_INPUT')}</ErrorText> : null}
          </>
        }
        onBooked={(id) => router.replace({ pathname: '/driver/ride/[id]', params: { id } })}
      />
    </Screen>
  );
}
