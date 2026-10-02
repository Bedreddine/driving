import { useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { AnimatedQrCard } from '@/components/AnimatedQrCard';
import { qrCardContent } from '@/components/QrCardPanel';
import { Button, colors, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { type BusinessInfo, getBusiness, siteUrl } from '@/lib/publicApi';

/** Shown to a client in person: the animated card draws itself, then the QR stays still to be scanned. */
export default function DriverQr() {
  const { t } = useAuth();
  const { width } = useWindowDimensions();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [play, setPlay] = useState(0);

  useEffect(() => {
    void getBusiness()
      .then(setBusiness)
      .catch(() => undefined);
  }, []);

  if (!business) return <Muted style={{ padding: 20 }}>…</Muted>;
  const url = `${siteUrl(business) ?? ''}/book`;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16, backgroundColor: colors.bg }}>
      <AnimatedQrCard content={qrCardContent(business, url, t)} width={Math.min(width - 40, 420)} play={play} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button kind="secondary" size="sm" icon="rotate-ccw" title={t('replay')} onPress={() => setPlay((p) => p + 1)} />
      </View>
    </ScrollView>
  );
}
