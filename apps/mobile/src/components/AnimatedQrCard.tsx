import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { useReducedMotion } from '@/lib/motion';
import { AMBER, buildQrReveal, FINDER_OUTLINE_LENGTH, finderOutlinePath, IVORY, QR_REVEAL_MS, QUIET, revealFrame } from '@/lib/qrReveal';
import { fonts, night, radius } from '@/lib/theme';

export type QrCardContent = {
  url: string;
  brand: string;
  driverName?: string | null;
  /** "Mercedes Classe E · Noir obsidienne" */
  vehicleLine?: string | null;
  /** "Berline", "Van"… */
  category?: string | null;
  /** Absolute URL of an outside photo of the car, shown at the top of the card. */
  photoUrl?: string | null;
  scanHint: string;
};

/**
 * The business card as a living image ("the city lights up", DESIGN.md › Motion): the three finder squares lock on
 * in amber, the rest of the code switches on from the centre outward like city lights, then everything cools to
 * asphalt and holds still (and stays scannable: asphalt on ivory). `play` changes to replay it.
 */
export function AnimatedQrCard({ content, width = 320, play = 0 }: { content: QrCardContent; width?: number; play?: number }) {
  const qrSide = width - 56;
  const coverHeight = content.photoUrl ? Math.round(width * 0.46) : 0;

  return (
    <View style={{ width, backgroundColor: night.paper, borderRadius: radius.card, borderWidth: 1, borderColor: night.rule, overflow: 'hidden' }}>
      {content.photoUrl ? (
        <View style={{ height: coverHeight }}>
          <Image source={{ uri: content.photoUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <LinearGradient colors={['rgba(13,15,18,0)', 'rgba(13,15,18,0.55)', night.paper]} locations={[0.35, 0.7, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 28, paddingTop: content.photoUrl ? 0 : 26, marginTop: content.photoUrl ? -30 : 0 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: night.text }}>{content.brand}</Text>
      </View>
      <View style={{ margin: 28, marginTop: 16, marginBottom: 18 }}>
        <QrReveal url={content.url} side={qrSide} play={play} />
      </View>
      <View style={{ paddingHorizontal: 28, paddingBottom: 26, gap: 4 }}>
        {content.driverName ? <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: night.text }}>{content.driverName}</Text> : null}
        {content.vehicleLine ? (
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, letterSpacing: 0.4, color: night.muted }}>{content.vehicleLine.toUpperCase()}</Text>
        ) : null}
        {content.category ? <Text style={{ fontFamily: fonts.body, fontSize: 13.5, color: night.muted }}>{content.category}</Text> : null}
        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: night.primary, marginTop: 8, letterSpacing: 0.3 }}>{content.scanHint}</Text>
      </View>
    </View>
  );
}

/**
 * The QR code itself. Its own component, so only it re-renders per frame: ~14 ring paths and 3 finders,
 * whose geometry is built once per URL; a frame only changes their opacity, scale and colour.
 */
function QrReveal({ url, side, play }: { url: string; side: number; play: number }) {
  const reduced = useReducedMotion();
  const { size, finders, rings } = useMemo(() => buildQrReveal(url), [url]);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return; // the final frame is shown below
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / QR_REVEAL_MS);
      setT(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, reduced, url]);

  const f = revealFrame(reduced ? 1 : t, rings.length);
  const view = size + QUIET * 2;
  const mid = size / 2;
  const outline = f.finderOutline * FINDER_OUTLINE_LENGTH;

  return (
    <View style={{ width: side, height: side, backgroundColor: IVORY, borderRadius: radius.control }}>
      <Svg width={side} height={side} viewBox={`${-QUIET} ${-QUIET} ${view} ${view}`} accessibilityLabel={url}>
        {rings.map((ring, i) => {
          const r = f.rings[i];
          if (r.opacity <= 0) return null;
          const shift = mid * (1 - r.scale);
          return <Path key={i} d={ring.d} fill={r.color} opacity={r.opacity} transform={`matrix(${r.scale} 0 0 ${r.scale} ${shift} ${shift})`} />;
        })}
        {finders.map(({ x, y }) => (
          <G key={`${x}-${y}`}>
            {outline > 0 ? (
              <Path
                d={finderOutlinePath(x, y)}
                fill="none"
                stroke={f.finderColor}
                strokeWidth={1}
                strokeLinecap="square"
                strokeDasharray={f.finderOutline < 1 ? [outline, FINDER_OUTLINE_LENGTH] : undefined}
              />
            ) : null}
            {f.finderCentre > 0 ? (
              <Rect
                x={x + 3.5 - 1.5 * f.finderCentre}
                y={y + 3.5 - 1.5 * f.finderCentre}
                width={3 * f.finderCentre}
                height={3 * f.finderCentre}
                fill={f.finderColor}
              />
            ) : null}
          </G>
        ))}
      </Svg>
      {f.flash > 0 ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: radius.control, borderWidth: 2, borderColor: AMBER, opacity: f.flash }}
        />
      ) : null}
    </View>
  );
}
