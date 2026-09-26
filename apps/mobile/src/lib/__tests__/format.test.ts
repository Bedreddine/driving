import { describe, expect, it } from 'vitest';
import { dayKey, fromWallClock, parsePrice, toWallClock } from '../format';
import { labelFor } from '../geocode';
import { dictionaries, errorText } from '../i18n';

describe('Paris wall clock', () => {
  it('converts winter time (UTC+1)', () => {
    expect(fromWallClock({ year: 2027, month: 1, day: 15, hour: 10, minute: 30 })).toBe('2027-01-15T09:30:00.000Z');
  });

  it('converts summer time (UTC+2)', () => {
    expect(fromWallClock({ year: 2027, month: 7, day: 15, hour: 10, minute: 30 })).toBe('2027-07-15T08:30:00.000Z');
  });

  it('handles the days the clocks change', () => {
    // 28 March 2027 (summer time starts) and 31 October 2027 (winter time starts).
    expect(fromWallClock({ year: 2027, month: 3, day: 28, hour: 12, minute: 0 })).toBe('2027-03-28T10:00:00.000Z');
    expect(fromWallClock({ year: 2027, month: 10, day: 31, hour: 12, minute: 0 })).toBe('2027-10-31T11:00:00.000Z');
  });

  it('round-trips', () => {
    const iso = '2027-05-02T17:05:00.000Z';
    expect(fromWallClock(toWallClock(iso))).toBe(iso);
  });

  it('groups by Paris day, not UTC day', () => {
    expect(dayKey('2027-01-15T23:30:00.000Z')).toBe('2027-01-16');
  });
});

describe('parsePrice', () => {
  it.each([
    ['45', 45],
    ['45,50', 45.5],
    ['45.5', 45.5],
    [' 60 € ', 60],
  ])('reads %s', (text, value) => expect(parsePrice(text)).toBe(value));

  it.each(['', 'abc', '-5', '4.567', '1,2,3'])('rejects %s', (text) => expect(parsePrice(text)).toBeNull());
});

describe('address labels', () => {
  it('prefers the place name then the street and city', () => {
    expect(labelFor({ name: 'Gare de Lyon', street: 'Place Louis-Armand', postcode: '75012', city: 'Paris' })).toBe(
      'Gare de Lyon, Place Louis-Armand, 75012 Paris',
    );
    expect(labelFor({ housenumber: '10', street: 'Rue de Rivoli', postcode: '75004', city: 'Paris' })).toBe(
      '10 Rue de Rivoli, 75004 Paris',
    );
  });
});

describe('texts', () => {
  it('has every key in both languages', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.fr).sort());
  });

  it('turns error codes into sentences', () => {
    expect(errorText('en', 'SLOT_TAKEN')).toBe('This time slot is already booked.');
    expect(errorText('fr', 'UNKNOWN_CODE')).toBe(dictionaries.fr.err_generic);
  });
});
