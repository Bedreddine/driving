import { Link, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { legalDoc, type LegalPage } from '@/lib/legalTexts';
import { type BusinessInfo, getBusiness, getPublicDriver } from '@/lib/publicApi';
import { fonts, night } from '@/lib/theme';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { ClientTopBar } from './ClientTopBar';
import { Display } from './scene';

/** One legal page (mentions légales, CGV, privacy), readable on a phone, linked from every client page. */
export function LegalScreen({ page }: { page: LegalPage }) {
  const { lang } = useAuth();
  const insets = useSafeAreaInsets();
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    void getBusiness().then(setBusiness).catch(() => undefined);
    void getPublicDriver()
      .then((d) => setWaiting(d.extras?.waiting_per_minute ?? null))
      .catch(() => undefined);
  }, []);

  const doc = legalDoc(page, business, lang, waiting);
  useDocumentTitle(`${doc.title} – ${business?.name ?? 'Élysée Chauffeur'}`);

  return (
    <View style={{ flex: 1, backgroundColor: night.paper }}>
      <Stack.Screen options={{ headerShown: false, title: doc.title }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 84, paddingBottom: insets.bottom + 40, paddingHorizontal: 22 }}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: 22 }}>
          <Display size={40}>{doc.title}</Display>
          {doc.sections.map((s) => (
            <View key={s.heading} style={{ gap: 8 }}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 17.5, color: night.text }}>
                {s.heading}
              </Text>
              {s.paragraphs.map((p, i) => (
                <Text key={i} style={{ fontFamily: fonts.body, fontSize: 15.5, lineHeight: 24, color: night.label }}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <LegalLinks current={page} />
        </View>
      </ScrollView>
      <ClientTopBar name={business?.name} />
    </View>
  );
}

/** "Mentions légales · CGV · Confidentialité": the small links at the bottom of client pages. */
export function LegalLinks({ current }: { current?: LegalPage }) {
  const { t } = useAuth();
  const links: { page: LegalPage; href: '/legal' | '/terms' | '/privacy'; label: string }[] = [
    { page: 'legal', href: '/legal', label: t('legalNotice') },
    { page: 'terms', href: '/terms', label: t('termsShort') },
    { page: 'privacy', href: '/privacy', label: t('privacyShort') },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 8 }}>
      {links
        .filter((l) => l.page !== current)
        .map((l) => (
          <Link key={l.href} href={l.href} style={{ fontFamily: fonts.medium, fontSize: 13, color: night.muted, textDecorationLine: 'underline' }}>
            {l.label}
          </Link>
        ))}
    </View>
  );
}
