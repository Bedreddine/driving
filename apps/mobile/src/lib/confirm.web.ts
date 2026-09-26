// react-native-web has no Alert dialog, so the browser's own confirm() is used.
export function confirmAsk(message: string): Promise<boolean> {
  return Promise.resolve(window.confirm(message));
}
