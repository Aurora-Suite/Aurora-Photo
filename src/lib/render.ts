import type { Doc, Layer, TextStyle } from '../types';
import { developer, isNeutral } from './develop';
import { mkey, newCanvas, pixels, pkey, version } from './pixels';

// ---------- Imágenes fuente ----------

export const srcUrl = (src: string) => (src.startsWith('data:') || src.startsWith('blob:') ? src : 'media://local/' + encodeURIComponent(src));

const images = new Map<string, HTMLImageElement>();
const assetListeners = new Set<() => void>();
export const onAsset = (fn: () => void) => {
  assetListeners.add(fn);
  return () => {
    assetListeners.delete(fn);
  };
};

export function getImage(src: string): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => assetListeners.forEach((fn) => fn());
    img.src = srcUrl(src);
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      images.set(src, img);
      ok(img);
    };
    img.onerror = () => fail(new Error('No se pudo abrir la imagen'));
    img.src = srcUrl(src);
  });
}

// ---------- Texto ----------

export const fontString = (t: TextStyle, size = t.size) => `${t.italic ? 'italic ' : ''}${t.weight} ${size}px "${t.font}", "Inter Variable", sans-serif`;

const measureCtx = document.createElement('canvas').getContext('2d')!;

// Tamaño natural de una capa de texto (en píxeles del documento a escala 1).
export function measureText(t: TextStyle) {
  measureCtx.font = fontString(t);
  (measureCtx as any).letterSpacing = `${t.letterSpacing}px`;
  const lines = t.content.split('\n');
  const width = Math.max(1, ...lines.map((l) => measureCtx.measureText(l || ' ').width));
  const pad = textPad(t);
  return { w: Math.ceil(width + pad * 2), h: Math.ceil(lines.length * t.size * t.lineHeight + pad * 2) };
}

const textPad = (t: TextStyle) => Math.ceil(t.strokeWidth + (t.background ? t.size * 0.35 : 0) + (t.shadow ? t.size * 0.25 : 0) + 2);

