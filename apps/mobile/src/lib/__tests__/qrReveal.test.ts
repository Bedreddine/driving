import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { AMBER, ASPHALT, buildQrReveal, finderDark, inFinder, revealFrame } from '../qrReveal';

const URLS = ['https://elysee-chauffeur.example/book', 'https://example.com/b/karim-vtc-paris?utm=card&ref=qr-business'];

describe('QR reveal geometry', () => {
  for (const text of URLS) {
    it(`ends as exactly the real QR matrix (${text.length} chars)`, () => {
      const { size, rings, finders } = buildQrReveal(text);
      const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
      expect(size).toBe(qr.modules.size);
      const owners = new Array<number>(size * size).fill(0);
      for (const ring of rings) for (const i of ring.cells) owners[i]++;
      for (const f of finders)
        for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) if (finderDark(dr, dc)) owners[(f.y + dr) * size + f.x + dc]++;
      for (let i = 0; i < size * size; i++) expect(owners[i]).toBe(qr.modules.data[i] === 1 ? 1 : 0);
      // the finder patterns really are where the code has them
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (inFinder(r, c, size)) {
            const f = finders.find((p) => r >= p.y && r < p.y + 7 && c >= p.x && c < p.x + 7)!;
            expect(qr.modules.data[r * size + c] === 1).toBe(finderDark(r - f.y, c - f.x));
          }
    });
  }

  it('groups modules into a dozen-odd rings, centre first, each one path', () => {
    const { rings } = buildQrReveal(URLS[0]);
    expect(rings.length).toBeGreaterThanOrEqual(10);
    expect(rings.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < rings.length; i++) expect(rings[i].distance).toBeGreaterThan(rings[i - 1].distance);
    const { size } = buildQrReveal(URLS[0]);
    for (const r of rings) {
      // the path paints exactly the ring's modules (runs: M{x} {y}h{len+0.03}…)
      const painted: number[] = [];
      for (const m of r.d.matchAll(/M(\d+) (\d+)h([\d.]+)/g)) {
        const [x, y, len] = [Number(m[1]), Number(m[2]), Math.round(Number(m[3]) - 0.03)];
        for (let c = x; c < x + len; c++) painted.push(y * size + c);
      }
      expect(painted.sort((a, b) => a - b)).toEqual([...r.cells].sort((a, b) => a - b));
    }
  });

  it('is deterministic (same card, same shimmer)', () => {
    expect(buildQrReveal(URLS[0])).toEqual(buildQrReveal(URLS[0]));
  });
});

describe('QR reveal timing', () => {
  it('shows nothing at t = 0', () => {
    const f = revealFrame(0, 14);
    expect(f.finderOutline).toBe(0);
    expect(f.finderCentre).toBe(0);
    expect(f.flash).toBe(0);
    for (const r of f.rings) expect(r.opacity).toBe(0);
  });

  it('ends still and scannable at t = 1: everything asphalt, full size, no flash', () => {
    const f = revealFrame(1, 14);
    expect(f.finderOutline).toBe(1);
    expect(f.finderCentre).toBe(1);
    expect(f.finderColor).toBe(ASPHALT);
    expect(f.flash).toBe(0);
    for (const r of f.rings) expect(r).toEqual({ opacity: 1, scale: 1, color: ASPHALT });
  });

  it('locks the finders on in amber before the city lights up from the centre', () => {
    const early = revealFrame(0.12, 14);
    expect(early.finderOutline).toBeGreaterThan(0.5);
    expect(early.finderColor).toBe(AMBER);
    for (const r of early.rings) expect(r.opacity).toBe(0);
    const mid = revealFrame(0.4, 14);
    for (let i = 1; i < mid.rings.length; i++) expect(mid.rings[i].opacity).toBeLessThanOrEqual(mid.rings[i - 1].opacity);
    expect(mid.rings[0].opacity).toBeGreaterThan(0);
    expect(mid.rings[13].opacity).toBe(0);
  });

  it('never overshoots', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const f = revealFrame(t, 14);
      expect(f.finderOutline).toBeLessThanOrEqual(1);
      for (const r of f.rings) {
        expect(r.scale).toBeLessThanOrEqual(1);
        expect(r.opacity).toBeLessThanOrEqual(1);
      }
    }
  });
});
