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
  // Without the fonts the page would jump once they arrive; if they fail, carry on with the system fonts.
  if (!fontsLoaded && !fontError) return null;

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