function renderText(t: TextStyle, w: number, h: number, k: number) {
  const c = newCanvas(w * k, h * k);
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  const pad = textPad(t);
  const lines = t.content.split('\n');
  if (t.background) {
    ctx.fillStyle = t.background;
    const inset = t.shadow ? t.size * 0.25 : 0;
    ctx.beginPath();
    ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, t.size * 0.22);
    ctx.fill();
  }
  ctx.font = fontString(t);
  (ctx as any).letterSpacing = `${t.letterSpacing}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = t.align;
  ctx.lineJoin = 'round';
  const x = t.align === 'left' ? pad : t.align === 'right' ? w - pad : w / 2;
  lines.forEach((line, i) => {
    const y = pad + (i + 0.5) * t.size * t.lineHeight;
    if (t.shadow) {
      ctx.save();
      ctx.shadowColor = `rgba(0,0,0,${0.35 + 0.5 * t.shadow})`;
      ctx.shadowBlur = t.size * 0.18 * k;
      ctx.shadowOffsetY = t.size * 0.06 * k;
      ctx.fillStyle = t.color;
      ctx.fillText(line, x, y);
      ctx.restore();
    }
    if (t.strokeWidth > 0) {
      ctx.strokeStyle = t.strokeColor;
      ctx.lineWidth = t.strokeWidth * 2;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, x, y);
  });
  return c;
}

// ---------- Contenido de capa (con revelado y máscara), en caché ----------

type Entry = { key: string; canvas: CanvasImageSource };
const cache = new Map<string, Entry>();

export interface RenderOpts {
  maxDim: number; // resolución máxima del revelado (la vista previa limita, la exportación no)
  original?: boolean; // vista «antes»: sin revelado
  textScale?: number; // densidad del texto rasterizado
  cacheTag?: string;
}

function source(layer: Layer): (CanvasImageSource & { width: number; height: number }) | null {
  if (layer.kind === 'image' && layer.src) return getImage(layer.src) as any;
  if (layer.kind === 'paint') return pixels.get(pkey(layer.id)) ?? null;
  return null;
}

export function layerContent(layer: Layer, o: RenderOpts): CanvasImageSource | null {
  const tag = o.cacheTag ?? 'view';
  if (layer.kind === 'text' && layer.text) {
    const k = Math.min(4, Math.max(0.25, o.textScale ?? 1));
    const key = JSON.stringify(layer.text) + layer.w + 'x' + layer.h + '@' + k.toFixed(2);
    const e = cache.get(tag + layer.id);
    if (e?.key === key) return e.canvas;
    const canvas = renderText(layer.text, layer.w, layer.h, k);
    cache.set(tag + layer.id, { key, canvas });
    return canvas;
  }
  const src = source(layer);
  if (!src) return null;
  const sw = (src as any).naturalWidth || src.width;
  const sh = (src as any).naturalHeight || src.height;
  const fit = Math.min(1, o.maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * fit));
  const h = Math.max(1, Math.round(sh * fit));
  const masked = layer.hasMask && pixels.has(mkey(layer.id));
  const neutral = o.original || isNeutral(layer.grade, layer.fx);
  if (neutral && !masked) return src;
  const key = [layer.src, version(pkey(layer.id)), version(mkey(layer.id)), masked, o.original, w, h, JSON.stringify(layer.grade), JSON.stringify(layer.fx)].join('|');
  const e = cache.get(tag + layer.id);
  if (e?.key === key) return e.canvas;
  let out: HTMLCanvasElement;
  if (neutral) {
    out = newCanvas(w, h);
    out.getContext('2d')!.drawImage(src, 0, 0, w, h);
  } else {
    out = developer().run(src as TexImageSource, w, h, layer.grade, layer.fx, (layer.id.charCodeAt(0) % 97) + 0.5);
  }
  if (masked) {
    const ctx = out.getContext('2d')!;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(pixels.get(mkey(layer.id))!, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  cache.set(tag + layer.id, { key, canvas: out });
  return out;
}

export const forget = (ids: Set<string>) => {
  for (const k of cache.keys()) if (!ids.has(k.replace(/^(view|export|thumb|preset)/, ''))) cache.delete(k);
};

// ---------- Composición ----------

export function applyTransform(ctx: CanvasRenderingContext2D, l: Layer) {
  ctx.translate(l.x, l.y);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale * (l.flipH ? -1 : 1), l.scale * (l.flipV ? -1 : 1));
}

export function drawShape(ctx: CanvasRenderingContext2D, l: Layer) {
  const s = l.shape!;
  ctx.beginPath();
  if (s.type === 'ellipse') ctx.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(-l.w / 2, -l.h / 2, l.w, l.h, Math.min(s.radius, l.w / 2, l.h / 2));
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke && s.strokeWidth > 0) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.strokeWidth;
    ctx.stroke();
  }
}

export function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, o: RenderOpts) {
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend;
  applyTransform(ctx, l);
  if (l.kind === 'shape' && l.shape) drawShape(ctx, l);
  else {
    const c = layerContent(l, o);
    if (c) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, -l.w / 2, -l.h / 2, l.w, l.h);
    }
  }
  ctx.restore();
}

// Dibuja el documento completo en `ctx` (ya dimensionado a doc × scale).
export function composite(ctx: CanvasRenderingContext2D, doc: Doc, layers: Layer[], scale: number, o: RenderOpts) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (doc.background !== 'transparent') {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const l of layers) if (l.visible) drawLayer(ctx, l, o);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Render final a tamaño de exportación (sin límite de vista previa).
export function renderExport(doc: Doc, layers: Layer[], scale: number, background?: string) {
  const c = newCanvas(doc.width * scale, doc.height * scale);
  const ctx = c.getContext('2d')!;
  const d = background ? { ...doc, background } : doc;
  composite(ctx, d, layers, scale, { maxDim: developer().maxSize, textScale: scale * Math.max(...layers.map((l) => l.scale), 1), cacheTag: 'export' });
  return c;
}

// Esquinas de la capa en coordenadas del documento (para selección y selección por clic).
export function corners(l: Layer): [number, number][] {
  const a = (l.rotation * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const hw = (l.w * l.scale) / 2, hh = (l.h * l.scale) / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [l.x + x * cos - y * sin, l.y + x * sin + y * cos]);
}

// Punto del documento → coordenadas locales de la capa (píxeles de su contenido natural).
export function toLocal(l: Layer, x: number, y: number): [number, number] {
  const a = (-l.rotation * Math.PI) / 180;
  const dx = x - l.x, dy = y - l.y;
  let lx = (dx * Math.cos(a) - dy * Math.sin(a)) / l.scale;
  let ly = (dx * Math.sin(a) + dy * Math.cos(a)) / l.scale;
  if (l.flipH) lx = -lx;
  if (l.flipV) ly = -ly;
  return [lx + l.w / 2, ly + l.h / 2];
}

export function hitTest(l: Layer, x: number, y: number) {
  const [lx, ly] = toLocal(l, x, y);
  return lx >= 0 && ly >= 0 && lx <= l.w && ly <= l.h;
}
