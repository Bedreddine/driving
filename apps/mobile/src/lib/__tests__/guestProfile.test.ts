import { describe, expect, it } from 'vitest';
import { addRecent, decodePlace, encodePlace, firstName } from '../guestProfile';

const ritz = { lat: 48.8681, lng: 2.329, address: 'Ritz Paris, 15 Place Vendôme, 75001 Paris' };
const cdg = { lat: 49.004, lng: 2.571, address: 'Aéroport CDG, Terminal 2E' };

describe('places in a "book again" link', () => {
  it('survive the round trip, commas in the address included', () => {
    expect(decodePlace(encodePlace(ritz))).toEqual({ ...ritz, lat: 48.8681, lng: 2.329 });
  });

  it('refuse broken or impossible values', () => {
    expect(decodePlace('hello')).toBeNull();
    expect(decodePlace('95,2.3,Nowhere')).toBeNull();
    expect(decodePlace(undefined)).toBeNull();
  });
});

describe('recent places', () => {
  it('keep the newest first, without duplicates, six at most', () => {
    const list = addRecent([ritz], [cdg, ritz]);
    expect(list.map((p) => p.address)).toEqual([cdg.address, ritz.address]);
    const many = Array.from({ length: 9 }, (_, i) => ({ ...ritz, address: `Place ${i}` }));
    expect(addRecent([], many)).toHaveLength(6);
  });
});

describe('welcome back', () => {
  it('uses the first name, without the title', () => {
    expect(firstName('Mr James Smith')).toBe('James');
    expect(firstName('Claire')).toBe('Claire');
  });
});
