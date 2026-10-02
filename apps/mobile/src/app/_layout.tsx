import { useLastNotificationResponse } from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '@/components/ui';
import { AuthProvider, isStaff, useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';

function PushRegistration() {
  const { profile, roles } = useAuth();
  const router = useRouter();
  const tapped = useLastNotificationResponse();

  useEffect(() => {
    if (profile) void registerForPush();
  }, [profile]);

  // Tapping a notification opens the ride it is about.
  useEffect(() => {
    const rideId = tapped?.notification.request.content.data?.ride_id;
    if (!profile || typeof rideId !== 'string') return;
    router.push({ pathname: isStaff(roles) ? '/driver/ride/[id]' : '/customer/ride/[id]', params: { id: rideId } });
  }, [tapped, profile, roles, router]);
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
