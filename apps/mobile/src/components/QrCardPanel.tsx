import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import type { TextKey } from '@/lib/i18n';
import type { BusinessInfo } from '@/lib/publicApi';
import { exportQrGif } from '@/lib/qrGif';
import { AnimatedQrCard, type QrCardContent } from './AnimatedQrCard';
import { Button, Card, CardTitle, ErrorText, Row } from './ui';
import { coverPhoto, photoSrc, vehicleLine } from './Vehicle';

/** What the card shows: brand, the booking link, the driver's name, the car and its first outside photo. */
export function qrCardContent(b: BusinessInfo, url: string, t: (k: TextKey) => string): QrCardContent {
  const cover = coverPhoto(b.vehicle);
  return {
    url,
    brand: b.name,
    driverName: b.driver_name,
    vehicleLine: vehicleLine(b.vehicle, b.car),
    category: b.vehicle?.category ? t(`cat_${b.vehicle.category}` as TextKey) : null,
    photoUrl: cover ? photoSrc(cover) : null,
    scanHint: t('scanToBook'),
  };
}

/** Back office: the animated QR card, replay, and the GIF to share. */
export function QrCardPanel({ business, url }: { business: BusinessInfo; url: string }) {
  const { t, err } = useAuth();
  const [play, setPlay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = qrCardContent(business, url, t);

  const download = async () => {
    if (!exportQrGif) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await exportQrGif(content);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qr-card.gif';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ alignSelf: 'stretch' }}>
        <CardTitle icon="film" help={t('qrAnimatedHelp')}>
          {t('qrAnimated')}
        </CardTitle>
      </View>
      <AnimatedQrCard content={content} width={300} play={play} />
      <Row style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button kind="secondary" size="sm" icon="rotate-ccw" title={t('replay')} onPress={() => setPlay((p) => p + 1)} />
        {Platform.OS === 'web' && exportQrGif ? (
          <Button kind="secondary" size="sm" icon="download" title={busy ? t('preparingGif') : t('downloadGif')} loading={busy} onPress={download} />
        ) : null}
      </Row>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
