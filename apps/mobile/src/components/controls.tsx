// Buttons, text fields, switches and counters of "Nuit Blanche" (DESIGN.md › Components).
// Every control: a visible edge, at least 44px to touch, a spring press, a haptic tick on phones, an amber focus ring.
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
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
  primaryHover: '#F2B254',
  primaryPressed: '#D8922F',
  amberTint: 'rgba(233,162,59,0.14)',
  dangerTint: 'rgba(229,115,95,0.10)',
  dangerTintHover: 'rgba(229,115,95,0.18)',
};

/** Keyboard focus ring on the website: a 2px amber outline, offset from the control. */
const focusRing = (on: boolean, color: string) =>
  Platform.OS === 'web'
    ? ({ outlineStyle: on ? 'solid' : 'none', outlineWidth: 2, outlineColor: color, outlineOffset: 3 } as unknown as ViewStyle)
    : null;

export type PressState = { pressed: boolean; hovered: boolean; focused: boolean };
type Haptic = 'impact' | 'select' | 'none';

/** A light tap felt in the hand (phones only). */
export function tick(kind: Haptic) {
  if (Platform.OS === 'web' || kind === 'none') return;
  void (kind === 'impact' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.selectionAsync()).catch(() => undefined);
}

/**
 * The shared press behaviour: shrinks a little while held and springs back (no overshoot),
 * ticks on phones, ripples on Android, shows the amber focus ring for keyboards.
 * `style` and `children` may depend on the press, hover and focus state.
 */
export function Touchable({
  style,
  children,
  haptic = 'select',
  pressScale = 0.96,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((s: PressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((s: PressState) => ReactNode);
  haptic?: Haptic;
  pressScale?: number;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const springTo = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: nativeDriver, speed: 50, bounciness: 0 }).start();
  return (
    <Pressable
      disabled={disabled}
      android_ripple={{ color: 'rgba(238,233,224,0.12)', borderless: false }}
      onPressIn={(e) => {
        if (!reduced) springTo(pressScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        tick(haptic);
        onPress?.(e);
      }}
      {...props}
    >
      {(raw) => {
        const s = { pressed: raw.pressed, hovered: !!(raw as { hovered?: boolean }).hovered, focused: !!(raw as { focused?: boolean }).focused };
        return (
          <Animated.View
            style={[typeof style === 'function' ? style(s) : style, { transform: [{ scale }] }, focusRing(s.focused && !disabled, theme.primary)]}
          >
            {typeof children === 'function' ? children(s) : children}
          </Animated.View>
        );
      }}
    </Pressable>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  /** primary: the one main action. secondary: other actions. danger: refusals and cancellations. ghost: a quiet text action. */
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'lg' | 'md' | 'sm';
  /** Icon before the label. */
  icon?: IconName;
  /** Shown at the right end: a price ("95,00 €") or an arrow; the label then sits on the left. */
  trailing?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const SIZES = {
  lg: { height: 60, padX: 20, font: 17.5, icon: 20, gap: 12 },
  md: { height: 54, padX: 18, font: 16.5, icon: 19, gap: 10 },
  sm: { height: 44, padX: 14, font: 15, icon: 17, gap: 8 },
};

export function Button({ title, onPress, kind = 'primary', size = 'md', icon, trailing, disabled, loading, style, accessibilityLabel }: ButtonProps) {
  const theme = useTheme();
  const solid = kind === 'primary';
  const fg = solid ? theme.onPrimary : kind === 'danger' ? theme.error : kind === 'ghost' ? theme.primary : theme.text;
  const inactive = !!(disabled || loading);
  const z = SIZES[size];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      haptic={solid ? 'impact' : 'select'}
      pressScale={size === 'sm' ? 0.95 : 0.97}
      style={({ pressed, hovered }) => {
        const live = !inactive;
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: trailing ? 'space-between' : 'center',
            gap: z.gap,
            minHeight: z.height,
            paddingHorizontal: z.padX,
            borderRadius: 3,
            overflow: 'hidden',
          },
          solid
            ? { backgroundColor: live && pressed ? shades.primaryPressed : live && hovered ? shades.primaryHover : theme.primary }
            : kind === 'ghost'
              ? { backgroundColor: live && (hovered || pressed) ? theme.control : 'transparent' }
              : kind === 'danger'
                ? { borderWidth: 1.5, borderColor: theme.error, backgroundColor: live && (hovered || pressed) ? shades.dangerTintHover : shades.dangerTint }
                : {
                    borderWidth: 1.5,
                    borderColor: live && (hovered || pressed) ? theme.text : theme.edge,
                    backgroundColor: live && pressed ? theme.edge : live && hovered ? theme.controlHover : theme.control,
                  },
          { opacity: disabled ? 0.4 : 1 },
          style,
        ];
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: z.gap, flexShrink: 1 }}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={z.icon} color={fg} /> : null}
        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: z.font, letterSpacing: 0.15, color: fg, opacity: loading ? 0.75 : 1, flexShrink: 1 }}>
          {title}
        </Text>
      </View>
      {typeof trailing === 'string' ? (
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: z.font - 1, color: fg, ...tabular }}>{trailing}</Text>
      ) : (
        trailing ?? null
      )}
    </Touchable>
  );
}

