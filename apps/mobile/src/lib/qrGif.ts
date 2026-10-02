// The GIF export draws on a browser canvas: phones show the live card instead (driver › "Mon QR code").
import type { QrCardContent } from '@/components/AnimatedQrCard';

export const exportQrGif: ((content: QrCardContent) => Promise<Blob>) | null = null as ((c: QrCardContent) => Promise<Blob>) | null;
