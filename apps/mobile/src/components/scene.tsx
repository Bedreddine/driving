// The pieces of "Nuit Blanche" (DESIGN.md): rise-in, titles, count-up price, place rows, chips,
// the « À bord » menu, timeline and stars.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { durations, ease, nativeDriver, useReducedMotion } from '@/lib/motion';
import { fonts, tabular, useTheme, radius } from '@/lib/theme';
import { choiceColors, Icon, Touchable, type IconName } from './controls';

/** Content arriving on screen: fades in while rising 12px, one block after the other (`index`). */
export function Rise({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: reduced ? durations.reduced : durations.rise,
      delay: reduced ? 0 : index * durations.stagger,
      easing: ease,
      useNativeDriver: nativeDriver,
    }).start();
  }, [v, index, reduced]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 12, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Poster title in Instrument Serif ("Paris ce soir, à votre heure."). */
export function Display({ children, size = 46, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.04, letterSpacing: -0.4, color: theme.text }, style]}>
      {children}
    </Text>
  );
}

/** Small uppercase mono line: route ("RITZ → CDG 2E"), labels, coordinates. */
export function MonoLine({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text style={[{ fontFamily: fonts.monoMedium, fontSize: 12.5, lineHeight: 19, letterSpacing: 0.5, color: muted ? theme.muted : theme.text, ...tabular }, style]}>
      {children}
    </Text>
  );
}

/** The price, counting up from zero when it appears (shown at once with reduce motion). */
export function CountUp({ value, format, size = 54 }: { value: number; format: (n: number) => string; size?: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [count, setCount] = useState<{ of: number; shown: number } | null>(null);
  useEffect(() => {
    if (reduced) return;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 700);
      setCount({ of: value, shown: Math.round(value * (1 - Math.pow(1 - p, 3))) });
      if (p >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [value, reduced]);
  const shown = reduced ? value : count?.of === value ? count.shown : 0;
  return (
    <Text
      accessibilityLabel={format(value)}
      style={{ fontFamily: fonts.mono, fontSize: size, lineHeight: size * 1.05, letterSpacing: -size * 0.03, color: theme.text, ...tabular }}
    >
      {format(shown)}
    </Text>
  );
}

/** One suggested place or search result: icon, name and detail, distance in mono on the right. */
export function PlaceRow({ title, detail, distance, icon, onPress }: { title: string; detail?: string; distance?: string; icon?: IconName; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      onPress={onPress}
      pressScale={0.985}
      style={({ pressed, hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 64,
        paddingVertical: 10,
        paddingHorizontal: 10,
        marginHorizontal: -10,
        borderRadius: radius.control,
        borderBottomWidth: 1,
        borderBottomColor: theme.rule,
        backgroundColor: pressed ? theme.controlHover : hovered ? theme.control : 'transparent',
      })}
    >
      {({ pressed, hovered }) => (
        <>
          {icon ? (
            <View style={{ width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1.5, borderColor: pressed || hovered ? theme.primary : theme.edge, backgroundColor: theme.control, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={19} color={pressed || hovered ? theme.primary : theme.text} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16.5, lineHeight: 22, color: theme.text }}>{title}</Text>
            {detail ? <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: theme.label }}>{detail}</Text> : null}
          </View>
          {distance ? (
            <Text style={{ fontFamily: fonts.mono, fontSize: 13.5, color: pressed || hovered ? theme.primary : theme.label, ...tabular }}>{distance}</Text>
          ) : null}
          <Icon name="chevron-right" size={18} color={pressed || hovered ? theme.primary : theme.edge} />
        </>
      )}
    </Touchable>
  );
}

/** A small choice (time, option). Selected: amber edge, tint and a check. */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      pressScale={0.95}
      style={({ pressed, hovered }) => {
        const c = choiceColors(theme, !!selected, pressed || hovered);
        return { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.borderColor, backgroundColor: c.backgroundColor };
      }}
    >
      {selected ? <Icon name="check" size={16} color={theme.primary} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: selected ? theme.primary : theme.text }}>{label}</Text>
    </Touchable>
  );
}

/** Tabs as words with a thick amber underline (Airports · Stations · Palaces). */
export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            pressScale={0.96}
            style={({ hovered }) => ({ minHeight: 46, justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 3, borderBottomColor: on ? theme.primary : hovered ? theme.edge : 'transparent', marginBottom: -1 })}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, color: on ? theme.text : theme.label }}>{o.label}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** The breathing amber dot next to the driver's name. */
