import { Redirect, Stack } from 'expo-router';
import { colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function CustomerLayout() {
  const { signedIn, loading, t } = useAuth();
  if (!loading && !signedIn) return <Redirect href="/sign-in" />;
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
      <Stack.Screen name="index" options={{ title: t('myRides') }} />
      <Stack.Screen name="book" options={{ title: t('bookRide') }} />
      <Stack.Screen name="ride/[id]" options={{ title: '' }} />
      <Stack.Screen name="account" options={{ title: t('account') }} />
    </Stack>
  );
}
