// Website only: the animated business card as a looping GIF (to send on WhatsApp, post, or show on a tablet).
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import type { QrCardContent } from '@/components/AnimatedQrCard';
import { lineProgress, qrLines } from './qrLines';
import { fonts, night } from './theme';

const W = 600;
const IVORY = '#EEE9E0';
const QUIET = 3;
const FRAMES = 30;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // keeps the canvas exportable; without CORS the photo is left out
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Builds the GIF: the QR code draws itself line by line, then the finished card holds for 3 seconds, and loops. */
export async function exportQrGif(content: QrCardContent): Promise<Blob> {
  const { size, lines } = qrLines(content.url);
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
    ctx.fillStyle = night.paper;
    for (const l of lines) {
      const p = lineProgress(l.row, size, t);
      if (p <= 0) continue;
      const x = l.x - (1 - p) * (l.x + l.length + QUIET);
      const left = Math.max(pad, pad + (x + QUIET) * unit);
      const right = pad + (x + QUIET + l.length) * unit;
      if (right > left) ctx.fillRect(left, qrTop + (l.row + QUIET) * unit, right - left + 0.5, unit + 0.5);
    }
    if (t < 1) {
      ctx.fillStyle = night.primary;
      ctx.globalAlpha = 1 - t * 0.6;
      ctx.fillRect(pad, qrTop + (QUIET + t * size) * unit - 3, qrSide, 6);
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
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: i === FRAMES ? 3000 : 60, repeat: 0 });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}
