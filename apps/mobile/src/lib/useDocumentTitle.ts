import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Browser tab title on the website (no effect in the phone app). */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (Platform.OS === 'web' && title && typeof document !== 'undefined') document.title = title;
  }, [title]);
}
