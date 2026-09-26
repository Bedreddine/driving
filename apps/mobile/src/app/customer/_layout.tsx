import { Redirect, Stack } from 'expo-router';
import { colors } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function CustomerLayout() {
  const { session, loading, t } = useAuth();
  if (!loading && !session) return <Redirect href="/sign-in" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('myRides') }} />
      <Stack.Screen name="book" options={{ title: t('bookRide') }} />
      <Stack.Screen name="ride/[id]" options={{ title: '' }} />
      <Stack.Screen name="account" options={{ title: t('account') }} />
    </Stack>
  );
}
