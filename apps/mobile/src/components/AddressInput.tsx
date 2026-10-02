import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { Place } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { searchAddress } from '@/lib/geocode';
import { useTheme } from '@/lib/theme';
import { ClearButton, FieldShell, fieldInputStyle, styles } from './ui';

/** Address field with suggestions while typing (OpenStreetMap / Photon). */
export function AddressInput({ label, value, onChange }: { label: string; value: Place | null; onChange: (p: Place | null) => void }) {
  const { lang, t } = useAuth();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
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
    <View>
      <FieldShell
        label={label}
        floated={focused || text.length > 0}
        focused={focused}
        icon="map-pin"
        right={
          loading && searching ? (
            <ActivityIndicator style={{ marginRight: 6 }} color={theme.primary} />
          ) : text ? (
            <ClearButton
              label={`${label} ×`}
              onPress={() => {
                setText('');
                setSelectedText('');
                if (value) onChange(null);
              }}
            />
          ) : null
        }
      >
        <TextInput
          accessibilityLabel={label}
          style={fieldInputStyle(theme.text)}
          value={text}
          placeholder={t('searchAddress')}
          placeholderTextColor={focused ? theme.muted : 'transparent'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={(v) => {
            setText(v);
            if (value) onChange(null);
          }}
          autoCorrect={false}
        />
      </FieldShell>
      {visibleResults.length > 0 ? (
        <View style={[styles.card, { marginTop: 4, padding: 0, gap: 0, backgroundColor: theme.surface, borderColor: theme.rule }]}>
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
                borderTopColor: theme.rule,
                backgroundColor: pressed ? theme.paper : undefined,
              })}
            >
              <Text style={[styles.text, { color: theme.text }]}>{p.address}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={[styles.muted, { fontSize: 11, marginTop: 2, color: theme.muted }]}>© OpenStreetMap</Text>
    </View>
  );
}
