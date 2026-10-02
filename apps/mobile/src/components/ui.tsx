import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#F6F6F4',
  card: '#FFFFFF',
  text: '#1B1B1F',
  muted: '#6B6B73',
  border: '#E2E2E0',
  primary: '#1F3A5F',
  primaryText: '#FFFFFF',
  accent: '#F2B705',
  danger: '#B3261E',
  success: '#1E7B3A',
  warning: '#8A5A00',
  // Premium booking website
  night: '#0E0E10',
  gold: '#C8A96A',
  goldDark: '#A88B4F',
};

/** Serif display font for the premium booking website. */
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.inner, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'gold';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, kind = 'primary', disabled, loading, style }: ButtonProps) {
  const bg =
    kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : kind === 'gold' ? colors.gold : colors.card;
  const fg = kind === 'secondary' ? colors.primary : kind === 'gold' ? colors.night : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        kind === 'secondary' && { borderWidth: 1, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginVertical: 6 }}>
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </Row>
  );
}

/** + / - counter for passengers and luggage. */
export function Stepper({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (v: number) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginVertical: 6 }}>
      <Text style={styles.text}>{label}</Text>
      <Row style={{ gap: 12 }}>
        <Pressable accessibilityLabel={`${label} -`} onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={[styles.text, { minWidth: 24, textAlign: 'center' }]}>{value}</Text>
        <Pressable accessibilityLabel={`${label} +`} onPress={() => onChange(Math.min(max, value + 1))} style={styles.stepBtn}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </Row>
    </Row>
  );
}

/** A small choice between a few options (vehicle, source, language...). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <Row style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: o.value === value ? colors.primaryText : colors.text, fontWeight: '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </Row>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' }) {
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View style={[styles.notice, { borderLeftColor: color }]}>
      <Text style={[styles.text, { color }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 4, textTransform: 'uppercase' },
  text: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  field: { marginVertical: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  stepText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
  segmented: { gap: 8, flexWrap: 'wrap' },
  segment: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  error: { color: colors.danger, fontSize: 15 },
  notice: { backgroundColor: colors.card, borderLeftWidth: 4, padding: 12, borderRadius: 8 },
});
