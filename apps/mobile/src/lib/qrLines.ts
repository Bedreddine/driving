// A QR code as horizontal lines: each run of dark modules in a row becomes one line,
// so the code can be drawn as lines sliding in from the left (the animated business card).
import QRCode from 'qrcode';

export type QrLine = { row: number; x: number; length: number };
export type QrLines = { size: number; lines: QrLine[] };

export function qrLines(text: string): QrLines {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const dark = (r: number, c: number) => qr.modules.data[r * size + c] === 1;
  const lines: QrLine[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!dark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && dark(r, c)) c++;
      lines.push({ row: r, x: start, length: c - start });
    }
  }
  return { size, lines };
}

/** Animation timing (0..1 overall): rows start one after the other; each line slides in over `slide` of the time. */
export const QR_ANIMATION_MS = 1800;
const slide = 0.35;

/** How far (0..1) a line of the given row has arrived at overall progress `t`. */
export function lineProgress(row: number, size: number, t: number) {
  const start = (row / Math.max(1, size - 1)) * (1 - slide);
  const p = Math.min(1, Math.max(0, (t - start) / slide));
  return 1 - Math.pow(1 - p, 3); // ease-out
}
