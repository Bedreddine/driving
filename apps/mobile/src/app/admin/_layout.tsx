import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { colors, fonts, Icon, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { TextKey } from '@/lib/i18n';
import { night } from '@/lib/theme';

type Href = '/admin' | '/admin/contacts' | '/admin/reviews' | '/admin/pricing' | '/admin/hours' | '/admin/business' | '/driver';

const links: { href: Href; key: TextKey; icon: IconName }[] = [
  { href: '/admin', key: 'rides', icon: 'list' },
  { href: '/admin/contacts', key: 'contacts', icon: 'users' },
  { href: '/admin/reviews', key: 'reviews', icon: 'star' },
  { href: '/admin/pricing', key: 'pricing', icon: 'tag' },
  { href: '/admin/hours', key: 'hours', icon: 'clock' },
  { href: '/admin/business', key: 'business', icon: 'briefcase' },
  { href: '/driver', key: 'schedule', icon: 'calendar' },
];

/** One menu entry: icon and words; the current page sits on a raised panel with an amber icon. */
function MenuItem({ label, icon, active, compact, onPress }: { label: string; icon: IconName; active: boolean; compact: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={(state) => {
        const { pressed, hovered, focused } = state as { pressed: boolean; hovered?: boolean; focused?: boolean };
        return [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: compact ? 8 : 10,
            paddingHorizontal: 12,
            borderRadius: 3,
            backgroundColor: active ? night.raised : pressed || hovered ? night.paper : 'transparent',
            borderWidth: 1,
            borderColor: active ? night.rule : 'transparent',
          },
          Platform.OS === 'web' && focused ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: night.primary } as object) : null,
        ];
      }}
    >
      <Icon name={icon} size={17} color={active ? night.primary : night.muted} />
      <Text style={{ fontFamily: active ? fonts.semibold : fonts.medium, fontSize: 14.5, color: active ? night.text : '#C9C4BA' }}>{label}</Text>
    </Pressable>
  );
}

/** Back office: a desktop layout with a side menu (top menu on narrow screens), not phone tabs. */
export default function AdminLayout() {
  const { signedIn, loading, roles, t, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  if (!loading && !signedIn) return <Redirect href="/sign-in" />;
  if (!loading && roles.length > 0 && !roles.includes('admin')) return <Redirect href="/" />;

  const items = links.map((l) => (
    <MenuItem
      key={l.href}
      label={t(l.key)}
      icon={l.icon}
      compact={!wide}
      active={l.href === '/admin' ? path === '/admin' || path.startsWith('/admin/ride') : path.startsWith(l.href)}
      onPress={() => router.push(l.href)}
    />
  ));
  const out = <MenuItem label={t('signOut')} icon="log-out" active={false} compact={!wide} onPress={() => void signOut()} />;

  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.bg }}>
      {wide ? (
        <View style={{ width: 236, backgroundColor: night.surface, borderRightWidth: 1, borderRightColor: night.rule, padding: 16, gap: 4 }}>
          <Text style={{ color: night.text, fontFamily: fonts.display, fontSize: 26, marginBottom: 18, paddingHorizontal: 4 }}>{t('backOffice')}</Text>
          {items}
          <View style={{ flex: 1 }} />
          <View style={{ borderTopWidth: 1, borderTopColor: night.rule, paddingTop: 10 }}>{out}</View>
        </View>
      ) : (
        <View style={{ backgroundColor: night.surface, borderBottomWidth: 1, borderBottomColor: night.rule }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10, gap: 6, alignItems: 'center' }}>
            <Text style={{ color: night.text, fontFamily: fonts.display, fontSize: 20, marginRight: 8 }}>{t('backOffice')}</Text>
            {items}
            {out}
          </ScrollView>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  );
}