/** The arrow at the end of a call to action ("Où allons-nous ?  →"). */
export function ArrowRight({ color }: { color?: string }) {
  const theme = useTheme();
  return <Icon name="arrow-right" size={20} color={color ?? theme.onPrimary} />;
}

/**
 * The frame of a text field: a filled box with a visible edge, whose label rests inside like a placeholder
 * and floats up when the field is focused or filled; thick amber edge on focus, coral and a short shake on error.
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
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(up, { toValue: floated ? 1 : 0, duration: reduced ? 0 : durations.focus, easing: ease, useNativeDriver: nativeDriver }).start();
  }, [up, floated, reduced]);
  // A new error: the box shakes once, so the eye finds it.
  const hadError = useRef(!!error);
  useEffect(() => {
    if (error && !hadError.current && !reduced) {
      tick('impact');
      Animated.sequence(
        [7, -7, 5, -3, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: nativeDriver })),
      ).start();
    }
    hadError.current = !!error;
  }, [error, shake, reduced]);

  const left = icon ? 48 : 16;
  const thick = focused || !!error;
  return (
    <Animated.View style={{ marginVertical: 7, transform: [{ translateX: shake }] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: multiline ? 112 : 64,
          backgroundColor: focused ? theme.controlHover : theme.control,
          borderWidth: thick ? 2 : 1.5,
          // Same outer size whichever border: no jump on focus.
          margin: thick ? 0 : 0.5,
          borderColor: error ? theme.error : focused ? theme.primary : theme.edge,
          borderRadius: 3,
        }}
      >
        {icon ? (
          <View style={{ position: 'absolute', left: 15, top: multiline ? 22 : 0, bottom: multiline ? undefined : 0, justifyContent: 'center' }}>
            <Icon name={icon} size={20} color={error ? theme.error : focused ? theme.primary : theme.label} />
          </View>
        ) : null}
        <Animated.Text
          pointerEvents="none"
          numberOfLines={1}
          style={{
            position: 'absolute',
            left,
            right: right ? 48 : 14,
            top: 20,
            fontFamily: fonts.medium,
            fontSize: 17,
            lineHeight: 22,
            color: error ? theme.error : focused ? theme.primary : theme.label,
            transformOrigin: 'left',
            transform: [
              { translateY: up.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
              { scale: up.interpolate({ inputRange: [0, 1], outputRange: [1, 0.74] }) },
            ],
          }}
        >
          {label}
        </Animated.Text>
        <View style={{ flex: 1, paddingLeft: left, paddingRight: right ? 4 : 16 }}>{children}</View>
        {right ? <View style={{ paddingRight: 8, alignSelf: multiline ? 'flex-start' : 'center', paddingTop: multiline ? 14 : 0 }}>{right}</View> : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 }}>
          <Icon name="alert-circle" size={16} color={theme.error} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.error, flexShrink: 1 }}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: theme.label, marginTop: 7 }}>{hint}</Text>
      ) : null}
    </Animated.View>
  );
}

/** Round "×" that empties a field. */
export function ClearButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      pressScale={0.88}
      style={({ pressed, hovered }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.edge : hovered ? theme.controlHover : 'transparent',
      })}
    >
      <Icon name="x" size={18} color={theme.label} />
    </Touchable>
  );
}

