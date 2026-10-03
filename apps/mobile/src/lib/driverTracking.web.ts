// Browsers cannot send the position with the page closed: LiveShare falls back to the open-screen sharing.
export const backgroundSupported = false;
export const isTracking = async () => false;
export const startTracking = async (_notice: { title: string; body: string }): Promise<'background' | 'foreground-only' | 'denied'> =>
  'foreground-only';
export const stopTracking = async () => undefined;
