import { useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, ImagePlus, Lock, LockOpen, Paintbrush, Shapes, Trash2, Type } from 'lucide-react';
import { useStore } from '../store';
import type { Layer } from '../types';
import { drawShape, layerContent, onAsset } from '../lib/render';
import { onPixels } from '../lib/pixels';
import { placeImages } from '../lib/actions';
import { BLENDS } from './PropsPanel';

function Thumb({ layer }: { layer: Layer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => (layer.kind === 'image' ? onAsset(() => setTick((n) => n + 1)) : undefined), [layer.kind]);
  useEffect(() => {
    if (layer.kind !== 'paint' && !layer.hasMask) return;
    let t = 0;
    return onPixels(() => {
      clearTimeout(t);
      t = window.setTimeout(() => setTick((n) => n + 1), 250);
    });
  }, [layer.kind, layer.hasMask]);
  useEffect(() => {
    const c = ref.current!;
    const S = 40 * (window.devicePixelRatio || 1);
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    const k = (S - 4) / Math.max(layer.w, layer.h);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.scale(k, k);
    if (layer.kind === 'shape' && layer.shape) drawShape(ctx, layer);
    else {
      const content = layerContent(layer, { maxDim: 160, textScale: Math.max(0.25, k * 2), cacheTag: 'thumb' });
      if (content) ctx.drawImage(content, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
    }
    ctx.restore();
  });
  return <canvas ref={ref} className="layer-thumb" data-tick={tick} />;
}

export default function LayersPanel() {
  const layers = useStore((s) => s.layers);
  const selected = useStore((s) => s.selected);
  const doc = useStore((s) => s.doc);
  const s = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const sel = layers.find((l) => l.id === selected);
  const list = [...layers].reverse(); // arriba = capa superior

  return (
    <div className="layers">
      <div className="panel-head">
        <h3>Capas</h3>
        <button className="icon-btn sm" title="Añadir imagen" disabled={!doc} onClick={placeImages}>
          <ImagePlus size={14} />
        </button>
        <button className="icon-btn sm" title="Nueva capa de pintura" disabled={!doc} onClick={() => s.addPaintLayer()}>
          <Paintbrush size={14} />
        </button>
        <button className="icon-btn sm" title="Añadir texto" disabled={!doc} onClick={() => s.addTextLayer()}>
          <Type size={14} />
        </button>
        <button
          className="icon-btn sm"
          title="Añadir rectángulo"
          disabled={!doc}
          onClick={() => doc && s.addShapeLayer(doc.width / 2, doc.height / 2, doc.width * 0.4, doc.height * 0.25, 'rect')}
        >
          <Shapes size={14} />
        </button>
      </div>
      {sel && (
        <div className="layer-ctl">
          <select className="input" value={sel.blend} onChange={(e) => s.updateLayer(sel.id, { blend: e.target.value as Layer['blend'] })}>
            {BLENDS.map((b) => (
              <option key={b.v} value={b.v}>{b.label}</option>
            ))}
          </select>
          <label className="op">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={sel.opacity}
              style={{ ['--p' as any]: `${sel.opacity * 100}%` }}
              onChange={(e) => s.updateLayer(sel.id, { opacity: +e.target.value }, 'opacity')}
            />
            <b>{Math.round(sel.opacity * 100)}%</b>
          </label>
        </div>
      )}
      <div className="layer-list" onDragOver={(e) => e.preventDefault()}>
        {list.length === 0 && <div className="empty" style={{ padding: 18 }}>Sin capas</div>}
        {list.map((l, vi) => {
          const index = layers.length - 1 - vi;
          return (
            <div
              key={l.id}
              className={`layer-row ${l.id === selected ? 'on' : ''} ${!l.visible ? 'hidden' : ''} ${dropAt === index && dragId !== l.id ? 'drop' : ''}`}
              draggable={renaming !== l.id}
              onDragStart={(e) => {
                setDragId(l.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropAt(index);
              }}
              onDragEnd={() => (setDragId(null), setDropAt(null))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) s.reorder(dragId, index);
                setDragId(null);
                setDropAt(null);
              }}
              onClick={() => s.set({ selected: l.id })}
            >
              <button
                className="icon-btn sm"
                title={l.visible ? 'Ocultar' : 'Mostrar'}
                onClick={(e) => (e.stopPropagation(), s.updateLayer(l.id, { visible: !l.visible }))}
              >
                {l.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <Thumb layer={l} />
              {l.hasMask && <span className="mask-dot" title="Tiene máscara" />}
              {renaming === l.id ? (
                <input
                  className="input rename"
                  autoFocus
                  defaultValue={l.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => (s.updateLayer(l.id, { name: e.target.value || l.name }), setRenaming(null))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="layer-name" onDoubleClick={() => setRenaming(l.id)}>
                  {l.name}
                </span>
              )}
              <button
                className={`icon-btn sm ${l.locked ? 'on' : 'ghosty'}`}
                title={l.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={(e) => (e.stopPropagation(), s.updateLayer(l.id, { locked: !l.locked }))}
              >
                {l.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="layer-foot">
        <button className="icon-btn sm" title="Duplicar capa (Ctrl+J)" disabled={!sel} onClick={() => sel && s.duplicateLayer(sel.id)}>
          <Copy size={13} />
        </button>
        <button className="icon-btn sm" title="Eliminar capa (Supr)" disabled={!sel} onClick={() => sel && s.removeLayer(sel.id)}>
          <Trash2 size={13} />
        </button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{layers.length} {layers.length === 1 ? 'capa' : 'capas'}</span>
      </div>
    </div>
  );
}
