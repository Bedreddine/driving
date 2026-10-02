import { describe, expect, it } from 'vitest';
import { boundsOf, distanceKm, formatCoords, mapColors, nightStyle } from '../mapStyle';
import { shortName, SUGGESTED_PLACES } from '../places';

describe('night map style', () => {
  const style = {
    version: 8,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
      { id: 'water', type: 'fill', paint: { 'fill-color': '#00f' } },
      { id: 'highway_motorway', type: 'line', paint: { 'line-color': '#f00', 'line-width': 3 } },
      { id: 'poi_label', type: 'symbol', layout: { 'text-field': '{name}' } },
      { id: 'place_city', type: 'symbol', paint: { 'text-color': '#000' } },
    ],
  };
  const out = nightStyle(style);

  it('recolours land, water and roads, keeping other paint settings', () => {
    expect(out.layers[0].paint?.['background-color']).toBe(mapColors.land);
    expect(out.layers[1].paint?.['fill-color']).toBe(mapColors.water);
    expect(out.layers[2].paint).toEqual({ 'line-color': mapColors.major, 'line-width': 3 });
  });

  it('hides points of interest and dims labels', () => {
    expect(out.layers[3].layout).toEqual({ 'text-field': '{name}', visibility: 'none' });
    expect(out.layers[4].paint?.['text-color']).toBe(mapColors.label);
  });

  it('does not change the original style', () => {
    expect(style.layers[0].paint?.['background-color']).toBe('#fff');
  });
});

describe('map helpers', () => {
  it('measures straight distances', () => {
    expect(distanceKm([2.329, 48.8681], [2.571, 49.004])).toBeCloseTo(23.4, 0);
  });

  it('writes coordinates for people', () => {
    expect(formatCoords([2.329, 48.8681])).toBe('48.8681° N · 2.3290° E');
  });

  it('frames a set of points', () => {
    expect(boundsOf([[2.3, 48.9], [2.5, 48.8]])).toEqual([2.3, 48.8, 2.5, 48.9]);
  });
});

describe('suggested places', () => {
  it('has unique ids, both languages and Paris-area coordinates', () => {
    expect(new Set(SUGGESTED_PLACES.map((p) => p.id)).size).toBe(SUGGESTED_PLACES.length);
    for (const p of SUGGESTED_PLACES) {
      expect(p.name.fr && p.name.en && p.address).toBeTruthy();
      expect(p.lngLat[1]).toBeGreaterThan(48.6);
      expect(p.lngLat[1]).toBeLessThan(49.5);
    }
  });

  it('shortens long addresses for the route line', () => {
    expect(shortName('Hôtel Ritz Paris, 15 Place Vendôme')).toBe('HÔTEL RITZ PARIS');
    expect(shortName('A very long name of some private residence, Paris')).toHaveLength(22);
  });
});
