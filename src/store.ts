import { create } from 'zustand';
import type { Doc, Fx, Grade, Layer, ProjectFile, ShapeStyle, TextStyle, Tool } from './types';
import { defaultFx, defaultGrade } from './lib/color';
import { cloneCanvas, loadDataUrl, mkey, newCanvas, pixels, pkey, setPixels, touch, whiteMask } from './lib/pixels';
import { measureText } from './lib/render';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultText = (): TextStyle => ({
  content: 'Tu texto',
  font: 'Inter Variable',
  size: 120,
  weight: 800,
  italic: false,
  color: '#ffffff',
  align: 'center',
  lineHeight: 1.1,
  letterSpacing: 0,
  strokeColor: '#000000',
  strokeWidth: 0,
  shadow: 0.6,
  background: '',
});

export const defaultShape = (type: ShapeStyle['type'] = 'rect'): ShapeStyle => ({ type, fill: '#2cc9f5', stroke: '', strokeWidth: 0, radius: 0 });

const baseLayer = (): Omit<Layer, 'id' | 'name' | 'kind' | 'w' | 'h' | 'x' | 'y'> => ({
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
});

interface Snapshot {
  doc: Doc | null;
  layers: Layer[];
  selected: string | null;
  pix: Map<string, HTMLCanvasElement | null>;
}

export interface Brush {
  size: number;
  hardness: number;
  opacity: number;
  color: string;
}

export interface CropState {
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: number | null; // null = libre
}

interface State {
  doc: Doc | null;
  layers: Layer[];
  selected: string | null;
  tool: Tool;
  brush: Brush;
  shapeType: ShapeStyle['type'];
  crop: CropState | null;
  zoom: number;
  panX: number;
  panY: number;
  fitTick: number;
  compare: boolean;
  filePath: string | null;
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];
  toast: string | null;
  exportOpen: boolean;
  newOpen: boolean;
  clipboardLook: { grade: Grade; fx: Fx } | null;

  set: (p: Partial<State>) => void;
  notify: (msg: string) => void;
  commit: (key?: string, pixKeys?: string[]) => void;
  undo: () => void;
  redo: () => void;
  newDoc: (doc: Doc) => void;
  closeDoc: () => void;
  addLayer: (layer: Layer, above?: string | null) => void;
  addImageLayer: (src: string, name: string, w: number, h: number, fit?: boolean) => string;
  addPaintLayer: () => string;
  addTextLayer: (x?: number, y?: number) => string;
  addShapeLayer: (x: number, y: number, w: number, h: number, type?: ShapeStyle['type']) => string;
  updateLayer: (id: string, patch: Partial<Layer>, key?: string) => void;
  updateGrade: (id: string, patch: Partial<Grade>, key?: string) => void;
  updateFx: (id: string, patch: Partial<Fx>, key?: string) => void;
  updateText: (id: string, patch: Partial<TextStyle>, key?: string) => void;
  updateShape: (id: string, patch: Partial<ShapeStyle>, key?: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorder: (id: string, toIndex: number) => void;
  addMask: (id: string) => void;
  removeMask: (id: string) => void;
  applyCrop: () => void;
  rotateDoc: (dir: 1 | -1) => void;
  flipDoc: (axis: 'h' | 'v') => void;
  resizeCanvas: (w: number, h: number, anchor?: [number, number]) => void;
  resizeImage: (w: number, h: number) => void;
  loadProject: (p: ProjectFile, filePath?: string | null) => Promise<void>;
  toProject: () => ProjectFile;
}

let lastKey = '';
let lastTime = 0;

const layerPixKeys = (l: Layer) => [pkey(l.id), mkey(l.id)].filter((k) => pixels.has(k));

