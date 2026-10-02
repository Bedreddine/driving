import { describe, expect, it } from 'vitest';
import { displayName, isEveningInParis, monthLabel } from '../format';

describe('public display name of a reviewer', () => {
  it('keeps the first initial and the last name', () => {
    expect(displayName('James Smith')).toBe('J. Smith');
    expect(displayName('  anne  de la Tour ')).toBe('A. Tour');
  });

  it('skips titles', () => {
    expect(displayName('Mr James Smith')).toBe('J. Smith');
    expect(displayName('Mme. Claire Dubois')).toBe('C. Dubois');
  });

  it('keeps a single word as it is', () => {
    expect(displayName('Karim')).toBe('Karim');
    expect(displayName('')).toBe('');
    expect(displayName(null)).toBe('');
  });
});

describe('guest book month', () => {
  it('names the month in the reader language', () => {
    expect(monthLabel('2026-09', 'fr')).toBe('septembre 2026');
    expect(monthLabel('2026-09', 'en')).toBe('September 2026');
  });
});

describe('day / evening palette', () => {
  it('switches at 19:00 and 07:00 Paris time', () => {
    expect(isEveningInParis(new Date('2026-07-15T16:59:00Z'))).toBe(false); // 18:59 in Paris (summer)
    expect(isEveningInParis(new Date('2026-07-15T17:00:00Z'))).toBe(true); // 19:00
    expect(isEveningInParis(new Date('2026-01-15T05:59:00Z'))).toBe(true); // 06:59 (winter)
    expect(isEveningInParis(new Date('2026-01-15T06:00:00Z'))).toBe(false); // 07:00
  });
});
