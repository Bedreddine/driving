import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '@/components/ui';
import { NotificationTap } from '@/components/NotificationTap';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';

function PushRegistration() {
  const { profile } = useAuth();
  useEffect(() => {
    if (profile) void registerForPush();
  }, [profile]);
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PushRegistration />
      <NotificationTap />
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