export function LiveDot() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.55, duration: 1200, useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 1, duration: 1200, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, reduced]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, opacity: v, transform: [{ scale: v }] }} />;
}

export type MenuItem = { label: string; detail?: string | null };

/** « À bord »: what the driver offers in the car, written like a restaurant menu. */
export function AboardMenu({ items }: { items: MenuItem[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14.5, color: theme.text, flexShrink: 1 }}>{it.label}</Text>
          {it.detail ? <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: theme.muted, textAlign: 'right', flexShrink: 1 }}>{it.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export type TimelineStep = { title: string; detail?: string };

/** Vertical status timeline: reached steps fill in amber, and the line fills down to the last one. */
export function Timeline({ steps, reached }: { steps: TimelineStep[]; reached: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [tops, setTops] = useState<number[]>([]);
  const [fill] = useState(() => new Animated.Value(0));
  const target = tops[reached] ?? 0;
  useEffect(() => {
    Animated.timing(fill, {
      toValue: target,
      duration: reduced ? durations.reduced : durations.timeline * Math.max(1, reached),
      easing: ease,
      useNativeDriver: false, // height cannot run on the native driver
    }).start();
  }, [fill, target, reached, reduced]);
  const onStepLayout = (i: number) => (e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y;
    setTops((prev) => (prev[i] === y ? prev : Object.assign([...prev], { [i]: y })));
  };
  return (
    <View style={{ paddingLeft: 26, marginLeft: 6, marginVertical: 6 }}>
      <View style={{ position: 'absolute', left: 5, top: 8, bottom: 14, width: 2, backgroundColor: theme.rule }} />
      <Animated.View style={{ position: 'absolute', left: 5, top: 8, width: 2, height: fill, backgroundColor: theme.primary }} />
      {steps.map((s, i) => {
        const on = i <= reached;
        return (
          <View key={i} onLayout={onStepLayout(i)} style={{ marginBottom: i === steps.length - 1 ? 0 : 16 }}>
            <View
              style={{
                position: 'absolute',
                left: -27,
                top: 5,
                width: 14,
                height: 14,
                borderRadius: 7,
                borderWidth: 2,
                borderColor: on ? theme.primary : theme.rule,
                backgroundColor: on ? theme.primary : theme.paper,
              }}
            />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 23, color: on ? theme.text : theme.muted }}>{s.title}</Text>
            {s.detail ? <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{s.detail}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Five square buttons; the chosen ones fill in amber. */
export function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <Touchable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${n} / 5`}
            accessibilityState={{ checked: n === value }}
            onPress={() => onChange(n)}
            pressScale={0.88}
            style={({ hovered }) => ({
              width: 52,
              height: 52,
              borderRadius: radius.control,
              borderWidth: 1.5,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: on ? theme.primary : hovered ? theme.text : theme.edge,
              backgroundColor: on ? theme.primary : theme.control,
            })}
          >
            <Text style={{ fontSize: 22, color: on ? theme.onPrimary : theme.label }}>★</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** Small read-only stars. */
export function Stars({ value }: { value: number }) {
  const theme = useTheme();
  return (
    <Text accessibilityLabel={`${value} / 5`} style={{ color: theme.primary, letterSpacing: 2, fontSize: 14 }}>
      {'★'.repeat(value)}
      <Text style={{ color: theme.rule }}>{'★'.repeat(5 - value)}</Text>
    </Text>
  );
}

/** A numbered step of a form, on its own panel, so each part reads as one block (DESIGN.md › Layout). */
export function Section({ n, title, children, right }: { n: number; title: string; children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.rule, borderRadius: radius.card, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1, borderColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: theme.primary }}>{n}</Text>
        </View>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.2, color: theme.text }}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export type PriceDetailLine = { label: string; detail?: string; amount: string };

/** How the price is made, one line per part, the total underneath. */
export function PriceDetail({ lines, total }: { lines: PriceDetailLine[]; total: string }) {
  const theme = useTheme();
  return (
    <View>
      {lines.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.rule }}>
          <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, color: theme.text }}>
            {l.label}
            {l.detail ? <Text style={{ color: theme.muted }}>{`  ${l.detail}`}</Text> : null}
          </Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 13.5, color: theme.text, ...tabular }}>{l.amount}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 }}>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: theme.text, ...tabular }}>{total}</Text>
      </View>
    </View>
  );
}
