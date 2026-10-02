import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useReducedMotion } from '@/lib/motion';
import { lineProgress, QR_ANIMATION_MS, qrLines } from '@/lib/qrLines';
import { fonts, night } from '@/lib/theme';

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

const IVORY = '#EEE9E0';
const QUIET = 3;

/**
 * The business card as a living image: the QR code draws itself line by line, an amber scan line sweeps down,
 * then it holds still (and stays scannable: asphalt on ivory). `play` changes to replay it.
 */
export function AnimatedQrCard({ content, width = 320, play = 0 }: { content: QrCardContent; width?: number; play?: number }) {
  const reduced = useReducedMotion();
  const { size, lines } = useMemo(() => qrLines(content.url), [content.url]);
  const [t, setT] = useState(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / QR_ANIMATION_MS);
      setT(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, reduced, content.url]);

  const shown = reduced ? 1 : t;
  const qrSide = width - 56;
  const coverHeight = content.photoUrl ? Math.round(width * 0.46) : 0;
  const view = size + QUIET * 2;

  return (
    <View style={{ width, backgroundColor: night.paper, borderRadius: 14, borderWidth: 1, borderColor: night.rule, overflow: 'hidden' }}>
      {content.photoUrl ? (
        <View style={{ height: coverHeight }}>
          <Image source={{ uri: content.photoUrl }} accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <LinearGradient colors={['rgba(13,15,18,0)', 'rgba(13,15,18,0.55)', night.paper]} locations={[0.35, 0.7, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 28, paddingTop: content.photoUrl ? 0 : 26, marginTop: content.photoUrl ? -30 : 0 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: night.text }}>{content.brand}</Text>
      </View>
      <View style={{ margin: 28, marginTop: 16, marginBottom: 18, width: qrSide, height: qrSide, backgroundColor: IVORY, borderRadius: 3 }}>
        <Svg width={qrSide} height={qrSide} viewBox={`${-QUIET} ${-QUIET} ${view} ${view}`} accessibilityLabel={content.url}>
          {lines.map((l, i) => {
            const p = lineProgress(l.row, size, shown);
            if (p <= 0) return null;
            const x = l.x - (1 - p) * (l.x + l.length + QUIET);
            return <Rect key={i} x={x} y={l.row} width={l.length + 0.04} height={1.04} fill={night.paper} />;
          })}
          {shown < 1 ? <Rect x={-QUIET} y={shown * size - 0.3} width={view} height={0.6} fill={night.primary} opacity={1 - shown * 0.6} /> : null}
        </Svg>
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
