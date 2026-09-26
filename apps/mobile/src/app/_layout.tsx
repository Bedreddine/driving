import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';

function PushRegistration() {
  const { profile } = useAuth();
  useEffect(() => {
    if (profile) void registerForPush(profile.id);
  }, [profile]);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PushRegistration />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AuthProvider>
  );
}
