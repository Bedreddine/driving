import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Label, Muted, Row, styles, Title } from '@/components/ui';
import { linkContacts } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Contact = { id: string; full_name: string; phone: string | null; email: string | null; profile_id: string | null; notice_given: boolean };
type Suggestion = { account_contact_id: string; existing_contact_id: string; match: 'verified_email' | 'phone_unverified' };

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
      supabase
        .from('contacts')
        .select('id, full_name, phone, email, profile_id, notice_given')
        .is('anonymized_at', null)
        .order('full_name')
        .limit(1000),
      supabase.rpc('contact_link_suggestions'),
    ]).then(([{ data: c }, { data: s }]) => {
      setContacts((c as Contact[]) ?? []);
      setSuggestions((s as Suggestion[]) ?? []);
    }), []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    void supabase
      .from('contact_notes')
      .select('notes')
      .eq('contact_id', selected.id)
      .maybeSingle()
      .then(({ data }) => setNotes((data?.notes as string) ?? ''));
  }, [selected]);

  const byId = new Map(contacts.map((c) => [c.id, c]));
  const q = search.trim().toLowerCase();
  const shown = contacts.filter(
    (c) => !q || c.full_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q),
  );

  const saveNotes = async () => {
    if (!selected) return;
    const { error: e } = await supabase.from('contact_notes').upsert({ contact_id: selected.id, notes, updated_at: new Date().toISOString() });
    setError(e ? err('generic') : null);
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
                  {s.match === 'verified_email' ? '✓ email' : '? phone'}
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
                {c.full_name} {c.profile_id ? '📱' : ''}
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
          </Card>
        ) : null}
      </Row>
    </ScrollView>
  );
}