/** The text inside a FieldShell. */
export const fieldInputStyle = (color: string, mono?: boolean, multiline?: boolean) => ({
  paddingTop: multiline ? 32 : 26,
  paddingBottom: 9,
  minHeight: multiline ? 108 : 62,
  fontFamily: mono ? fonts.mono : fonts.body,
  fontSize: 17,
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
  const canClear = clearable && filled && !multiline && editable !== false && !!onChangeText;
  return (
    <FieldShell
      label={label}
      floated={focused || filled}
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
        selectionColor={theme.primary}
        cursorColor={theme.primary}
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

/** On/off switch: amber track and a check in the thumb when on; the thumb slides across. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: reduced ? 0 : 200, easing: ease, useNativeDriver: nativeDriver }).start();
  }, [x, value, reduced]);
  return (
    <Touchable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      pressScale={0.99}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 56,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 3,
        backgroundColor: hovered ? theme.control : 'transparent',
      })}
    >
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16.5, lineHeight: 23, color: theme.text }}>{label}</Text>
      <View
        style={{
          width: 54,
          height: 32,
          borderRadius: 16,
          padding: 3,
          justifyContent: 'center',
          backgroundColor: value ? theme.primary : theme.control,
          borderWidth: 1.5,
          borderColor: value ? theme.primary : theme.edge,
        }}
      >
        <Animated.View
          style={{
            width: 23,
            height: 23,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value ? theme.onPrimary : theme.label,
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }],
          }}
        >
          {value ? <Icon name="check" size={14} color={theme.primary} /> : null}
        </Animated.View>
      </View>
    </Touchable>
  );
}

/** + / − counter for passengers, luggage, child seats. */
export function Stepper({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const step = (d: -1 | 1) => {
    const off = d < 0 ? value <= min : value >= max;
    return (
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${d < 0 ? '-' : '+'}`}
        disabled={off}
        onPress={() => onChange(Math.min(max, Math.max(min, value + d)))}
        pressScale={0.9}
        style={({ pressed, hovered }) => ({
          width: 48,
          height: 48,
          borderRadius: 3,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: !off && (hovered || pressed) ? theme.primary : theme.edge,
          backgroundColor: pressed ? theme.edge : theme.control,
          opacity: off ? 0.35 : 1,
        })}
      >
        <Icon name={d < 0 ? 'minus' : 'plus'} size={20} color={theme.primary} />
      </Touchable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, gap: 12 }}>
      <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16.5, lineHeight: 23, color: theme.text }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {step(-1)}
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.monoMedium, fontSize: 19, color: theme.text, minWidth: 40, textAlign: 'center', ...tabular }}>
          {value}
        </Text>
        {step(1)}
      </View>
    </View>
  );
}

/** Selected look shared by chips and segmented choices. */
export const choiceColors = (theme: ReturnType<typeof useTheme>, on: boolean, active: boolean) => ({
  borderColor: on ? theme.primary : active ? theme.text : theme.edge,
  backgroundColor: on ? shades.amberTint : active ? theme.controlHover : theme.control,
  color: on ? theme.primary : theme.text,
});
