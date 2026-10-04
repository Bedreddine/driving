import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { colors } from '@/components/ui';
import { NotificationTap } from '@/components/NotificationTap';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';
import { installErrorHandling } from '@/lib/errors';
import { ErrorScreen } from '@/components/ErrorScreen';

installErrorHandling();
// The É splash stays up until the fonts are ready: no empty black screen while the app starts.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** A screen that throws shows a calm « try again » page instead of a crash or a developer error. */
export function ErrorBoundary(props: { error: Error; retry: () => Promise<void> }) {
  return <ErrorScreen {...props} />;
}

function PushRegistration() {
  const { profile } = useAuth();
  useEffect(() => {
    if (profile) void registerForPush();
  }, [profile]);
  return null;
}

export default function RootLayout() {
  // The three typefaces of DESIGN.md (Google Fonts, OFL), one file per weight.
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    ...Feather.font,
  });
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  // Without the fonts the page would jump once they arrive; if they fail, carry on with the system fonts.
  if (!ready) return null;

  return (
    <AuthProvider>
      <PushRegistration />
      <NotificationTap />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AuthProvider>
  );
}
