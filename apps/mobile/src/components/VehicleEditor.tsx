import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/http';
import type { TextKey } from '@/lib/i18n';
import type { Vehicle, VehicleCategory, VehiclePhoto } from '@/lib/publicApi';
import { fonts, night } from '@/lib/theme';
import { Chip } from './scene';
import { Button, Card, CardTitle, ErrorText, Field, Icon, Label, Muted, Row, Segmented } from './ui';
import { photoSrc } from './Vehicle';

const FEATURE_IDEAS = {
  fr: ['Sièges cuir', 'Vitres teintées', 'Toit panoramique', 'Climatisation 4 zones', 'Hybride', '100 % électrique', 'Grand coffre', 'Sièges massants'],
  en: ['Leather seats', 'Tinted windows', 'Panoramic roof', '4-zone climate', 'Hybrid', 'Fully electric', 'Large boot', 'Massage seats'],
};
const MAX_PHOTOS = 12;

export const emptyVehicle: Vehicle = { model: null, color: null, category: null, year: null, features: [], photos: [] };

/**
 * The driver's car: model, colour, year, category and features (saved with the page's "Save"),
 * and photos outside and inside (uploaded, moved, captioned and removed at once).
 */
export function VehicleEditor({ vehicle, onChange, onPhotosChanged }: { vehicle: Vehicle; onChange: (v: Vehicle) => void; onPhotosChanged: () => Promise<unknown> }) {
  const { t, err, lang } = useAuth();
  const [feature, setFeature] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Vehicle>) => onChange({ ...vehicle, ...patch });

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await onPhotosChanged();
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const upload = (kind: 'exterior' | 'interior') =>
    run(`add-${kind}`, async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 0.85 });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      const data = new FormData();
      const name = asset.fileName ?? 'car.jpg';
      if (Platform.OS === 'web') data.append('file', asset.file ?? (await (await fetch(asset.uri)).blob()), name);
      else data.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      data.append('kind', kind);
      await api.upload('/api/admin/business/vehicle-photos', data);
    });
  const patch = (p: VehiclePhoto, body: Record<string, unknown>) => run(p.id, () => api.patch(`/api/admin/business/vehicle-photos/${p.id}`, body));
  const remove = (p: VehiclePhoto) => run(p.id, () => api.del(`/api/admin/business/vehicle-photos/${p.id}`));

  const addFeature = (f: string) => {
    const v = f.trim();
    if (!v || vehicle.features.includes(v) || vehicle.features.length >= 10) return;
    set({ features: [...vehicle.features, v] });
    setFeature('');
  };
  const ideas = FEATURE_IDEAS[lang].filter((f) => !vehicle.features.includes(f));
  const small = { fontFamily: fonts.medium, fontSize: 12.5, color: night.muted };

  return (
    <Card>
      <CardTitle icon="truck">{t('vehicleTitle')}</CardTitle>
      <Row style={{ gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 2, minWidth: 200 }}>
          <Field label={t('vehicleModel')} value={vehicle.model ?? ''} onChangeText={(v) => set({ model: v })} maxLength={80} placeholder="Mercedes Classe E 300e" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label={t('vehicleColor')} value={vehicle.color ?? ''} onChangeText={(v) => set({ color: v })} maxLength={40} placeholder="Noir obsidienne" />
        </View>
        <View style={{ width: 120 }}>
          <Field
            label={t('vehicleYear')}
            value={vehicle.year ? String(vehicle.year) : ''}
            onChangeText={(v) => set({ year: /^\d{4}$/.test(v) ? Number(v) : v ? (Number(v.replace(/\D/g, '')) || null) : null })}
            keyboardType="number-pad"
            maxLength={4}
            mono
          />
        </View>
      </Row>
      <Label>{t('vehicleCategory')}</Label>
      <Segmented<VehicleCategory>
        options={(['sedan', 'van', 'suv', 'electric'] as const).map((c) => ({ value: c, label: t(`cat_${c}` as TextKey) }))}
        value={vehicle.category ?? ('' as VehicleCategory)}
        onChange={(c) => set({ category: c })}
      />

      <Label>{t('vehicleFeatures')}</Label>
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        {vehicle.features.map((f) => (
          <Chip key={f} label={`${f}  ×`} selected onPress={() => set({ features: vehicle.features.filter((x) => x !== f) })} />
        ))}
      </Row>
      <Row style={{ gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Field label={t('newFeature')} value={feature} onChangeText={setFeature} maxLength={40} onSubmitEditing={() => addFeature(feature)} />
        </View>
        <Button kind="secondary" size="sm" icon="plus" title={t('addAmenity').split(' ')[0]} onPress={() => addFeature(feature)} />
      </Row>
      {ideas.length ? (
        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          {ideas.map((f) => (
            <Chip key={f} label={`+ ${f}`} onPress={() => addFeature(f)} />
          ))}
        </Row>
      ) : null}

      <Label>{t('photoLabel')}</Label>
      <Muted>{t('photosHelp')}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {vehicle.photos.map((p, i) => (
          <View key={p.id} style={{ width: 200, gap: 6, opacity: busy === p.id ? 0.5 : 1 }}>
            <Image source={{ uri: photoSrc(p) }} accessibilityIgnoresInvertColors style={{ width: 200, height: 133, borderRadius: 3, borderWidth: 1, borderColor: night.rule }} resizeMode="cover" />
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" onPress={() => patch(p, { kind: p.kind === 'exterior' ? 'interior' : 'exterior' })}>
                <Text style={[small, { color: night.primary }]}>{t(p.kind)} ⇄</Text>
              </Pressable>
              <Row style={{ gap: 12 }}>
                {i > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('moveLeft')} onPress={() => patch(p, { position: i - 1 })} hitSlop={6}>
                    <Icon name="arrow-left" size={16} color={night.muted} />
                  </Pressable>
                ) : null}
                {i < vehicle.photos.length - 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('moveRight')} onPress={() => patch(p, { position: i + 1 })} hitSlop={6}>
                    <Icon name="arrow-right" size={16} color={night.muted} />
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={t('remove')} onPress={() => remove(p)} hitSlop={6}>
                  <Icon name="trash-2" size={16} color={night.error} />
                </Pressable>
              </Row>
            </Row>
            <CaptionField photo={p} onSave={(caption) => patch(p, { caption })} />
          </View>
        ))}
      </View>
      {vehicle.photos.length < MAX_PHOTOS ? (
        <Row style={{ gap: 10, flexWrap: 'wrap' }}>
          <Button kind="secondary" icon="camera" title={t('addExterior')} loading={busy === 'add-exterior'} onPress={() => void upload('exterior')} />
          <Button kind="secondary" icon="camera" title={t('addInterior')} loading={busy === 'add-interior'} onPress={() => void upload('interior')} />
        </Row>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** A caption saved when the field loses focus. */
function CaptionField({ photo, onSave }: { photo: VehiclePhoto; onSave: (caption: string) => void }) {
  const { t } = useAuth();
  const [value, setValue] = useState(photo.caption ?? '');
  return <Field label={t('caption')} value={value} onChangeText={setValue} maxLength={60} onBlur={() => value !== (photo.caption ?? '') && onSave(value)} />;
}
