import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import type { Lang } from '@/lib/i18n';
import type { BusinessInfo } from '@/lib/publicApi';
import { colors, serif } from './ui';

/** Dark, gold-accented frame of the public booking website: brand, tagline, language switch, footer. */
export function PremiumShell({ business, children }: { business: BusinessInfo | null; children: ReactNode }) {
  const { lang, setLanguage, t } = useAuth();
  const tagline = business ? (lang === 'en' ? business.tagline_en : business.tagline_fr) : '';
  const phoneDigits = business?.phone?.replace(/[^\d]/g, '');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.night }} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.night }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, gap: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              {(['fr', 'en'] as Lang[]).map((l) => (
                <Pressable key={l} onPress={() => void setLanguage(l)} accessibilityRole="button">
                  <Text style={{ color: l === lang ? colors.gold : '#8A8A90', fontWeight: '700', letterSpacing: 1 }}>
                    {l.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
              <View style={{ width: 48, height: 1, backgroundColor: colors.gold }} />
              <Text
                accessibilityRole="header"
                style={{ fontFamily: serif, color: colors.gold, fontSize: 34, letterSpacing: 1.5, textAlign: 'center' }}
              >
                {business?.name ?? ''}
              </Text>
              <Text style={{ color: '#E8E4DA', fontSize: 16, textAlign: 'center' }}>{tagline}</Text>
              <Text style={{ color: '#8A8A90', fontSize: 13, letterSpacing: 1, textAlign: 'center' }}>
                {t('heroLine')}
              </Text>
              <View style={{ width: 48, height: 1, backgroundColor: colors.gold }} />
            </View>

            {children}

            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
              {business?.phone ? (
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <Text style={footerLink} onPress={() => void Linking.openURL(`tel:${business.phone}`)}>
                    ☎ {business.phone}
                  </Text>
                  {phoneDigits ? (
                    <Text style={footerLink} onPress={() => void Linking.openURL(`https://wa.me/${phoneDigits}`)}>
                      WhatsApp
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {business?.app_store_url || business?.play_store_url ? (
                <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Text style={{ color: '#8A8A90' }}>{t('getTheApp')}:</Text>
                  {business.app_store_url ? (
                    <Text style={footerLink} onPress={() => void Linking.openURL(business.app_store_url!)}>
                      App Store
                    </Text>
                  ) : null}
                  {business.play_store_url ? (
                    <Text style={footerLink} onPress={() => void Linking.openURL(business.play_store_url!)}>
                      Google Play
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Link href="/sign-in" style={{ color: '#8A8A90', textDecorationLine: 'underline' }}>
                {t('alreadyClient')}
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const footerLink = { color: colors.gold, fontWeight: '600' as const };

/** A light card on the dark page, with a small gold heading. */
export function PremiumCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FAF8F3', borderRadius: 14, padding: 18, gap: 8 }}>
      {title ? (
        <Text style={{ fontFamily: serif, fontSize: 20, color: colors.night, marginBottom: 4 }}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}
