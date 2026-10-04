import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { apiUrl } from '@/lib/http';
import type { TextKey } from '@/lib/i18n';
import type { Vehicle, VehiclePhoto } from '@/lib/publicApi';
import { fonts, night, radius } from '@/lib/theme';
import { Button, Icon } from './controls';
import { Tabs } from './scene';

/** "Mercedes Classe E · Noir obsidienne · 2024" */
export function vehicleLine(v: Vehicle | null | undefined, fallback?: string | null) {
  const parts = [v?.model, v?.color, v?.year ? String(v.year) : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : (fallback ?? null);
}
export const hasVehicle = (v: Vehicle | null | undefined) => !!v && (!!v.model || v.photos.length > 0);
export const photoSrc = (p: VehiclePhoto) => `${apiUrl}${p.url}`;
export const coverPhoto = (v: Vehicle | null | undefined) => v?.photos.find((p) => p.kind === 'exterior') ?? v?.photos[0] ?? null;

/** Compact summary for the booking sheet and the ride page: first outside photo, model and colour, "See the car". */
export function VehicleCard({ vehicle, fallback }: { vehicle: Vehicle; fallback?: string | null }) {
  const { t } = useAuth();
  const [open, setOpen] = useState(false);
  const cover = coverPhoto(vehicle);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('seeCar')}
        onPress={() => setOpen(true)}
        disabled={vehicle.photos.length === 0}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          padding: 10,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: night.rule,
          backgroundColor: pressed ? night.raised : night.paper,
        })}
      >
        {cover ? (
          <Image source={{ uri: photoSrc(cover) }} accessibilityIgnoresInvertColors style={{ width: 92, height: 62, borderRadius: radius.control }} resizeMode="cover" />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: night.rule, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="truck" size={18} color={night.primary} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: night.text }}>{vehicleLine(vehicle, fallback) ?? t('yourCar')}</Text>
          {vehicle.category ? <Text style={{ fontFamily: fonts.body, fontSize: 13, color: night.muted }}>{t(`cat_${vehicle.category}` as TextKey)}</Text> : null}
          {vehicle.photos.length > 0 ? (
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: night.primary }}>
              {t('seeCar')} · {vehicle.photos.length} →
            </Text>
          ) : null}
        </View>
      </Pressable>
      <VehicleGallery vehicle={vehicle} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Full-screen photos of the car, outside and inside, swiped one by one, with its details and features. */
export function VehicleGallery({ vehicle, visible, onClose }: { vehicle: Vehicle; visible: boolean; onClose: () => void }) {
  const { t } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const kinds = (['exterior', 'interior'] as const).filter((k) => vehicle.photos.some((p) => p.kind === k));
  const [kind, setKind] = useState<'exterior' | 'interior'>(kinds[0] ?? 'exterior');
  const photos = vehicle.photos.filter((p) => p.kind === kind);
  const frame = Math.min(width, 900);
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={{ flex: 1, backgroundColor: night.paper, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: night.text, flex: 1 }}>{vehicle.model ?? t('yourCar')}</Text>
          <Button kind="ghost" size="sm" icon="x" title={t('close')} onPress={onClose} />
        </View>
        {kinds.length > 1 ? (
          <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
            <Tabs value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t(k) }))} />
          </View>
        ) : null}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ alignSelf: 'center' }}>
          {photos.map((p) => (
            <View key={p.id} style={{ width: frame, paddingHorizontal: 20 }}>
              <Image
                source={{ uri: photoSrc(p) }}
                accessibilityLabel={p.caption ?? vehicle.model ?? ''}
                style={{ width: frame - 40, height: Math.min(height * 0.5, (frame - 40) * 0.66), borderRadius: radius.control, backgroundColor: night.surface }}
                resizeMode="cover"
              />
              {p.caption ? <Text style={{ fontFamily: fonts.body, fontSize: 14, color: night.muted, marginTop: 8 }}>{p.caption}</Text> : null}
            </View>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
          {vehicleLine(vehicle) ? <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 0.4, color: night.text }}>{vehicleLine(vehicle)!.toUpperCase()}</Text> : null}
          {vehicle.category ? <Text style={{ fontFamily: fonts.body, fontSize: 14, color: night.muted }}>{t(`cat_${vehicle.category}` as TextKey)}</Text> : null}
          {vehicle.features.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {vehicle.features.map((f) => (
                <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: night.rule }}>
                  <Icon name="check" size={14} color={night.primary} />
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: night.text }}>{f}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
