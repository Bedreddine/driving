import * as ImagePicker from 'expo-image-picker';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { QrCardPanel } from '@/components/QrCardPanel';
import { Chip } from '@/components/scene';
import { emptyVehicle, VehicleEditor } from '@/components/VehicleEditor';
import { Button, Card, CardTitle, colors, ErrorText, Field, fonts, Label, Muted, Notice, Row, styles, Title } from '@/components/ui';
import { AMENITY_IDEAS } from '@/lib/amenities';
import { useAuth } from '@/lib/auth';
import { api, apiUrl } from '@/lib/http';
import { type Amenity, type BusinessInfo, getBusiness, siteUrl } from '@/lib/publicApi';

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0D0F12', light: '#EEE9E0' } };
const MAX_AMENITIES = 20;

/** Business name and contact, how clients see the driver (name, car, photo, « À bord »), and the QR code for business cards. */
export default function AdminBusiness() {
  const { t, err, lang } = useAuth();
  const [form, setForm] = useState<BusinessInfo | null>(null);
  const [saved, setSaved] = useState<BusinessInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reload = () =>
    getBusiness().then((b) => {
      setForm(b);
      setSaved(b);
    });
  useEffect(() => {
    void reload();
  }, []);

  // The QR code always points to the booking page of the saved website address.
  const bookingUrl = saved ? `${siteUrl(saved) ?? ''}/book` : null;
  useEffect(() => {
    // The QR library draws on a browser canvas: the back office is used on the website (on a phone, the link shows).
    if (!bookingUrl || Platform.OS !== 'web') return;
    void QRCode.toDataURL(bookingUrl, { ...QR_OPTIONS, width: 360 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [bookingUrl]);

  const set = (k: keyof BusinessInfo) => (v: string) => {
    setDone(false);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };
  const setAmenities = (fn: (list: Amenity[]) => Amenity[]) => {
    setDone(false);
    setForm((f) => (f ? { ...f, amenities: fn(f.amenities) } : f));
  };
  const setAmenity = (i: number, k: keyof Amenity) => (v: string) =>
    setAmenities((list) => list.map((a, j) => (j === i ? { ...a, [k]: v } : a)));

  const save = async () => {
    if (!form) return;
    if (form.amenities.some((a) => !a.label_fr.trim() || !a.label_en.trim())) {
      setError(t('amenityLabelRequired'));
      return;
    }
    try {
      // Photos are managed one by one; the car's details travel with the rest of the page.
      const { photos: _photos, ...vehicle } = form.vehicle ?? emptyVehicle;
      const b = await api.put<BusinessInfo>('/api/admin/business', { ...form, vehicle });
      setForm(b);
      setSaved(b);
      setError(null);
      setDone(true);
    } catch (e) {
      setError(err((e as Error).message));
    }
  };

  const choosePhoto = async () => {
    setPhotoError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setPhotoBusy(true);
    try {
      const data = new FormData();
      const name = asset.fileName ?? 'photo.jpg';
      if (Platform.OS === 'web') data.append('file', asset.file ?? (await (await fetch(asset.uri)).blob()), name);
      // React Native sends a local file from its uri.
      else data.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      await api.upload('/api/admin/business/photo', data);
      await reload();
    } catch (e) {
      setPhotoError(err((e as Error).message));
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await api.del('/api/admin/business/photo');
      await reload();
    } catch (e) {
      setPhotoError(err((e as Error).message));
    } finally {
      setPhotoBusy(false);
    }
  };

  // After a photo change: refresh the photos only, keeping what is being typed.
  const reloadPhotos = () =>
    getBusiness().then((b) => {
      setSaved(b);
      setForm((f) => (f ? { ...f, photo_url: b.photo_url, vehicle: { ...(f.vehicle ?? emptyVehicle), photos: b.vehicle?.photos ?? [] } } : f));
    });

  /** High-resolution PNG for printing (business cards are printed at 300 dpi or more). */
  const download = async () => {
    if (!bookingUrl || Platform.OS !== 'web') return;
    const png = await QRCode.toDataURL(bookingUrl, { ...QR_OPTIONS, width: 1200 });
    const a = document.createElement('a');
    a.href = png;
    const slug = (saved?.name ?? 'booking').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `qr-${slug.replace(/^-|-$/g, '')}.png`;
    a.click();
  };

  if (!form) return <Muted style={{ padding: 20 }}>…</Muted>;

  const ideas = AMENITY_IDEAS.filter((idea) => !form.amenities.some((a) => a.label_fr === idea.label_fr));
  const textLink = { fontFamily: fonts.medium, fontSize: 13, color: colors.muted };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 960 }}>
      <Title>{t('business')}</Title>
      <Row style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 320, gap: 16 }}>
          <Card>
            <CardTitle icon="briefcase">{t('business')}</CardTitle>
            <Field label={t('businessName')} value={form.name} onChangeText={set('name')} />
            <Field label={t('taglineFr')} value={form.tagline_fr} onChangeText={set('tagline_fr')} />
            <Field label={t('taglineEn')} value={form.tagline_en} onChangeText={set('tagline_en')} />
            <Field label={t('phone')} value={form.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" mono />
            <Field label={t('email')} value={form.email ?? ''} onChangeText={set('email')} autoCapitalize="none" />
            <Field label={t('siteUrl')} value={form.site_url ?? ''} onChangeText={set('site_url')} autoCapitalize="none" placeholder="https://" />
            <Muted>{t('siteUrlHelp')}</Muted>
            <Field label={t('appStoreUrl')} value={form.app_store_url ?? ''} onChangeText={set('app_store_url')} autoCapitalize="none" placeholder="https://apps.apple.com/..." />
            <Field label={t('playStoreUrl')} value={form.play_store_url ?? ''} onChangeText={set('play_store_url')} autoCapitalize="none" placeholder="https://play.google.com/..." />
          </Card>

          <Card>
            <CardTitle icon="user">{t('driverPresentation')}</CardTitle>
            <Field label={t('driverNameLabel')} value={form.driver_name ?? ''} onChangeText={set('driver_name')} maxLength={60} placeholder="Karim" />
            <Label>{t('photoLabel')}</Label>
            <Row style={{ gap: 14, marginTop: 4 }}>
              {form.photo_url ? (
                <Image
                  source={{ uri: `${apiUrl}${form.photo_url}` }}
                  accessibilityIgnoresInvertColors
                  style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: colors.border }}
                />
              ) : null}
              <View style={{ flex: 1, gap: 6 }}>
                <Button kind="secondary" icon="image" title={t('choosePhoto')} onPress={choosePhoto} loading={photoBusy} />
                {form.photo_url ? (
                  <Text accessibilityRole="button" style={textLink} onPress={removePhoto}>
                    {t('removePhoto')}
                  </Text>
                ) : null}
              </View>
            </Row>
            <Muted>{t('photoHelp')}</Muted>
            <ErrorText>{photoError}</ErrorText>
          </Card>

          <VehicleEditor vehicle={form.vehicle ?? emptyVehicle} onChange={(v) => (setDone(false), setForm((f) => (f ? { ...f, vehicle: v } : f)))} onPhotosChanged={reloadPhotos} />

          <Card>
            <CardTitle icon="coffee" help={t('aboardHelp')}>{t('aboardTitle')}</CardTitle>
            {form.amenities.map((a, i) => (
              <View key={i} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 6 }}>
                <Row style={{ gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={t('amenityLabelFr')} value={a.label_fr} onChangeText={setAmenity(i, 'label_fr')} maxLength={40} />
                  </View>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={t('amenityDetailFr')} value={a.detail_fr ?? ''} onChangeText={setAmenity(i, 'detail_fr')} maxLength={60} />
                  </View>
                </Row>
                <Row style={{ gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={t('amenityLabelEn')} value={a.label_en} onChangeText={setAmenity(i, 'label_en')} maxLength={40} />
                  </View>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Field label={t('amenityDetailEn')} value={a.detail_en ?? ''} onChangeText={setAmenity(i, 'detail_en')} maxLength={60} />
                  </View>
                </Row>
                <Row style={{ gap: 18, justifyContent: 'flex-end' }}>
                  {i > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setAmenities((list) => [...list.slice(0, i - 1), list[i], list[i - 1], ...list.slice(i + 1)])}
                    >
                      <Text style={textLink}>↑ {t('moveUp')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable accessibilityRole="button" onPress={() => setAmenities((list) => list.filter((_, j) => j !== i))}>
                    <Text style={[textLink, { color: colors.danger }]}>{t('remove')}</Text>
                  </Pressable>
                </Row>
              </View>
            ))}
            {form.amenities.length < MAX_AMENITIES ? (
              <>
                <Button
                  kind="secondary"
                  icon="plus"
                  title={t('addAmenity')}
                  onPress={() => setAmenities((list) => [...list, { label_fr: '', label_en: '', detail_fr: null, detail_en: null }])}
                />
                {ideas.length > 0 ? (
                  <>
                    <Label>{t('ideas')}</Label>
                    <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                      {ideas.map((idea) => (
                        <Chip key={idea.label_fr} label={`+ ${lang === 'en' ? idea.label_en : idea.label_fr}`} onPress={() => setAmenities((list) => [...list, idea])} />
                      ))}
                    </Row>
                  </>
                ) : null}
              </>
            ) : null}
          </Card>

          <ErrorText>{error}</ErrorText>
          {done ? <Notice tone="success">{t('saved')}</Notice> : null}
          <Button icon="check" title={t('save')} onPress={save} />
        </View>

        <View style={{ width: 360, gap: 16 }}>
        {saved && bookingUrl ? <QrCardPanel business={saved} url={bookingUrl} /> : null}
        <Card style={{ alignItems: 'center' }}>
          <CardTitle icon="grid">{t('qrCode')}</CardTitle>
          <View style={{ backgroundColor: '#0D0F12', borderWidth: 1, borderColor: '#3A3F48', padding: 16, borderRadius: 3, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, color: '#EEE9E0', fontSize: 22 }}>{saved?.name}</Text>
            {qr ? <Image source={{ uri: qr }} style={{ width: 240, height: 240 }} accessibilityLabel={bookingUrl ?? ''} /> : null}
          </View>
          <Text style={[styles.muted, { textAlign: 'center' }]} selectable>
            {bookingUrl}
          </Text>
          <Muted style={{ textAlign: 'center' }}>{t('qrHelp')}</Muted>
          {!saved?.site_url ? <Notice tone="warning">{t('qrTemporary')}</Notice> : null}
          {Platform.OS === 'web' ? <Button kind="secondary" icon="download" title={t('downloadQr')} onPress={download} /> : null}
        </Card>
        </View>
      </Row>
    </ScrollView>
  );
}
