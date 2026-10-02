import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import type { Lang } from '@/lib/i18n';
import { fonts, night } from '@/lib/theme';

/** Brand on the left, FR · EN on the right, floating over the map of the client pages. */
export function ClientTopBar({ name, onBrandPress }: { name: string | null | undefined; onBrandPress?: () => void }) {
  const { lang, setLanguage } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top + 14,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Pressable accessibilityRole="link" onPress={onBrandPress} disabled={!onBrandPress}>
        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: night.text }}>{name ?? 'Élysée Chauffeur'}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['fr', 'en'] as Lang[]).map((l) => (
          <Pressable key={l} onPress={() => void setLanguage(l)} accessibilityRole="button" accessibilityState={{ selected: l === lang }} hitSlop={10}>
            <Text style={{ fontFamily: l === lang ? fonts.bold : fonts.medium, fontSize: 12.5, letterSpacing: 1, color: night.text, opacity: l === lang ? 1 : 0.55 }}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
