import { Redirect, Stack } from 'expo-router';
import { colors, fonts } from '@/components/ui';
import { isStaff, useAuth } from '@/lib/auth';

export default function DriverLayout() {
  const { signedIn, loading, roles, t } = useAuth();
  if (!loading && !signedIn) return <Redirect href="/sign-in" />;
  if (!loading && roles.length > 0 && !isStaff(roles)) return <Redirect href="/customer" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: fonts.semibold, color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('schedule') }} />
      <Stack.Screen name="ride/[id]" options={{ title: '' }} />
      <Stack.Screen name="quick-add" options={{ title: t('quickAdd') }} />
      <Stack.Screen name="time-off" options={{ title: t('timeOff') }} />
      <Stack.Screen name="qr" options={{ title: t('showQr') }} />
    </Stack>
  );
}
