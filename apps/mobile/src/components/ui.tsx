import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { choiceColors, Icon, Touchable, type IconName } from './controls';
import { fonts, night, tabular, useTheme, radius } from '@/lib/theme';

/** The night palette under the names the driver and back-office screens use (DESIGN.md › Colors). */
export const colors = {
  bg: night.paper,
  card: night.surface,
  text: night.text,
  muted: night.muted,
  border: night.rule,
  primary: night.primary,
  primaryText: night.onPrimary,
  danger: night.error,
  raised: night.raised,
  success: night.success,
  warning: night.warning,
};

export { fonts };
export { ArrowRight, Button, ClearButton, Field, FieldShell, fieldInputStyle, Icon, Stepper, tick, Toggle, Touchable, type IconName } from './controls';

/**
 * Page frame: safe areas (notch, home bar), keyboard that never covers the focused field, scrolling.
 * `top`: also keep clear of the status bar / notch, for screens without a navigation header.
 */
export function Screen({ children, scroll = true, top = false }: { children: ReactNode; scroll?: boolean; top?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.paper }]}
      edges={top ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <View style={styles.inner}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.inner, { flex: 1 }]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.label, { color: theme.muted }]}>{children}</Text>;
}

/** Body text in the current palette. */
export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.text, { color: theme.text }, style]}>{children}</Text>;
}

/** Numbers the client compares (price, time, flight): JetBrains Mono, tabular. */
export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.mono, { color: theme.text }, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[styles.muted, { color: theme.muted }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.rule }, style]}>{children}</View>;
}

/** The heading of a back-office card: icon, title, and an optional line of help under it. */
export function CardTitle({ icon, children, help, right }: { icon?: IconName; children: ReactNode; help?: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ? (
          <View style={{ width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: theme.rule, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={16} color={theme.primary} />
          </View>
        ) : null}
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 17, color: theme.text }}>
          {children}
        </Text>
        {right}
      </View>
      {help ? <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{help}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** A small choice between a few options (vehicle, licence, status…): selected in amber with a check. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <Row style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            pressScale={0.95}
            style={({ pressed, hovered }) => {
              const c = choiceColors(theme, on, pressed || hovered);
              return [styles.segment, { borderColor: c.borderColor, backgroundColor: c.backgroundColor }];
            }}
          >
            {on ? <Icon name="check" size={15} color={theme.primary} /> : null}
            <Text style={{ color: on ? theme.primary : theme.text, fontFamily: fonts.semibold, fontSize: 15 }}>{o.label}</Text>
          </Touchable>
        );
      })}
    </Row>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const theme = useTheme();
  if (!children) return null;
  return <Text style={[styles.error, { color: theme.error }]}>{children}</Text>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error' }) {
  const theme = useTheme();
  const color =
    tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : tone === 'error' ? theme.error : theme.primary;
  return (
    <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.rule }]}>
      <Text style={[styles.text, { color }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center' }}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.text, marginBottom: 4 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 0.66,
    color: colors.muted,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text },
  mono: { fontFamily: fonts.mono, ...tabular },
  muted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.2 },
  field: { marginVertical: 6 },
  input: {
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 8,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : {}),
  },
  stepBtn: { width: 38, height: 38, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  stepText: { fontSize: 20, color: colors.primary, fontFamily: fonts.medium },
  segmented: { gap: 8, flexWrap: 'wrap' },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 15, lineHeight: 21 },
  notice: { borderWidth: 1, padding: 12, borderRadius: radius.control },
});
