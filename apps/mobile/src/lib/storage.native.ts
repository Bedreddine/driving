// On phones, localStorage is provided by expo-sqlite so the login survives app restarts.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
