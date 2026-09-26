import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { Place } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { searchAddress } from '@/lib/geocode';
import { colors, Label, styles } from './ui';

/** Address field with suggestions while typing (OpenStreetMap / Photon). */
export function AddressInput({ label, value, onChange }: { label: string; value: Place | null; onChange: (p: Place | null) => void }) {
  const { lang, t } = useAuth();
  const [text, setText] = useState(value?.address ?? '');
  const [selectedText, setSelectedText] = useState(value?.address ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);

  // When the parent sets a new place (e.g. re-booking), show its address.
  // Adjusting state during render is React's recommended way to follow a prop.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      setText(value.address);
      setSelectedText(value.address);
    }
  }

  const searching = text !== selectedText && text.trim().length >= 3;
  const visibleResults = searching ? results : [];

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    // Wait until the user stops typing for a moment: fewer requests to the free server.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchAddress(text, lang, controller.signal));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, lang, searching]);

  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        value={text}
        placeholder={t('searchAddress')}
        placeholderTextColor={colors.muted}
        onChangeText={(v) => {
          setText(v);
          if (value) onChange(null);
        }}
        autoCorrect={false}
      />
      {loading && searching ? <ActivityIndicator style={{ marginTop: 6 }} color={colors.primary} /> : null}
      {visibleResults.length > 0 ? (
        <View style={[styles.card, { marginTop: 4, padding: 0, gap: 0 }]}>
          {visibleResults.map((p, i) => (
            <Pressable
              key={`${p.lat},${p.lng},${i}`}
              onPress={() => {
                setSelectedText(p.address);
                setText(p.address);
                setResults([]);
                onChange(p);
              }}
              style={({ pressed }) => ({
                padding: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: pressed ? colors.bg : undefined,
              })}
            >
              <Text style={styles.text}>{p.address}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[styles.muted, { fontSize: 11, marginTop: 2 }]}>© OpenStreetMap</Text>
    </View>
  );
}
