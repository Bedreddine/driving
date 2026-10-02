// gifenc ships no types: the few functions the QR card export uses.
declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts: { palette: number[][]; delay?: number; repeat?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8ClampedArray, maxColors: number): number[][];
  export function applyPalette(rgba: Uint8ClampedArray, palette: number[][]): Uint8Array;
}
