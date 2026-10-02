// Design tokens of "Nuit Blanche" (see DESIGN.md at the repo root): Paris at night, one colour, street-lamp amber.
import { createContext, useContext } from 'react';

export type Palette = {
  paper: string;
  surface: string;
  raised: string;
  rule: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  success: string;
  warning: string;
  error: string;
};

/** Always dark: the client pages live at night, in hotel lobbies and in the car (DESIGN.md › Colors). */
export const night: Palette = {
  paper: '#0D0F12',
  surface: '#171A1F',
  raised: '#20242B',
  rule: '#3A3F48',
  text: '#EEE9E0',
  muted: '#8E8A82',
  primary: '#E9A23B',
  onPrimary: '#1A1206',
  success: '#6CC08F',
  warning: '#E9A23B',
  error: '#E5735F',
};

/** Font family names, as registered by useFonts in the root layout. One family per weight (needed on phones). */
export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

/** Tabular figures, so prices and times do not jump while they change. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const ThemeContext = createContext<Palette>(night);
export const useTheme = () => useContext(ThemeContext);