export const useStore = create<State>((set, get) => ({
  doc: null,
  layers: [],
  selected: null,
  tool: 'move',
  brush: { size: 60, hardness: 0.7, opacity: 1, color: '#ffffff' },
  shapeType: 'rect',
  crop: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  fitTick: 0,
  compare: false,
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  toast: null,
  exportOpen: false,
  newOpen: false,
  clipboardLook: null,

  set: (p) => set(p),
  notify: (msg) => {
    set({ toast: msg });
    const at = Date.now();
    (get() as any)._toastAt = at;
    setTimeout(() => (get() as any)._toastAt === at && set({ toast: null }), 2600);
  },

  // Guarda el estado actual en el historial. `key` agrupa cambios seguidos (arrastrar un deslizador = 1 paso).
  commit: (key, pixKeys = []) => {
    const now = Date.now();
    if (key && key === lastKey && now - lastTime < 900) {
      lastTime = now;
      set({ dirty: true });
      return;
    }
    lastKey = key ?? '';
    lastTime = now;
    const s = get();
    const pix = new Map<string, HTMLCanvasElement | null>();
    for (const k of pixKeys) pix.set(k, pixels.has(k) ? cloneCanvas(pixels.get(k)!) : null);
    set({ past: [...s.past.slice(-49), { doc: s.doc, layers: s.layers, selected: s.selected, pix }], future: [], dirty: true });
  },

  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const cur: Snapshot = { doc: s.doc, layers: s.layers, selected: s.selected, pix: swapPixels(prev.pix) };
    lastKey = '';
    set({ doc: prev.doc, layers: prev.layers, selected: prev.selected, past: s.past.slice(0, -1), future: [cur, ...s.future], dirty: true, crop: null });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const cur: Snapshot = { doc: s.doc, layers: s.layers, selected: s.selected, pix: swapPixels(next.pix) };
    lastKey = '';
    set({ doc: next.doc, layers: next.layers, selected: next.selected, future: s.future.slice(1), past: [...s.past, cur], dirty: true, crop: null });
  },

  newDoc: (doc) => {
    pixels.clear();
    set({ doc, layers: [], selected: null, past: [], future: [], filePath: null, dirty: false, crop: null, tool: 'move', fitTick: get().fitTick + 1, newOpen: false });
  },
  closeDoc: () => {
    pixels.clear();
    set({ doc: null, layers: [], selected: null, past: [], future: [], filePath: null, dirty: false, crop: null });
    window.api.clearAutosave().catch(() => {});
  },

  addLayer: (layer, above) => {
    const s = get();
    s.commit();
    const ref = above === undefined ? s.selected : above;
    const i = ref ? s.layers.findIndex((l) => l.id === ref) : -1;
    const layers = [...s.layers];
    layers.splice(i >= 0 ? i + 1 : layers.length, 0, layer);
    set({ layers, selected: layer.id });
  },

  addImageLayer: (src, name, w, h, fit = true) => {
    const doc = get().doc!;
    const scale = fit ? Math.min(1, doc.width / w, doc.height / h) : 1;
    const id = uid();
    get().addLayer({ ...baseLayer(), id, name, kind: 'image', src, w, h, x: doc.width / 2, y: doc.height / 2, scale, grade: defaultGrade(), fx: defaultFx() });
    return id;
  },

  addPaintLayer: () => {
    const doc = get().doc!;
    const id = uid();
    setPixels(pkey(id), newCanvas(doc.width, doc.height));
    const n = get().layers.filter((l) => l.kind === 'paint').length + 1;
    get().addLayer({ ...baseLayer(), id, name: `Pintura ${n}`, kind: 'paint', w: doc.width, h: doc.height, x: doc.width / 2, y: doc.height / 2, grade: defaultGrade(), fx: defaultFx() });
    return id;
  },

  addTextLayer: (x, y) => {
    const doc = get().doc!;
    const text = { ...defaultText(), size: Math.round(Math.max(24, Math.min(doc.width, doc.height) * 0.09)) };
    const { w, h } = measureText(text);
    const id = uid();
    get().addLayer({ ...baseLayer(), id, name: 'Texto', kind: 'text', text, w, h, x: x ?? doc.width / 2, y: y ?? doc.height / 2 });
    return id;
  },

  addShapeLayer: (x, y, w, h, type) => {
    const t = type ?? get().shapeType;
    const id = uid();
    get().addLayer({ ...baseLayer(), id, name: t === 'ellipse' ? 'Elipse' : 'Rectángulo', kind: 'shape', shape: defaultShape(t), w: Math.max(2, w), h: Math.max(2, h), x, y });
    return id;
  },

  updateLayer: (id, patch, key) => {
    get().commit(key ? `${key}:${id}` : undefined);
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  },
  updateGrade: (id, patch, key) => {
    get().commit(key ? `g-${key}:${id}` : undefined);
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, grade: { ...(l.grade ?? defaultGrade()), ...patch } } : l)) }));
  },
  updateFx: (id, patch, key) => {
    get().commit(key ? `f-${key}:${id}` : undefined);
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, fx: { ...(l.fx ?? defaultFx()), ...patch } } : l)) }));
  },
  updateText: (id, patch, key) => {
    get().commit(key ? `t-${key}:${id}` : undefined);
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== id || !l.text) return l;
        const text = { ...l.text, ...patch };
        return { ...l, text, ...measureText(text) };
      }),
    }));
  },
  updateShape: (id, patch, key) => {
    get().commit(key ? `s-${key}:${id}` : undefined);
    set((s) => ({ layers: s.layers.map((l) => (l.id === id && l.shape ? { ...l, shape: { ...l.shape, ...patch } } : l)) }));
  },

  removeLayer: (id) => {
    const s = get();
    const l = s.layers.find((x) => x.id === id);
    if (!l) return;
    s.commit(undefined, layerPixKeys(l));
    const i = s.layers.indexOf(l);
    const layers = s.layers.filter((x) => x.id !== id);
    set({ layers, selected: layers[Math.min(i, layers.length - 1)]?.id ?? null });
  },

  duplicateLayer: (id) => {
    const s = get();
    const l = s.layers.find((x) => x.id === id);
    if (!l) return;
    const nid = uid();
    if (pixels.has(pkey(id))) setPixels(pkey(nid), cloneCanvas(pixels.get(pkey(id))!));
    if (pixels.has(mkey(id))) setPixels(mkey(nid), cloneCanvas(pixels.get(mkey(id))!));
    s.addLayer({ ...structuredClone(l), id: nid, name: `${l.name} copia`, x: l.x + 20, y: l.y + 20 }, id);
  },

  reorder: (id, toIndex) => {
    const s = get();
    const from = s.layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const to = Math.max(0, Math.min(s.layers.length - 1, toIndex));
    if (from === to) return;
    s.commit();
    const layers = [...s.layers];
    const [l] = layers.splice(from, 1);
    layers.splice(to, 0, l);
    set({ layers });
  },

  addMask: (id) => {
    const l = get().layers.find((x) => x.id === id);
    if (!l || (l.kind !== 'image' && l.kind !== 'paint')) return;
    get().commit(undefined, [mkey(id)]);
    setPixels(mkey(id), whiteMask(l.w, l.h));
    set((s) => ({ layers: s.layers.map((x) => (x.id === id ? { ...x, hasMask: true } : x)) }));
  },
  removeMask: (id) => {
    get().commit(undefined, [mkey(id)]);
    pixels.delete(mkey(id));
    touch(mkey(id));
    set((s) => ({ layers: s.layers.map((x) => (x.id === id ? { ...x, hasMask: false } : x)) }));
  },

  applyCrop: () => {
    const s = get();
    if (!s.crop || !s.doc) return;
    const c = s.crop;
    const w = Math.max(1, Math.round(c.w));
    const h = Math.max(1, Math.round(c.h));
    s.commit();
    set({
      doc: { ...s.doc, width: w, height: h },
      layers: s.layers.map((l) => ({ ...l, x: l.x - Math.round(c.x), y: l.y - Math.round(c.y) })),
      crop: null,
      tool: 'move',
      fitTick: s.fitTick + 1,
    });
  },

  rotateDoc: (dir) => {
    const s = get();
    if (!s.doc) return;
    s.commit();
    const { width: W, height: H } = s.doc;
    set({
      doc: { ...s.doc, width: H, height: W },
      layers: s.layers.map((l) => ({
        ...l,
        x: dir > 0 ? H - l.y : l.y,
        y: dir > 0 ? l.x : W - l.x,
        rotation: (((l.rotation + 90 * dir) % 360) + 360) % 360,
      })),
      fitTick: s.fitTick + 1,
    });
  },

  flipDoc: (axis) => {
    const s = get();
    if (!s.doc) return;
    s.commit();
    const { width: W, height: H } = s.doc;
    set({
      layers: s.layers.map((l) =>
        axis === 'h' ? { ...l, x: W - l.x, flipH: !l.flipH, rotation: (360 - l.rotation) % 360 } : { ...l, y: H - l.y, flipV: !l.flipV, rotation: (360 - l.rotation) % 360 }
      ),
    });
  },

  resizeCanvas: (w, h, anchor = [0.5, 0.5]) => {
    const s = get();
    if (!s.doc) return;
    s.commit();
    const dx = (w - s.doc.width) * anchor[0];
    const dy = (h - s.doc.height) * anchor[1];
    set({ doc: { ...s.doc, width: Math.round(w), height: Math.round(h) }, layers: s.layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })), fitTick: s.fitTick + 1 });
  },

  resizeImage: (w, h) => {
    const s = get();
    if (!s.doc) return;
    s.commit();
    const kx = w / s.doc.width;
    const ky = h / s.doc.height;
    const k = Math.min(kx, ky);
    set({ doc: { ...s.doc, width: Math.round(w), height: Math.round(h) }, layers: s.layers.map((l) => ({ ...l, x: l.x * kx, y: l.y * ky, scale: l.scale * k })), fitTick: s.fitTick + 1 });
  },

  loadProject: async (p, filePath = null) => {
    pixels.clear();
    for (const [id, url] of Object.entries(p.pixels || {})) setPixels(pkey(id), await loadDataUrl(url));
    for (const [id, url] of Object.entries(p.masks || {})) setPixels(mkey(id), await loadDataUrl(url));
    const layers = p.layers.map((l) => ({ ...l, grade: l.grade ? { ...defaultGrade(), ...l.grade } : l.grade, fx: l.fx ? { ...defaultFx(), ...l.fx } : l.fx }));
    // Capa de pintura sin píxeles guardados: lienzo vacío.
    for (const l of layers) if (l.kind === 'paint' && !pixels.has(pkey(l.id))) setPixels(pkey(l.id), newCanvas(l.w, l.h));
    set({ doc: p.doc, layers, selected: layers[layers.length - 1]?.id ?? null, past: [], future: [], filePath, dirty: false, crop: null, fitTick: get().fitTick + 1 });
  },

  toProject: () => {
    const s = get();
    const px: Record<string, string> = {};
    const mk: Record<string, string> = {};
    for (const l of s.layers) {
      if (pixels.has(pkey(l.id))) px[l.id] = pixels.get(pkey(l.id))!.toDataURL('image/png');
      if (l.hasMask && pixels.has(mkey(l.id))) mk[l.id] = pixels.get(mkey(l.id))!.toDataURL('image/png');
    }
    return { version: 1, doc: s.doc!, layers: s.layers, pixels: px, masks: mk };
  },
}));

// Intercambia los píxeles del historial con los actuales y devuelve los actuales (para rehacer/deshacer).
function swapPixels(pix: Map<string, HTMLCanvasElement | null>) {
  const cur = new Map<string, HTMLCanvasElement | null>();
  for (const [k, c] of pix) {
    cur.set(k, pixels.has(k) ? pixels.get(k)! : null);
    if (c) pixels.set(k, c);
    else pixels.delete(k);
    touch(k);
  }
  return cur;
}

export const selectedLayer = (s: { layers: Layer[]; selected: string | null }) => s.layers.find((l) => l.id === s.selected) ?? null;
