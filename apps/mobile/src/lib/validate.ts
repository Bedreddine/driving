// Shared input checks (the server checks again; these give the user an immediate explanation).

/** International or French phone number: digits, spaces, dots, dashes, brackets, optional leading +. */
export const isPhone = (s: string) => /^\+?[0-9 .\-()]{6,30}$/.test(s.trim()) && s.replace(/\D/g, '').length >= 6;
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
/** Digits for wa.me / tel:, or null when the number cannot be dialled. */
export const phoneDigits = (s: string | null | undefined) => {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 6 ? d : null;
};
