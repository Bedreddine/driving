// In the browser (back office), the built-in localStorage is used.
export const authStorage = typeof window === 'undefined' ? undefined : window.localStorage;
