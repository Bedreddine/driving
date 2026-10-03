import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportError } from '@/lib/errors';
import { translate, type Lang } from '@/lib/i18n';
import { fonts, night } from '@/lib/theme';
import { Button } from './controls';

/**
 * Shown instead of a screen that failed to render. Works without the app's providers (it can replace the
 * root layout), so it picks the language from the phone and uses the Nuit Blanche colours directly.
 */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const lang: Lang = getLocales()[0]?.languageCode === 'en' ? 'en' : 'fr';
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  useEffect(() => reportError(error, 'screen'), [error]);

  return (
    <View style={{ flex: 1, backgroundColor: night.paper, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 26, color: night.text }}>Élysée Chauffeur</Text>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16, maxWidth: 480 }}>
        <View style={{ width: 40, height: 3, backgroundColor: night.primary }} />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 48, color: night.text }}>
          {t('crashTitle')}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: night.muted }}>{t('crashBody')}</Text>
      </View>
      <View style={{ gap: 12, maxWidth: 480 }}>
        <Button size="lg" title={t('crashRetry')} icon="refresh-cw" onPress={() => void retry()} />
        <Button
          kind="secondary"
          title={t('crashHome')}
          icon="home"
          onPress={() => {
            // Leave the broken page first, then clear the error (retrying first would show it again).
            router.replace('/book');
            setTimeout(() => void retry(), 0);
          }}
        />
      </View>
    </View>
  );
}
