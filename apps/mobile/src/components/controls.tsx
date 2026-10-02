// Buttons, text fields, switches and counters of "Nuit Blanche" (DESIGN.md › Components).
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { durations, ease, nativeDriver, useReducedMotion } from '@/lib/motion';
import { fonts, tabular, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Feather>['name'];

/** Line icons (Feather, MIT licence), drawn in the text colour unless told otherwise. */
export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color?: string }) {
  const theme = useTheme();
  return <Feather name={name} size={size} color={color ?? theme.text} />;
}

/** Interaction shades of the palette, so hover and press never invent new colours. */
const shades = {
  primaryHover: '#F0B04F',
  primaryPressed: '#D8922F',
  borderHover: '#4A505A',
};

/** Keyboard focus ring on the website: a 2px amber outline, offset from the control. */
const focusRing = (on: boolean, color: string) =>
  Platform.OS === 'web'
    ? ({ outlineStyle: on ? 'solid' : 'none', outlineWidth: 2, outlineColor: color, outlineOffset: 2 } as unknown as ViewStyle)
    : null;

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

type ButtonProps = {
  title: string;
  onPress: () => void;
  /** primary: the one main action. secondary: other actions. danger: refusals and cancellations. ghost: a quiet text action. */
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  /** Icon before the label. */
  icon?: IconName;
  /** Shown at the right end: a price ("95,00 €") or an arrow; the label then sits on the left. */
  trailing?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, kind = 'primary', size = 'md', icon, trailing, disabled, loading, style, accessibilityLabel }: ButtonProps) {
  const theme = useTheme();
  const solid = kind === 'primary';
  const fg = solid ? theme.onPrimary : kind === 'danger' ? theme.error : kind === 'ghost' ? theme.primary : theme.text;
  const inactive = disabled || loading;
  const sm = size === 'sm';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={(state) => {
        const { pressed, hovered, focused } = state as PressState;
        const live = !inactive;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: trailing ? 'space-between' : 'center',
            gap: 10,
            minHeight: sm ? 40 : 54,
            paddingHorizontal: sm ? 12 : 18,
            paddingVertical: sm ? 8 : 14,
            borderRadius: 3,
          },
          solid
            ? { backgroundColor: live && pressed ? shades.primaryPressed : live && hovered ? shades.primaryHover : theme.primary }
            : kind === 'ghost'
              ? { backgroundColor: live && (hovered || pressed) ? theme.surface : 'transparent' }
              : {
                  borderWidth: 1,
                  borderColor: kind === 'danger' ? theme.error : live && hovered ? shades.borderHover : theme.rule,
                  backgroundColor: live && pressed ? theme.raised : live && hovered ? theme.surface : kind === 'danger' ? 'transparent' : theme.surface,
                },
          { opacity: disabled ? 0.45 : 1 },
          pressed && live ? { transform: [{ scale: 0.985 }] } : null,
          focusRing(!!focused, theme.primary),
          style,
        ];
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={sm ? 16 : 18} color={fg} /> : null}
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.bold, fontSize: sm ? 14 : 16, letterSpacing: 0.2, color: fg, opacity: loading ? 0.75 : 1, flexShrink: 1 }}
        >
          {title}
        </Text>
      </View>
      {typeof trailing === 'string' ? (
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: sm ? 13.5 : 15.5, color: fg, ...tabular }}>{trailing}</Text>
      ) : (
        trailing ?? null
      )}
    </Pressable>
  );
}

/** The arrow at the end of a call to action ("Où allons-nous ?  →"). */
export function ArrowRight({ color }: { color?: string }) {
  const theme = useTheme();
  return <Icon name="arrow-right" size={19} color={color ?? theme.onPrimary} />;
}

/**
 * The frame of a text field: a filled box whose label rests inside like a placeholder and floats up
 * when the field is focused or filled; amber border on focus, coral on error; optional icon and right-side action.
 */
