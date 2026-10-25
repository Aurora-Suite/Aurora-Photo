// Lienzos de píxeles fuera del estado de React: capas de pintura ('p:id') y máscaras de capa ('m:id').
// Cada cambio sube su versión para invalidar las cachés de render.

export const pixels = new Map<string, HTMLCanvasElement>();
const versions = new Map<string, number>();
const listeners = new Set<() => void>();

export const pkey = (id: string) => 'p:' + id;
export const mkey = (id: string) => 'm:' + id;

export function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src: HTMLCanvasElement) {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

export const version = (key: string) => versions.get(key) ?? 0;

export function touch(key: string) {
  versions.set(key, version(key) + 1);
  for (const fn of listeners) fn();
}

export function onPixels(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setPixels(key: string, canvas: HTMLCanvasElement) {
  pixels.set(key, canvas);
  touch(key);
}

export function dropPixels(key: string) {
  pixels.delete(key);
  touch(key);
}

export function loadDataUrl(url: string): Promise<HTMLCanvasElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = newCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext('2d')!.drawImage(img, 0, 0);
      ok(c);
    };
    img.onerror = () => fail(new Error('Imagen no válida'));
    img.src = url;
  });
}

// Máscara nueva: blanca (todo visible) del tamaño natural de la capa.
export function whiteMask(w: number, h: number) {
  const c = newCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
