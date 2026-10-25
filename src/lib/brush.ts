import type { Layer } from '../types';
import { cloneCanvas, newCanvas, pixels, touch } from './pixels';
import { toLocal } from './render';

export type StrokeMode = 'paint' | 'erase' | 'restore';

// Trazo de pincel: los toques se acumulan a opacidad completa en un lienzo aparte y se componen
// sobre la copia inicial con la opacidad del pincel (como Photoshop: el trazo no se oscurece al solaparse).
export class Stroke {
  private base: HTMLCanvasElement;
  private strokeC: HTMLCanvasElement;
  private stamp: HTMLCanvasElement;
  private last: [number, number] | null = null;
  private spacing: number;

  constructor(
    private key: string,
    private layer: Layer,
    private mode: StrokeMode,
    sizeDoc: number,
    hardness: number,
    private opacity: number,
    color: string
  ) {
    const target = pixels.get(key)!;
    this.base = cloneCanvas(target);
    this.strokeC = newCanvas(target.width, target.height);
    // Tamaño en píxeles del lienzo de la capa (contenido natural × resolución del lienzo).
    const k = (target.width / layer.w) / layer.scale;
    const d = Math.max(1, sizeDoc * k);
    this.spacing = Math.max(0.5, d * 0.1);
    this.stamp = makeStamp(d, hardness, mode === 'paint' ? color : '#ffffff');
  }

  private toPx(x: number, y: number): [number, number] {
    const target = pixels.get(this.key)!;
    const [lx, ly] = toLocal(this.layer, x, y);
    return [(lx * target.width) / this.layer.w, (ly * target.height) / this.layer.h];
  }

  add(x: number, y: number) {
    const p = this.toPx(x, y);
    const ctx = this.strokeC.getContext('2d')!;
    const r = this.stamp.width / 2;
    const dab = (px: number, py: number) => ctx.drawImage(this.stamp, px - r, py - r);
    if (!this.last) dab(p[0], p[1]);
    else {
      const [lx, ly] = this.last;
      const dist = Math.hypot(p[0] - lx, p[1] - ly);
      const n = Math.floor(dist / this.spacing);
      for (let i = 1; i <= n; i++) dab(lx + ((p[0] - lx) * i) / n, ly + ((p[1] - ly) * i) / n);
      if (n === 0) return;
    }
    this.last = p;
    this.flush();
  }

  private flush() {
    const target = pixels.get(this.key)!;
    const ctx = target.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.base, 0, 0);
    ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(this.strokeC, 0, 0);
    ctx.restore();
    touch(this.key);
  }
}

function makeStamp(d: number, hardness: number, color: string) {
  const size = Math.ceil(d) + 2;
  const c = newCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const r = d / 2;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, r);
  const h = Math.min(0.98, Math.max(0, hardness));
  g.addColorStop(0, color);
  g.addColorStop(h, color);
  g.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function hexAlpha(hex: string, a: number) {
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
