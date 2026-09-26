import { Redirect, Stack } from 'expo-router';
import { colors } from '@/components/ui';
import { isStaff, useAuth } from '@/lib/auth';

export default function DriverLayout() {
  const { session, loading, roles, t } = useAuth();
  if (!loading && !session) return <Redirect href="/sign-in" />;
  if (!loading && roles.length > 0 && !isStaff(roles)) return <Redirect href="/customer" />;
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ title: t('schedule') }} />
      <Stack.Screen name="ride/[id]" options={{ title: '' }} />
      <Stack.Screen name="quick-add" options={{ title: t('quickAdd') }} />
      <Stack.Screen name="time-off" options={{ title: t('timeOff') }} />
    </Stack>
  );
}
