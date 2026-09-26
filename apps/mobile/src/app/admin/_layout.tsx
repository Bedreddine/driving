import { Link, Redirect, Slot, usePathname } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';
import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { TextKey } from '@/lib/i18n';

const links: { href: '/admin' | '/admin/contacts' | '/admin/pricing' | '/admin/hours' | '/driver'; key: TextKey }[] = [
  { href: '/admin', key: 'rides' },
  { href: '/admin/contacts', key: 'contacts' },
  { href: '/admin/pricing', key: 'pricing' },
  { href: '/admin/hours', key: 'hours' },
  { href: '/driver', key: 'schedule' },
];

/** Back office: a desktop layout with a side menu (top menu on narrow screens), not phone tabs. */
export default function AdminLayout() {
  const { session, loading, roles, t, signOut } = useAuth();
  const path = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  if (!loading && !session) return <Redirect href="/sign-in" />;
  if (!loading && roles.length > 0 && !roles.includes('admin')) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.bg }}>
      <View
        style={{
          backgroundColor: colors.primary,
          padding: 16,
          gap: 4,
          width: wide ? 220 : undefined,
          flexDirection: wide ? 'column' : 'row',
          flexWrap: 'wrap',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: wide ? 16 : 0, marginRight: 16 }}>
          🚕 {t('backOffice')}
        </Text>
        {links.map((l) => {
          const active = l.href === '/admin' ? path === '/admin' : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: '#fff',
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: active ? 'rgba(255,255,255,0.18)' : undefined,
                fontWeight: active ? '700' : '500',
              }}
            >
              {t(l.key)}
            </Link>
          );
        })}
        <Text onPress={() => void signOut()} style={{ color: colors.accent, paddingVertical: 8, paddingHorizontal: 10 }}>
          {t('signOut')}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
