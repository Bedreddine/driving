import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Label, Muted, Row, styles, Title } from '@/components/ui';
import { forgetContact, linkContacts } from '@/lib/api';
import { confirmAsk } from '@/lib/confirm';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/http';

type Contact = { id: string; full_name: string; phone: string | null; email: string | null; user_id: string | null; notice_given: boolean };
type Suggestion = { account_contact_id: string; existing_contact_id: string; match: 'email' | 'phone' };

export default function AdminContacts() {
  const { t, err } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() =>
    Promise.all([
      api.get<Contact[]>('/api/contacts?limit=1000'),
      api.get<Suggestion[]>('/api/admin/contact-links'),
    ]).then(([c, s]) => {
      setContacts(c);
      setSuggestions(s);
    }), []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    void api
      .get<{ notes: string }>(`/api/contacts/${selected.id}/notes`)
      .then((r) => setNotes(r.notes))
      .catch(() => setNotes(''));
  }, [selected]);

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const q = search.trim().toLowerCase();
  const shown = contacts.filter(
    (c) => !q || c.full_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q),
  );

  const saveNotes = async () => {
    if (!selected) return;
    try {
      await api.put(`/api/contacts/${selected.id}/notes`, { notes });
      setError(null);
    } catch (e) {
      setError(err((e as Error).message));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Title>{t('contacts')}</Title>

      {suggestions.length > 0 ? (
        <Card>
          <Label>{t('linkSuggestions')}</Label>
          {suggestions.map((s) => {
            const a = byId.get(s.account_contact_id);
            const e = byId.get(s.existing_contact_id);
            return (
              <Row key={`${s.account_contact_id}-${s.existing_contact_id}`} style={{ justifyContent: 'space-between', gap: 8 }}>
                <Text style={[styles.text, { flex: 1 }]}>
                  {a?.full_name} ({a?.email}) ↔ {e?.full_name} ({e?.phone ?? e?.email}) ·{' '}
                  {s.match === 'email' ? '@ email' : '☎ phone'}
                </Text>
                <Button
                  kind="secondary"
                  title={t('link')}
                  onPress={async () => {
                    try {
                      await linkContacts(s.account_contact_id, s.existing_contact_id);
                      await load();
                    } catch (x) {
                      setError(err((x as Error).message));
                    }
                  }}
                />
              </Row>
            );
          })}
        </Card>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <Row style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 300, gap: 8 }}>
          <Field label={t('search')} value={search} onChangeText={setSearch} />
          {shown.map((c) => (
            <Card key={c.id} style={selected?.id === c.id ? { borderColor: '#1F3A5F', borderWidth: 2 } : undefined}>
              <Text style={[styles.text, { fontWeight: '600' }]} onPress={() => setSelected(c)}>
                {c.full_name} {c.user_id ? '📱' : ''}
              </Text>
              <Muted>{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</Muted>
            </Card>
          ))}
        </View>
        {selected ? (
          <Card style={{ flex: 1, minWidth: 300 }}>
            <Title>{selected.full_name}</Title>
            <Muted>{[selected.phone, selected.email].filter(Boolean).join(' · ')}</Muted>
            <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
            <Button title={t('save')} onPress={saveNotes} />
            {!selected.user_id ? (
              <Button
                kind="danger"
                title={t('forgetContact')}
                onPress={async () => {
                  if (!(await confirmAsk(t('forgetContactConfirm'), t('delete'), t('back')))) return;
                  try {
                    await forgetContact(selected.id);
                    setSelected(null);
                    await load();
                  } catch (e) {
                    setError(err((e as Error).message));
                  }
                }}
              />
            ) : null}
          </Card>
        ) : null}
      </Row>
    </ScrollView>
  );
}
