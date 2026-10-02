import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { lineProgress, qrLines } from '../qrLines';

describe('QR code as lines', () => {
  it('covers exactly the dark modules of the code', () => {
    const text = 'https://elysee-chauffeur.example/book';
    const { size, lines } = qrLines(text);
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    expect(size).toBe(qr.modules.size);
    const painted = new Set<number>();
    for (const l of lines) for (let c = l.x; c < l.x + l.length; c++) painted.add(l.row * size + c);
    for (let i = 0; i < size * size; i++) expect(painted.has(i)).toBe(qr.modules.data[i] === 1);
  });

  it('draws the top row first and ends with every line in place', () => {
    expect(lineProgress(0, 29, 0.2)).toBeGreaterThan(lineProgress(28, 29, 0.2));
    expect(lineProgress(28, 29, 1)).toBe(1);
    expect(lineProgress(0, 29, 0)).toBe(0);
  });
});
