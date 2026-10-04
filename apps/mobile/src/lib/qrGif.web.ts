// Website only: the animated business card as a looping GIF (to send on WhatsApp, post, or show on a tablet).
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import type { QrCardContent } from '@/components/AnimatedQrCard';
import { AMBER, buildQrReveal, FINDER_OUTLINE_LENGTH, finderOutlinePath, IVORY, QR_REVEAL_MS, QUIET, revealFrame } from './qrReveal';
import { fonts, night } from './theme';

const W = 600;
const DELAY = 60; // ms per frame
const FRAMES = Math.round(QR_REVEAL_MS / DELAY);

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // keeps the canvas exportable; without CORS the photo is left out
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Builds the GIF: the same reveal as the live card (qrReveal), then the finished card holds for 3 seconds, and loops. */
export async function exportQrGif(content: QrCardContent): Promise<Blob> {
  const { size, finders, rings } = buildQrReveal(content.url);
  const ringPaths = rings.map((r) => new Path2D(r.d));
  const finderPaths = finders.map(({ x, y }) => new Path2D(finderOutlinePath(x, y)));
  const photo = content.photoUrl ? await loadImage(content.photoUrl) : null;
  const pad = 52;
  const cover = photo ? Math.round(W * 0.46) : 0;
  const qrTop = (photo ? cover - 30 : 48) + 58;
  const qrSide = W - pad * 2;
  const H = qrTop + qrSide + 40 + 150;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();

  const draw = (t: number) => {
    ctx.fillStyle = night.paper;
    ctx.fillRect(0, 0, W, H);
    if (photo) {
      // cover: fill the top band, cropping the photo
      const scale = Math.max(W / photo.width, cover / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      ctx.drawImage(photo, (W - w) / 2, (cover - h) / 2, w, h);
      const fade = ctx.createLinearGradient(0, cover * 0.35, 0, cover);
      fade.addColorStop(0, 'rgba(13,15,18,0)');
      fade.addColorStop(1, night.paper);
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, W, cover);
    }
    ctx.fillStyle = night.text;
    ctx.font = `56px ${fonts.display}, serif`;
    ctx.fillText(content.brand, pad, qrTop - 22);

    ctx.fillStyle = IVORY;
    ctx.fillRect(pad, qrTop, qrSide, qrSide);
    const unit = qrSide / (size + QUIET * 2);
    const f = revealFrame(t, rings.length);
    const mid = size / 2;
    ctx.save();
    ctx.translate(pad + QUIET * unit, qrTop + QUIET * unit);
    ctx.scale(unit, unit);
    rings.forEach((_, i) => {
      const r = f.rings[i];
      if (r.opacity <= 0) return;
      const shift = mid * (1 - r.scale);
      ctx.save();
      ctx.globalAlpha = r.opacity;
      ctx.fillStyle = r.color;
      ctx.transform(r.scale, 0, 0, r.scale, shift, shift);
      ctx.fill(ringPaths[i]);
      ctx.restore();
    });
    ctx.strokeStyle = f.finderColor;
    ctx.fillStyle = f.finderColor;
    ctx.lineWidth = 1;
    ctx.lineCap = 'square';
    ctx.setLineDash(f.finderOutline < 1 ? [f.finderOutline * FINDER_OUTLINE_LENGTH, FINDER_OUTLINE_LENGTH] : []);
    finders.forEach(({ x, y }, i) => {
      if (f.finderOutline > 0) ctx.stroke(finderPaths[i]);
      const c = 3 * f.finderCentre;
      if (c > 0) ctx.fillRect(x + 3.5 - c / 2, y + 3.5 - c / 2, c, c);
    });
    ctx.setLineDash([]);
    ctx.restore();
    if (f.flash > 0) {
      ctx.globalAlpha = f.flash;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 4;
      ctx.strokeRect(pad + 2, qrTop + 2, qrSide - 4, qrSide - 4);
      ctx.globalAlpha = 1;
    }

    let y = qrTop + qrSide + 52;
    if (content.driverName) {
      ctx.fillStyle = night.text;
      ctx.font = `34px ${fonts.semibold}, sans-serif`;
      ctx.fillText(content.driverName, pad, y);
      y += 36;
    }
    if (content.vehicleLine) {
      ctx.fillStyle = night.muted;
      ctx.font = `22px ${fonts.monoMedium}, monospace`;
      ctx.fillText(content.vehicleLine.toUpperCase(), pad, y);
      y += 34;
    }
    ctx.fillStyle = night.primary;
    ctx.font = `24px ${fonts.bold}, sans-serif`;
    ctx.fillText(content.scanHint, pad, y + 8);
  };

  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    draw(t);
    const { data } = ctx.getImageData(0, 0, W, H);
    const palette = quantize(data, 128);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: i === FRAMES ? 3000 : DELAY, repeat: 0 });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}