export function FieldShell({
  label,
  floated,
  focused,
  error,
  hint,
  icon,
  right,
  multiline,
  children,
}: {
  label: string;
  floated: boolean;
  focused: boolean;
  error?: string | null;
  hint?: string | null;
  icon?: IconName;
  right?: ReactNode;
  multiline?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [up] = useState(() => new Animated.Value(floated ? 1 : 0));
  useEffect(() => {
    Animated.timing(up, { toValue: floated ? 1 : 0, duration: reduced ? 0 : durations.focus, easing: ease, useNativeDriver: nativeDriver }).start();
  }, [up, floated, reduced]);
  const left = icon ? 44 : 14;
  return (
    <View style={{ marginVertical: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 104 : 58,
          backgroundColor: focused ? theme.raised : theme.surface,
          borderWidth: 1,
          borderColor: error ? theme.error : focused ? theme.primary : theme.rule,
          borderRadius: 3,
        }}
      >
        {icon ? (
          <View style={{ position: 'absolute', left: 14, top: multiline ? 20 : 0, bottom: multiline ? undefined : 0, justifyContent: 'center' }}>
            <Icon name={icon} size={18} color={focused ? theme.primary : theme.muted} />
          </View>
        ) : null}
        <Animated.Text
          pointerEvents="none"
          numberOfLines={1}
          style={{
            position: 'absolute',
            left,
            right: right ? 44 : 12,
            top: 18,
            fontFamily: fonts.medium,
            fontSize: 16,
            lineHeight: 20,
            color: error ? theme.error : focused ? theme.primary : theme.muted,
            transformOrigin: 'left',
            transform: [
              { translateY: up.interpolate({ inputRange: [0, 1], outputRange: [0, -11] }) },
              { scale: up.interpolate({ inputRange: [0, 1], outputRange: [1, 0.74] }) },
            ],
          }}
        >
          {label}
        </Animated.Text>
        <View style={{ flex: 1, paddingLeft: left, paddingRight: right ? 4 : 14 }}>{children}</View>
        {right ? <View style={{ paddingRight: 8, alignSelf: multiline ? 'flex-start' : 'center', paddingTop: multiline ? 12 : 0 }}>{right}</View> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Icon name="alert-circle" size={14} color={theme.error} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: theme.error, flexShrink: 1 }}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: theme.muted, marginTop: 6 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Small round "×" that empties a field. */
export function ClearButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.rule : 'transparent',
      })}
    >
      <Icon name="x" size={16} color={theme.muted} />
    </Pressable>
  );
}

/** The text inside a FieldShell. */
export const fieldInputStyle = (color: string, mono?: boolean, multiline?: boolean) => ({
  paddingTop: multiline ? 30 : 24,
  paddingBottom: 8,
  minHeight: multiline ? 100 : 56,
  fontFamily: mono ? fonts.mono : fonts.body,
  fontSize: 16,
  color,
  textAlignVertical: multiline ? ('top' as const) : undefined,
  ...(mono ? tabular : {}),
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : {}),
});

/** A text field: label floating in the box, amber focus, clear button, error or hint under it. */
export function Field({
  label,
  mono,
  error,
  hint,
  icon,
  clearable = false,
  value,
  onChangeText,
  onFocus,
  onBlur,
  multiline,
  editable,
  style,
  placeholderTextColor,
  ...props
}: TextInputProps & { label: string; mono?: boolean; error?: string | null; hint?: string | null; icon?: IconName; clearable?: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const filled = !!value && value.length > 0;
  const floated = focused || filled;
  const canClear = clearable && filled && !multiline && editable !== false && !!onChangeText;
  return (
    <FieldShell
      label={label}
      floated={floated}
      focused={focused}
      error={error}
      hint={hint}
      icon={icon}
      multiline={multiline}
      right={
        canClear ? (
          <ClearButton
            label={`${label} ×`}
            onPress={() => {
              onChangeText?.('');
              input.current?.focus();
            }}
          />
        ) : null
      }
    >
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        editable={editable}
        // The label stands in for the placeholder until the field is focused.
        placeholderTextColor={focused ? (placeholderTextColor ?? theme.muted) : 'transparent'}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[fieldInputStyle(theme.text, mono, multiline), style]}
        {...props}
      />
    </FieldShell>
  );
}

/** On/off switch: amber track when on, the thumb slides across. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: reduced ? 0 : 180, easing: ease, useNativeDriver: nativeDriver }).start();
  }, [x, value, reduced]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={(state) => [
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
        focusRing(!!(state as PressState).focused, theme.primary),
      ]}
    >
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: theme.text }}>{label}</Text>
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 3,
          justifyContent: 'center',
          backgroundColor: value ? theme.primary : theme.raised,
          borderWidth: 1,
          borderColor: value ? theme.primary : theme.rule,
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: value ? theme.onPrimary : theme.muted,
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
          }}
        />
      </View>
    </Pressable>
  );
}

/** + / − counter for passengers, luggage, child seats. */
export function Stepper({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const step = (d: -1 | 1) => {
    const off = d < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${d < 0 ? '-' : '+'}`}
        disabled={off}
        onPress={() => onChange(Math.min(max, Math.max(min, value + d)))}
        style={(state) => {
          const { pressed, hovered, focused } = state as PressState;
          return [
            {
              width: 40,
              height: 40,
              borderRadius: 3,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: !off && hovered ? shades.borderHover : theme.rule,
              backgroundColor: pressed ? theme.rule : theme.surface,
              opacity: off ? 0.35 : 1,
            },
            focusRing(!!focused, theme.primary),
          ];
        }}
      >
        <Icon name={d < 0 ? 'minus' : 'plus'} size={17} color={theme.primary} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 12 }}>
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: theme.text }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {step(-1)}
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: theme.text, minWidth: 36, textAlign: 'center', ...tabular }}>
          {value}
        </Text>
        {step(1)}
      </View>
    </View>
  );
}
