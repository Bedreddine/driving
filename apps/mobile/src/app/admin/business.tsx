import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Label, Muted, Notice, Row, serif, styles, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/http';
import { type BusinessInfo, getBusiness, siteUrl } from '@/lib/publicApi';

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0E0E10', light: '#FFFFFF' } };

/** Business name and contact shown to clients, and the QR code to print on business cards. */
export default function AdminBusiness() {
  const { t, err } = useAuth();
  const [form, setForm] = useState<BusinessInfo | null>(null);
  const [saved, setSaved] = useState<BusinessInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void getBusiness().then((b) => {
      setForm(b);
      setSaved(b);
    });
  }, []);

  // The QR code always points to the booking page of the saved website address.
  const bookingUrl = saved ? `${siteUrl(saved) ?? ''}/book` : null;
  useEffect(() => {
    if (!bookingUrl) return;
    void QRCode.toDataURL(bookingUrl, { ...QR_OPTIONS, width: 360 }).then(setQr);
  }, [bookingUrl]);

  const set = (k: keyof BusinessInfo) => (v: string) => {
    setDone(false);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  const save = async () => {
    if (!form) return;
    try {
      const b = await api.put<BusinessInfo>('/api/admin/business', form);
      setForm(b);
      setSaved(b);
      setError(null);
      setDone(true);
    } catch (e) {
      setError(err((e as Error).message));
    }
  };

  /** High-resolution PNG for printing (business cards are printed at 300 dpi or more). */
  const download = async () => {
    if (!bookingUrl || Platform.OS !== 'web') return;
    const png = await QRCode.toDataURL(bookingUrl, { ...QR_OPTIONS, width: 1200 });
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-${(saved?.name ?? 'booking').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    a.click();
  };

  if (!form) return <Muted style={{ padding: 20 }}>…</Muted>;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 900 }}>
      <Title>{t('business')}</Title>
      <Row style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Card style={{ flex: 1, minWidth: 320 }}>
          <Field label={t('businessName')} value={form.name} onChangeText={set('name')} />
          <Field label={t('taglineFr')} value={form.tagline_fr} onChangeText={set('tagline_fr')} />
          <Field label={t('taglineEn')} value={form.tagline_en} onChangeText={set('tagline_en')} />
          <Field label={t('phone')} value={form.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" />
          <Field label={t('email')} value={form.email ?? ''} onChangeText={set('email')} autoCapitalize="none" />
          <Field label={t('siteUrl')} value={form.site_url ?? ''} onChangeText={set('site_url')} autoCapitalize="none" placeholder="https://" />
          <Muted>{t('siteUrlHelp')}</Muted>
          <Field label={t('appStoreUrl')} value={form.app_store_url ?? ''} onChangeText={set('app_store_url')} autoCapitalize="none" placeholder="https://apps.apple.com/..." />
          <Field label={t('playStoreUrl')} value={form.play_store_url ?? ''} onChangeText={set('play_store_url')} autoCapitalize="none" placeholder="https://play.google.com/..." />
          <ErrorText>{error}</ErrorText>
          {done ? <Notice tone="success">{t('saved')}</Notice> : null}
          <Button title={t('save')} onPress={save} />
        </Card>

        <Card style={{ width: 340, alignItems: 'center' }}>
          <Label>{t('qrCode')}</Label>
          <View style={{ backgroundColor: '#0E0E10', padding: 16, borderRadius: 12, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: serif, color: '#C8A96A', fontSize: 20 }}>{saved?.name}</Text>
            {qr ? <Image source={{ uri: qr }} style={{ width: 240, height: 240 }} accessibilityLabel={bookingUrl ?? ''} /> : null}
          </View>
          <Text style={[styles.muted, { textAlign: 'center' }]} selectable>
            {bookingUrl}
          </Text>
          <Muted style={{ textAlign: 'center' }}>{t('qrHelp')}</Muted>
          {!saved?.site_url ? <Notice tone="warning">{t('qrTemporary')}</Notice> : null}
          {Platform.OS === 'web' ? <Button kind="secondary" title={t('downloadQr')} onPress={download} /> : null}
        </Card>
      </Row>
    </ScrollView>
  );
}
