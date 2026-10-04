// "The city lights up": the business-card QR code reveal (DESIGN.md › Motion), as pure geometry + timing.
// The live card (AnimatedQrCard) and the GIF export (qrGif.web) both draw from this, so they match.
//
// Geometry is built once per URL: the three finder patterns, and every other dark module grouped into a
// few distance rings around the centre (with a small fixed jitter, so it shimmers rather than draws a circle).
// Each ring is ONE path; per frame only `revealFrame(t)` runs: each ring's opacity / scale / colour.
import QRCode from 'qrcode';

/** Brand colours (theme.ts › night), repeated here so this module stays free of React. */
export const ASPHALT = '#0D0F12';
export const AMBER = '#E9A23B';
export const IVORY = '#EEE9E0';

/** Light modules kept around the code (scanners need a quiet zone). */
export const QUIET = 3;
export const QR_REVEAL_MS = 2200;
const RING_COUNT = 14;

export type QrRing = {
  /** SVG path (module units) of every dark module in the ring, merged into horizontal runs. */
  d: string;
  /** Module indices (row * size + col) in the ring. */
  cells: number[];
  /** Mean distance of the ring's modules from the centre, in modules. */
  distance: number;
};

export type QrReveal = {
  size: number;
  /** Top-left module of each 7×7 finder pattern. */
  finders: { x: number; y: number }[];
  rings: QrRing[];
};

/** Is module (r, c) inside one of the three 7×7 finder patterns? */
export function inFinder(r: number, c: number, size: number) {
  return (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
}

/** The dark modules of a finder pattern at (0,0): its 1-module outline and its 3×3 centre. */
export function finderDark(dr: number, dc: number) {
  const outline = dr === 0 || dr === 6 || dc === 0 || dc === 6;
  const centre = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
  return outline || centre;
}

/** Deterministic 0..1 noise per module (same card → same shimmer, on screen and in the GIF). */
function jitter(r: number, c: number) {
  let h = (r * 374761393 + c * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const n = (v: number) => Number(v.toFixed(3));

export function buildQrReveal(text: string): QrReveal {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const mid = size / 2;
  const dark = (r: number, c: number) => qr.modules.data[r * size + c] === 1;

  const mods: { r: number; c: number; dist: number; key: number }[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (!dark(r, c) || inFinder(r, c, size)) continue;
      const dist = Math.hypot(c + 0.5 - mid, r + 0.5 - mid);
      mods.push({ r, c, dist, key: 0 });
    }
  const maxDist = Math.max(1, ...mods.map((m) => m.dist));
  for (const m of mods) m.key = 0.84 * (m.dist / maxDist) + 0.16 * jitter(m.r, m.c);
  const maxKey = Math.max(1e-9, ...mods.map((m) => m.key));

  const buckets: (typeof mods)[] = Array.from({ length: RING_COUNT }, () => []);
  for (const m of mods) buckets[Math.min(RING_COUNT - 1, Math.floor((m.key / maxKey) * RING_COUNT))].push(m);

  const rings: QrRing[] = buckets
    .filter((b) => b.length > 0)
    .map((b) => {
      const set = new Set(b.map((m) => m.r * size + m.c));
      // Merge horizontal runs; a hair of overlap (0.03) hides antialiasing seams between paths.
      let d = '';
      for (let r = 0; r < size; r++) {
        let c = 0;
        while (c < size) {
          if (!set.has(r * size + c)) {
            c++;
            continue;
          }
          const start = c;
          while (c < size && set.has(r * size + c)) c++;
          const len = n(c - start + 0.03);
          d += `M${start} ${r}h${len}v1.03h${-len}z`;
        }
      }
      return { d, cells: [...set], distance: b.reduce((s, m) => s + m.dist, 0) / b.length };
    });

  return {
    size,
    finders: [
      { x: 0, y: 0 },
      { x: size - 7, y: 0 },
      { x: 0, y: size - 7 },
    ],
    rings,
  };
}

/** Outline of a finder pattern at (x, y): a closed square on the centre line of its 1-module border, 24 long. */
export function finderOutlinePath(x: number, y: number) {
  return `M${x + 0.5} ${y + 0.5}h6v6h-6z`;
}
export const FINDER_OUTLINE_LENGTH = 24;

// --- timing --------------------------------------------------------------------------------------------

/** cubic-bezier(x1, y1, x2, y2) as a function of 0..1 (same curve as CSS / Easing.bezier). */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 1 + 3 * x1 - 3 * x2;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 + 3 * y1 - 3 * y2;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let i = 0; i < 8; i++) {
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= (x(s) - p) / d;
    }
    s = Math.min(1, Math.max(0, s));
    return ((ay * s + by) * s + cy) * s;
  };
}
/** DESIGN.md › Motion: enter easing. */
export const easeEnter = bezier(0.22, 1, 0.36, 1);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress (0..1) of a phase running from `from` to `to` ms, at `ms`. */
const phase = (ms: number, from: number, to: number) => clamp01((ms - from) / (to - from));

function hex(c: string) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const A = hex(AMBER);
const B = hex(ASPHALT);
/** Amber (k = 0) cooling to asphalt (k = 1). */
export function amberToAsphalt(k: number) {
  if (k <= 0) return AMBER;
  if (k >= 1) return ASPHALT;
  const ch = (i: number) => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`.toUpperCase();
}

/** Per ring: opacity, scale about the code's centre (arrives a little inward, settles outward), colour. */
export type RingFrame = { opacity: number; scale: number; color: string };
export type RevealFrame = {
  /** How much of each finder's outline is drawn (0..1 of its 24-module perimeter). */
  finderOutline: number;
  /** Scale (0..1) of each finder's 3×3 centre. */
  finderCentre: number;
  finderColor: string;
  rings: RingFrame[];
  /** Opacity (0..1) of the soft amber border that flashes once when the code settles. */
  flash: number;
};

const RING_FROM = 350; // first ring lights up
const RING_SETTLE = 420; // each ring: arrive amber and small, settle to asphalt, full size
const RING_TO = 1700; // last ring settled

/**
 * One frame of the reveal at `t` (0..1 of QR_REVEAL_MS), for `ringCount` rings (centre first).
 * 0–500 ms finders lock on (outline drawn, then centre), 350–1700 ms rings ripple out from the centre,
 * 1600–2200 ms finders cool to asphalt and a soft amber border fades. t = 1 is the still, scannable code.
 */
export function revealFrame(t: number, ringCount: number): RevealFrame {
  const ms = clamp01(t) * QR_REVEAL_MS;
  const last = RING_TO - RING_SETTLE;
  const rings: RingFrame[] = [];
  for (let i = 0; i < ringCount; i++) {
    const start = RING_FROM + (ringCount > 1 ? i / (ringCount - 1) : 0) * (last - RING_FROM);
    const p = phase(ms, start, start + RING_SETTLE);
    const e = easeEnter(p);
    rings.push({
      opacity: easeEnter(clamp01(p / 0.45)),
      scale: 0.94 + 0.06 * e,
      color: amberToAsphalt(easeEnter(phase(p, 0.2, 1))),
    });
  }
  const flashIn = phase(ms, 1600, 1720);
  const flashOut = phase(ms, 1720, 2200);
  return {
    finderOutline: easeEnter(phase(ms, 0, 380)),
    finderCentre: easeEnter(phase(ms, 300, 500)),
    finderColor: amberToAsphalt(easeEnter(phase(ms, 1600, 2200))),
    rings,
    flash: 0.85 * flashIn * (1 - easeEnter(flashOut)),
  };
}
