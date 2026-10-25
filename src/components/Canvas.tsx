import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { useStore } from '../store';
import type { Layer } from '../types';
import { composite, corners, hitTest, onAsset } from '../lib/render';
import { mkey, onPixels, pixels, pkey, setPixels, whiteMask } from '../lib/pixels';
import { Stroke } from '../lib/brush';
import { scheduleHisto } from '../lib/histogram';
import { rgbToHex } from '../lib/color';
import { importFiles } from '../lib/actions';

const PREVIEW_MAX = 4096;

type Drag =
  | { mode: 'pan'; sx: number; sy: number; px: number; py: number }
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'scale'; id: string; cx: number; cy: number; d0: number; os: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number; a0: number; or: number }
  | { mode: 'crop-move'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'crop-new'; sx: number; sy: number }
  | { mode: 'crop-handle'; hx: number; hy: number; r0: { x: number; y: number; w: number; h: number } }
  | { mode: 'shape'; sx: number; sy: number; ex: number; ey: number }
  | { mode: 'stroke'; stroke: Stroke };

export default function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const docCanvas = useRef(document.createElement('canvas'));
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [shapeBox, setShapeBoxState] = useState<[number, number, number, number] | null>(null);
  const shapeRef = useRef<[number, number, number, number] | null>(null);
  const setShapeBox = (b: [number, number, number, number] | null) => ((shapeRef.current = b), setShapeBoxState(b));
  const [dragOver, setDragOver] = useState(false);

  const doc = useStore((s) => s.doc);
  const layers = useStore((s) => s.layers);
  const selected = useStore((s) => s.selected);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.zoom);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);
  const crop = useStore((s) => s.crop);
  const brush = useStore((s) => s.brush);
  const compare = useStore((s) => s.compare);
  const fitTick = useStore((s) => s.fitTick);

  // Tamaño del área de trabajo
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Encajar el documento en pantalla
  useEffect(() => {
    if (!doc) return;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTick, size.w > 0 && doc ? `${doc.width}x${doc.height}` : '']);

  // Recorte: al entrar en la herramienta se propone el lienzo completo.
  useEffect(() => {
    const s = useStore.getState();
    if (tool === 'crop' && !s.crop && s.doc) s.set({ crop: { x: 0, y: 0, w: s.doc.width, h: s.doc.height, aspect: null } });
    if (tool !== 'crop' && s.crop) s.set({ crop: null });
  }, [tool]);

  // Redibujado: cambios de estado, píxeles pintados e imágenes que terminan de cargar.
  const raf = useRef(0);
  const drawRef = useRef<() => void>(() => {});
  const schedule = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => drawRef.current());
  };
  useEffect(() => {
    const a = onPixels(schedule);
    const b = onAsset(schedule);
    return () => {
      a();
      b();
    };
  }, []);
  useEffect(schedule, [doc, layers, zoom, panX, panY, size, compare]);

  function fit() {
    const s = useStore.getState();
    if (!s.doc || !wrapRef.current) return;
    const W = wrapRef.current.clientWidth, H = wrapRef.current.clientHeight;
    const z = Math.min((W - 80) / s.doc.width, (H - 80) / s.doc.height);
    s.set({ zoom: z, panX: (W - s.doc.width * z) / 2, panY: (H - s.doc.height * z) / 2 });
  }

  drawRef.current = draw;
  function draw() {
    const s = useStore.getState();
    const view = viewRef.current;
    if (!view) return;
    const dpr = window.devicePixelRatio || 1;
    const W = size.w, H = size.h;
    if (view.width !== Math.round(W * dpr) || view.height !== Math.round(H * dpr)) {
      view.width = Math.round(W * dpr);
      view.height = Math.round(H * dpr);
    }
    const ctx = view.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    if (!s.doc) return;
    const d = s.doc;
    const cs = Math.min(1, PREVIEW_MAX / Math.max(d.width, d.height));
    const dc = docCanvas.current;
    const dw = Math.max(1, Math.round(d.width * cs)), dh = Math.max(1, Math.round(d.height * cs));
    if (dc.width !== dw || dc.height !== dh) {
      dc.width = dw;
      dc.height = dh;
    }
    const dctx = dc.getContext('2d')!;
    composite(dctx, d, s.layers, cs, { maxDim: PREVIEW_MAX, original: s.compare, textScale: Math.max(cs, Math.min(2, s.zoom * dpr)) });
    scheduleHisto(dc);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = s.panX, y = s.panY, w = d.width * s.zoom, h = d.height * s.zoom;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = d.background === 'transparent' ? checker(ctx) : d.background;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    if (d.background === 'transparent') {
      ctx.fillStyle = checker(ctx);
      ctx.fillRect(x, y, w, h);
    }
    ctx.imageSmoothingEnabled = s.zoom / cs < 2.5;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(dc, x, y, w, h);
  }

  // ---------- Coordenadas ----------
  const toDoc = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = wrapRef.current!.getBoundingClientRect();
    const s = useStore.getState();
    return [(e.clientX - r.left - s.panX) / s.zoom, (e.clientY - r.top - s.panY) / s.zoom];
  };
  const toScreen = (x: number, y: number): [number, number] => [x * zoom + panX, y * zoom + panY];

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const s = useStore.getState();
    const z = Math.max(0.02, Math.min(32, s.zoom * factor));
    const k = z / s.zoom;
    s.set({ zoom: z, panX: cx - (cx - s.panX) * k, panY: cy - (cy - s.panY) * k });
  };

  // ---------- Teclado: espacio = mano temporal; Intro/Esc en recorte ----------
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    const down = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      if (e.code === 'Space' && !space.current) {
        space.current = true;
        wrapRef.current?.classList.add('panning');
        e.preventDefault();
      }
      const s = useStore.getState();
      if (s.tool === 'crop' && s.crop) {
        if (e.key === 'Enter') s.applyCrop();
        if (e.key === 'Escape') s.set({ tool: 'move' });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        wrapRef.current?.classList.remove('panning');
      }
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const s = useStore.getState();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      else if (e.shiftKey) s.set({ panX: s.panX - e.deltaY });
      else s.set({ panX: s.panX - e.deltaX, panY: s.panY - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- Puntero ----------
  const pickLayer = (x: number, y: number): Layer | null => {
    const s = useStore.getState();
    for (let i = s.layers.length - 1; i >= 0; i--) {
      const l = s.layers[i];
      if (l.visible && !l.locked && hitTest(l, x, y)) return l;
    }
    return null;
  };

  const startStroke = (x: number, y: number, alt: boolean) => {
    const s = useStore.getState();
    let layer = s.layers.find((l) => l.id === s.selected) ?? null;
    let key: string;
    let mode: 'paint' | 'erase' | 'restore' = 'paint';
    if (s.tool === 'brush') {
      if (!layer || layer.kind !== 'paint' || layer.locked) {
        const id = s.addPaintLayer();
        layer = useStore.getState().layers.find((l) => l.id === id)!;
      }
      key = pkey(layer.id);
    } else {
      if (!layer || layer.locked) return s.notify('Selecciona una capa para borrar');
      if (layer.kind === 'paint') {
        key = pkey(layer.id);
        mode = 'erase';
      } else if (layer.kind === 'image') {
        // En imágenes el borrador trabaja sobre una máscara: no destruye la foto (Alt restaura).
        key = mkey(layer.id);
        mode = alt ? 'restore' : 'erase';
        if (!layer.hasMask || !pixels.has(key)) {
          s.commit(undefined, [key]);
          setPixels(key, whiteMask(layer.w, layer.h));
          s.updateLayer(layer.id, { hasMask: true });
          layer = useStore.getState().layers.find((l) => l.id === layer!.id)!;
        }
      } else return s.notify('El borrador funciona en capas de imagen y de pintura');
    }
    s.commit(undefined, [key]);
    const st = new Stroke(key, layer, mode, s.brush.size, s.brush.hardness, s.brush.opacity, s.brush.color);
    st.add(x, y);
    drag.current = { mode: 'stroke', stroke: st };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = useStore.getState();
    if (!s.doc || e.button === 2) return;
    // Al pulsar en el lienzo, el foco sale de los campos: los atajos de herramienta vuelven a funcionar.
    (document.activeElement as HTMLElement | null)?.blur?.();
    wrapRef.current!.setPointerCapture(e.pointerId);
    const [x, y] = toDoc(e);
    const handle = (e.target as HTMLElement).dataset?.handle;
    if (e.button === 1 || space.current || s.tool === 'hand') {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, px: s.panX, py: s.panY };
      return;
    }
    switch (s.tool) {
      case 'zoom': {
        const r = wrapRef.current!.getBoundingClientRect();
        zoomAt(e.altKey ? 1 / 1.6 : 1.6, e.clientX - r.left, e.clientY - r.top);
        return;
      }
      case 'move': {
        const sel = s.layers.find((l) => l.id === s.selected);
        if (sel && handle === 'rotate') {
          drag.current = { mode: 'rotate', id: sel.id, cx: sel.x, cy: sel.y, a0: Math.atan2(y - sel.y, x - sel.x), or: sel.rotation };
          return;
        }
        if (sel && handle === 'scale') {
          drag.current = { mode: 'scale', id: sel.id, cx: sel.x, cy: sel.y, d0: Math.max(1, Math.hypot(x - sel.x, y - sel.y)), os: sel.scale };
          return;
        }
        const hit = sel && !sel.locked && sel.visible && hitTest(sel, x, y) && !e.ctrlKey ? sel : pickLayer(x, y);
        if (!hit) return s.set({ selected: null });
        if (hit.id !== s.selected) s.set({ selected: hit.id });
        drag.current = { mode: 'move', id: hit.id, sx: x, sy: y, ox: hit.x, oy: hit.y };
        return;
      }
      case 'crop': {
        const c = s.crop;
        if (!c) return;
        if (handle?.startsWith('c')) {
          const [hx, hy] = handle.slice(1).split(',').map(Number);
          drag.current = { mode: 'crop-handle', hx, hy, r0: { x: c.x, y: c.y, w: c.w, h: c.h } };
        } else if (x >= c.x && y >= c.y && x <= c.x + c.w && y <= c.y + c.h) drag.current = { mode: 'crop-move', sx: x, sy: y, ox: c.x, oy: c.y };
        else drag.current = { mode: 'crop-new', sx: x, sy: y };
        return;
      }
      case 'brush':
      case 'eraser':
        return startStroke(x, y, e.altKey);
      case 'text': {
        s.addTextLayer(x, y);
        s.set({ tool: 'move' });
        return;
      }
      case 'shape':
        drag.current = { mode: 'shape', sx: x, sy: y, ex: x, ey: y };
        return;
      case 'eyedropper': {
        const dc = docCanvas.current;
        const k = dc.width / s.doc.width;
        const px = dc.getContext('2d', { willReadFrequently: true })!.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data;
        if (px[3] === 0) return;
        const color = rgbToHex(px[0], px[1], px[2]);
        s.set({ brush: { ...s.brush, color } });
        s.notify(`Color ${color.toUpperCase()} seleccionado`);
        return;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = useStore.getState();
    const [x, y] = toDoc(e);
    if (s.tool === 'brush' || s.tool === 'eraser') setHover([x, y]);
    const d = drag.current;
    if (!d) return;
    switch (d.mode) {
      case 'pan':
        s.set({ panX: d.px + e.clientX - d.sx, panY: d.py + e.clientY - d.sy });
        break;
      case 'move': {
        let nx = d.ox + x - d.sx, ny = d.oy + y - d.sy;
        // Imán al centro del lienzo
        const snap = 8 / s.zoom;
        if (s.doc && Math.abs(nx - s.doc.width / 2) < snap) nx = s.doc.width / 2;
        if (s.doc && Math.abs(ny - s.doc.height / 2) < snap) ny = s.doc.height / 2;
        s.updateLayer(d.id, { x: nx, y: ny }, 'move');
        break;
      }
      case 'scale':
        s.updateLayer(d.id, { scale: Math.max(0.01, (d.os * Math.hypot(x - d.cx, y - d.cy)) / d.d0) }, 'scale');
        break;
      case 'rotate': {
        let r = d.or + ((Math.atan2(y - d.cy, x - d.cx) - d.a0) * 180) / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        s.updateLayer(d.id, { rotation: ((r % 360) + 360) % 360 }, 'rotate');
        break;
      }
      case 'crop-move':
        if (s.crop) s.set({ crop: { ...s.crop, x: d.ox + x - d.sx, y: d.oy + y - d.sy } });
        break;
      case 'crop-new':
      case 'crop-handle': {
        const c = s.crop!;
        let x0: number, y0: number, x1: number, y1: number;
        if (d.mode === 'crop-new') [x0, y0, x1, y1] = [d.sx, d.sy, x, y];
        else {
          const r = d.r0;
          x0 = d.hx === 0 ? x : r.x;
          x1 = d.hx === 2 ? x : r.x + r.w;
          y0 = d.hy === 0 ? y : r.y;
          y1 = d.hy === 2 ? y : r.y + r.h;
        }
        let nx = Math.min(x0, x1), ny = Math.min(y0, y1), nw = Math.abs(x1 - x0), nh = Math.abs(y1 - y0);
        if (c.aspect) {
          // Mantiene la proporción a partir de la dimensión dominante.
          if (d.mode === 'crop-handle' && d.hx === 1) nw = nh * c.aspect;
          else if (d.mode === 'crop-handle' && d.hy === 1) nh = nw / c.aspect;
          else if (nw / nh > c.aspect) nh = nw / c.aspect;
          else nw = nh * c.aspect;
          if (x1 < x0) nx = x0 - nw;
          if (y1 < y0) ny = y0 - nh;
          if (d.mode === 'crop-handle' && d.hx === 1) nx = d.r0.x + (d.r0.w - nw) / 2;
          if (d.mode === 'crop-handle' && d.hy === 1) ny = d.r0.y + (d.r0.h - nh) / 2;
        }
        s.set({ crop: { ...c, x: nx, y: ny, w: Math.max(4, nw), h: Math.max(4, nh) } });
        break;
      }
      case 'shape': {
        d.ex = x;
        d.ey = y;
        let w = Math.abs(x - d.sx), h = Math.abs(y - d.sy);
        if (e.shiftKey) w = h = Math.max(w, h);
        setShapeBox([x < d.sx ? d.sx - w : d.sx, y < d.sy ? d.sy - h : d.sy, w, h]);
        break;
      }
      case 'stroke':
        d.stroke.add(x, y);
        break;
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'shape' && shapeRef.current) {
      const [x, y, w, h] = shapeRef.current;
      const s = useStore.getState();
      if (w > 3 && h > 3) {
        s.addShapeLayer(x + w / 2, y + h / 2, w, h);
        s.set({ tool: 'move' });
      }
      setShapeBox(null);
    }
  };

  // ---------- Overlays ----------
  const sel = layers.find((l) => l.id === selected);
  const showSel = sel && sel.visible && (tool === 'move' || tool === 'text');
  const pts = showSel ? corners(sel).map(([x, y]) => toScreen(x, y)) : [];
  const topMid = pts.length ? [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2] : null;
  const a = sel ? (sel.rotation * Math.PI) / 180 : 0;
  const rotH = topMid ? [topMid[0] + Math.sin(a) * 26, topMid[1] - Math.cos(a) * 26] : null;

  const cursor = tool === 'hand' ? 'grab' : tool === 'zoom' ? 'zoom-in' : tool === 'brush' || tool === 'eraser' ? 'none' : tool === 'text' ? 'text' : tool === 'move' ? 'default' : 'crosshair';

  return (
    <div
      ref={wrapRef}
      className={`stage ${dragOver ? 'drop' : ''}`}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <canvas ref={viewRef} className="stage-canvas" style={{ width: size.w, height: size.h }} />
      <svg className="stage-overlay" width={size.w} height={size.h}>
        {showSel && pts.length === 4 && (
          <g>
            <polygon points={pts.map((p) => p.join(',')).join(' ')} className="sel-box" />
            <line x1={topMid![0]} y1={topMid![1]} x2={rotH![0]} y2={rotH![1]} className="sel-box" />
            {pts.map(([x, y], i) => (
              <rect key={i} data-handle="scale" x={x - 5} y={y - 5} width={10} height={10} className="handle" style={{ cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }} />
            ))}
            <circle data-handle="rotate" cx={rotH![0]} cy={rotH![1]} r={6} className="handle round" style={{ cursor: 'grab' }} />
          </g>
        )}
        {tool === 'crop' && crop && doc && <CropOverlay crop={crop} toScreen={toScreen} w={size.w} h={size.h} />}
        {shapeBox && (
          <g>
            {useStore.getState().shapeType === 'ellipse' ? (
              <ellipse cx={toScreen(shapeBox[0] + shapeBox[2] / 2, 0)[0]} cy={toScreen(0, shapeBox[1] + shapeBox[3] / 2)[1]} rx={(shapeBox[2] * zoom) / 2} ry={(shapeBox[3] * zoom) / 2} className="sel-box" />
            ) : (
              <rect x={toScreen(shapeBox[0], 0)[0]} y={toScreen(0, shapeBox[1])[1]} width={shapeBox[2] * zoom} height={shapeBox[3] * zoom} className="sel-box" />
            )}
          </g>
        )}
        {hover && (tool === 'brush' || tool === 'eraser') && (
          <g pointerEvents="none">
            <circle cx={toScreen(hover[0], 0)[0]} cy={toScreen(0, hover[1])[1]} r={Math.max(1, (brush.size * zoom) / 2)} className="brush-ring" />
            <circle cx={toScreen(hover[0], 0)[0]} cy={toScreen(0, hover[1])[1]} r={Math.max(1, (brush.size * zoom) / 2)} className="brush-ring inner" />
          </g>
        )}
      </svg>
      {compare && <div className="compare-badge">Antes</div>}
      {dragOver && (
        <div className="drop-hint">
          <ImagePlus size={28} />
          Suelta para añadir como capa
        </div>
      )}
    </div>
  );
}

function CropOverlay({ crop, toScreen, w, h }: { crop: { x: number; y: number; w: number; h: number }; toScreen: (x: number, y: number) => [number, number]; w: number; h: number }) {
  const [x0, y0] = toScreen(crop.x, crop.y);
  const [x1, y1] = toScreen(crop.x + crop.w, crop.y + crop.h);
  const cw = x1 - x0, ch = y1 - y0;
  const handles: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
  return (
    <g>
      <path d={`M0 0H${w}V${h}H0Z M${x0} ${y0}V${y1}H${x1}V${y0}Z`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" pointerEvents="none" />
      <rect x={x0} y={y0} width={cw} height={ch} className="crop-box" />
      {[1, 2].map((i) => (
        <g key={i} className="crop-third">
          <line x1={x0 + (cw * i) / 3} y1={y0} x2={x0 + (cw * i) / 3} y2={y1} />
          <line x1={x0} y1={y0 + (ch * i) / 3} x2={x1} y2={y0 + (ch * i) / 3} />
        </g>
      ))}
      {handles.map(([hx, hy]) => (
        <rect
          key={`${hx}${hy}`}
          data-handle={`c${hx},${hy}`}
          x={x0 + (cw * hx) / 2 - 6}
          y={y0 + (ch * hy) / 2 - 6}
          width={12}
          height={12}
          className="handle"
          style={{ cursor: hx === 1 ? 'ns-resize' : hy === 1 ? 'ew-resize' : (hx === hy) ? 'nwse-resize' : 'nesw-resize' }}
        />
      ))}
      <text x={x0 + cw / 2} y={y1 + 22} textAnchor="middle" className="crop-dim">
        {Math.round(crop.w)} × {Math.round(crop.h)}
      </text>
    </g>
  );
}

let pattern: CanvasPattern | null = null;
function checker(ctx: CanvasRenderingContext2D) {
  if (pattern) return pattern;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6e6ea';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#c9c9d0';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  pattern = ctx.createPattern(c, 'repeat');
  return pattern!;
}
