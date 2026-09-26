import { Alert } from 'react-native';

/** Yes/no question. Phones use a native dialog (see confirm.web.ts for the browser). */
export function confirmAsk(message: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('', message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
