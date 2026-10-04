// One place for what goes wrong at run time, so people never see a developer error screen:
// screens that fail show ErrorScreen (route ErrorBoundary), and everything else is logged quietly.
import { Platform } from 'react-native';

let installed = false;

/** Logged, never shown: the developer sees it in the Metro terminal, the client sees nothing. */
export function reportError(error: unknown, where: string) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // console.log, not console.error: in development console.error opens the red overlay on the phone.
  console.log(`[error] ${where}: ${message}`);
}

type GlobalErrorUtils = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export function installErrorHandling() {
  if (installed) return;
  installed = true;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (e) => {
        reportError(e.reason, 'promise');
        e.preventDefault();
      });
    }
    return;
  }

  // Errors outside rendering (timers, event handlers, callbacks): logged. Fatal ones keep the default
  // behaviour (the app restarts cleanly) because the state could be broken; the rest never crash the app.
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (utils) {
    const fallback = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      reportError(error, isFatal ? 'fatal' : 'uncaught');
      if (isFatal && !__DEV__) fallback(error, isFatal);
    });
  }

  // Native map messages (a tile that failed to load, an odd shape): logs, not red screens.
  // Loaded lazily so the website and the tests never pull in the native map module.
  void import('@maplibre/maplibre-react-native')
    .then(({ LogManager }) => {
      LogManager.setLogLevel(__DEV__ ? 'warn' : 'error');
      LogManager.onLog(({ level, tag, message }) => {
        // Tile downloads cancelled when a map closes are normal: not worth a line.
        const cancelled = tag === 'Mbgl-HttpRequest' && message.includes('Canceled');
        if ((level === 'error' || level === 'warn') && !cancelled) console.log(`[map ${level}] ${tag}: ${message}`);
        return true;
      });
    })
    .catch(() => undefined);
}
