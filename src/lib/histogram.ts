// Histograma RGB + luminancia del documento compuesto, calculado sobre una versión reducida.
export interface Histo {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
}

let current: Histo | null = null;
const listeners = new Set<(h: Histo) => void>();
const small = document.createElement('canvas');
let timer = 0;

export const onHisto = (fn: (h: Histo) => void) => {
  listeners.add(fn);
  if (current) fn(current);
  return () => {
    listeners.delete(fn);
  };
};

export function scheduleHisto(src: HTMLCanvasElement) {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const k = Math.min(1, 256 / Math.max(src.width, src.height));
    small.width = Math.max(1, Math.round(src.width * k));
    small.height = Math.max(1, Math.round(src.height * k));
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, small.width, small.height);
    ctx.drawImage(src, 0, 0, small.width, small.height);
    const d = ctx.getImageData(0, 0, small.width, small.height).data;
    const h: Histo = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      h.r[d[i]]++;
      h.g[d[i + 1]]++;
      h.b[d[i + 2]]++;
      h.l[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
    }
    current = h;
    listeners.forEach((fn) => fn(h));
  }, 120);
}
