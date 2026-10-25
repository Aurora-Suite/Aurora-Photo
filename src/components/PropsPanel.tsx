import { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, FlipHorizontal2, FlipVertical2, Italic, Maximize2, Scan, Crosshair } from 'lucide-react';
import { selectedLayer, useStore } from '../store';
import { Section, Segmented, Slider, Toggle } from './ui';
import type { BlendMode, Layer } from '../types';

export const BLENDS: { v: BlendMode; label: string }[] = [
  { v: 'source-over', label: 'Normal' },
  { v: 'multiply', label: 'Multiplicar' },
  { v: 'screen', label: 'Trama' },
  { v: 'overlay', label: 'Superponer' },
  { v: 'soft-light', label: 'Luz suave' },
  { v: 'hard-light', label: 'Luz fuerte' },
  { v: 'darken', label: 'Oscurecer' },
  { v: 'lighten', label: 'Aclarar' },
  { v: 'color-dodge', label: 'Sobreexponer color' },
  { v: 'color-burn', label: 'Subexponer color' },
  { v: 'difference', label: 'Diferencia' },
  { v: 'exclusion', label: 'Exclusión' },
  { v: 'hue', label: 'Tono' },
  { v: 'saturation', label: 'Saturación' },
  { v: 'color', label: 'Color' },
  { v: 'luminosity', label: 'Luminosidad' },
];

const FONTS = ['Inter Variable', 'Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New', 'Comic Sans MS', 'Segoe Script', 'Bahnschrift'];

function Num({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        className="input"
        value={draft ?? String(Math.round(value / step) * step)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat((draft ?? '').replace(',', '.'));
          if (!Number.isNaN(v)) onChange(v);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <i>{suffix}</i>}
    </label>
  );
}

function DocProps() {
  const doc = useStore((s) => s.doc)!;
  const s = useStore.getState();
  const [w, setW] = useState(doc.width);
  const [h, setH] = useState(doc.height);
  const [lock, setLock] = useState(true);
  useEffect(() => (setW(doc.width), setH(doc.height)), [doc.width, doc.height]);
  const ratio = doc.width / doc.height;
  return (
    <>
      <Section title="Documento">
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={doc.name} onChange={(e) => s.set({ doc: { ...doc, name: e.target.value }, dirty: true })} />
        </div>
        <div className="grid-2">
          <Num label="Ancho" value={w} suffix="px" onChange={(v) => (setW(Math.max(1, v)), lock && setH(Math.round(Math.max(1, v) / ratio)))} />
          <Num label="Alto" value={h} suffix="px" onChange={(v) => (setH(Math.max(1, v)), lock && setW(Math.round(Math.max(1, v) * ratio)))} />
        </div>
        <div className="row">
          <Toggle on={lock} onChange={setLock} />
          <span className="muted">Mantener proporción</span>
        </div>
        <div className="grid-2">
          <button className="btn" disabled={w === doc.width && h === doc.height} onClick={() => s.resizeImage(w, h)} title="Escala todo el contenido">
            Redimensionar
          </button>
          <button className="btn" disabled={w === doc.width && h === doc.height} onClick={() => s.resizeCanvas(w, h)} title="Amplía o recorta el lienzo sin escalar">
            Tamaño lienzo
          </button>
        </div>
      </Section>
      <Section title="Fondo">
        <div className="row">
          <Toggle on={doc.background !== 'transparent'} onChange={(v) => (s.commit(), s.set({ doc: { ...doc, background: v ? '#ffffff' : 'transparent' } }))} />
          <span className="muted" style={{ flex: 1 }}>{doc.background === 'transparent' ? 'Transparente' : 'Color de fondo'}</span>
          {doc.background !== 'transparent' && (
            <input type="color" className="color-input" value={doc.background} onChange={(e) => (s.commit('bg'), s.set({ doc: { ...doc, background: e.target.value } }))} />
          )}
        </div>
      </Section>
    </>
  );
}

export default function PropsPanel() {
  const layer = useStore(selectedLayer);
  const doc = useStore((s) => s.doc);
  const s = useStore.getState();
  if (!doc) return null;
  if (!layer) return <DocProps />;
  const U = (p: Partial<Layer>, key?: string) => s.updateLayer(layer.id, p, key);
  const t = layer.text;
  const sh = layer.shape;

  return (
    <>
      <Section title="Capa">
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={layer.name} onChange={(e) => U({ name: e.target.value }, 'name')} />
        </div>
        <Slider label="Opacidad" value={layer.opacity} min={0} max={1} def={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => U({ opacity: v }, 'opacity')} />
        <div className="field">
          <label>Fusión</label>
          <select className="input" value={layer.blend} onChange={(e) => U({ blend: e.target.value as BlendMode })}>
            {BLENDS.map((b) => (
              <option key={b.v} value={b.v}>{b.label}</option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Transformar">
        <div className="grid-2">
          <Num label="X" value={layer.x} onChange={(v) => U({ x: v })} />
          <Num label="Y" value={layer.y} onChange={(v) => U({ y: v })} />
          <Num label="Escala" value={layer.scale * 100} suffix="%" onChange={(v) => U({ scale: Math.max(0.01, v / 100) })} />
          <Num label="Rotación" value={layer.rotation} suffix="°" onChange={(v) => U({ rotation: ((v % 360) + 360) % 360 })} />
        </div>
        <div className="row wrap">
          <button className="btn" title="Voltear horizontal" onClick={() => U({ flipH: !layer.flipH })}>
            <FlipHorizontal2 size={13} />
          </button>
          <button className="btn" title="Voltear vertical" onClick={() => U({ flipV: !layer.flipV })}>
            <FlipVertical2 size={13} />
          </button>
          <button className="btn" title="Centrar en el lienzo" onClick={() => U({ x: doc.width / 2, y: doc.height / 2 })}>
            <Crosshair size={13} /> Centrar
          </button>
          <button className="btn" title="Encajar dentro del lienzo" onClick={() => U({ x: doc.width / 2, y: doc.height / 2, rotation: 0, scale: Math.min(doc.width / layer.w, doc.height / layer.h) })}>
            <Scan size={13} /> Encajar
          </button>
          <button className="btn" title="Cubrir todo el lienzo" onClick={() => U({ x: doc.width / 2, y: doc.height / 2, rotation: 0, scale: Math.max(doc.width / layer.w, doc.height / layer.h) })}>
            <Maximize2 size={13} /> Cubrir
          </button>
        </div>
      </Section>

      {t && (
        <Section title="Texto">
          <textarea className="input" rows={3} value={t.content} onChange={(e) => s.updateText(layer.id, { content: e.target.value }, 'content')} autoFocus={t.content === 'Tu texto'} onFocus={(e) => t.content === 'Tu texto' && e.target.select()} />
          <div className="field">
            <label>Fuente</label>
            <select className="input" value={t.font} onChange={(e) => s.updateText(layer.id, { font: e.target.value })} style={{ fontFamily: t.font }}>
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f.replace(' Variable', '')}</option>
              ))}
            </select>
          </div>
          <Slider label="Tamaño" value={t.size} min={8} max={600} step={1} def={120} format={(v) => `${Math.round(v)} px`} onChange={(v) => s.updateText(layer.id, { size: v }, 'size')} />
          <Slider label="Grosor" value={t.weight} min={100} max={900} step={100} def={800} format={(v) => String(v)} onChange={(v) => s.updateText(layer.id, { weight: v }, 'weight')} />
          <div className="row">
            <input type="color" className="color-input" value={t.color} onChange={(e) => s.updateText(layer.id, { color: e.target.value }, 'color')} title="Color" />
            <Segmented
              value={t.align}
              onChange={(v) => s.updateText(layer.id, { align: v })}
              options={[
                { value: 'left', label: <AlignLeft size={13} /> },
                { value: 'center', label: <AlignCenter size={13} /> },
                { value: 'right', label: <AlignRight size={13} /> },
              ]}
            />
            <button className={`icon-btn ${t.weight >= 700 ? 'on' : ''}`} title="Negrita" onClick={() => s.updateText(layer.id, { weight: t.weight >= 700 ? 400 : 800 })}>
              <Bold size={14} />
            </button>
            <button className={`icon-btn ${t.italic ? 'on' : ''}`} title="Cursiva" onClick={() => s.updateText(layer.id, { italic: !t.italic })}>
              <Italic size={14} />
            </button>
          </div>
          <Slider label="Interlineado" value={t.lineHeight} min={0.7} max={2.5} def={1.1} format={(v) => v.toFixed(2)} onChange={(v) => s.updateText(layer.id, { lineHeight: v }, 'lh')} />
          <Slider label="Espaciado" value={t.letterSpacing} min={-20} max={80} step={0.5} def={0} format={(v) => `${v} px`} onChange={(v) => s.updateText(layer.id, { letterSpacing: v }, 'ls')} />
          <div className="row">
            <span className="label" style={{ width: 92 }}>Contorno</span>
            <input type="color" className="color-input" value={t.strokeColor} onChange={(e) => s.updateText(layer.id, { strokeColor: e.target.value }, 'sc')} />
            <input type="range" min={0} max={40} step={1} value={t.strokeWidth} style={{ ['--p' as any]: `${(t.strokeWidth / 40) * 100}%` }} onChange={(e) => s.updateText(layer.id, { strokeWidth: +e.target.value }, 'sw')} />
          </div>
          <Slider label="Sombra" value={t.shadow} min={0} max={1} def={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.updateText(layer.id, { shadow: v }, 'shadow')} />
          <div className="row">
            <Toggle on={!!t.background} onChange={(v) => s.updateText(layer.id, { background: v ? '#000000' : '' })} />
            <span className="muted" style={{ flex: 1 }}>Caja de fondo</span>
            {t.background && <input type="color" className="color-input" value={t.background} onChange={(e) => s.updateText(layer.id, { background: e.target.value }, 'bgc')} />}
          </div>
        </Section>
      )}

      {sh && (
        <Section title="Forma">
          <Segmented value={sh.type} onChange={(v) => s.updateShape(layer.id, { type: v })} options={[{ value: 'rect', label: 'Rectángulo' }, { value: 'ellipse', label: 'Elipse' }]} />
          <div className="grid-2">
            <Num label="Ancho" value={layer.w} suffix="px" onChange={(v) => U({ w: Math.max(1, v) })} />
            <Num label="Alto" value={layer.h} suffix="px" onChange={(v) => U({ h: Math.max(1, v) })} />
          </div>
          <div className="row">
            <Toggle on={!!sh.fill} onChange={(v) => s.updateShape(layer.id, { fill: v ? '#2cc9f5' : '' })} />
            <span className="muted" style={{ flex: 1 }}>Relleno</span>
            {sh.fill && <input type="color" className="color-input" value={sh.fill} onChange={(e) => s.updateShape(layer.id, { fill: e.target.value }, 'fill')} />}
          </div>
          <div className="row">
            <Toggle on={!!sh.stroke && sh.strokeWidth > 0} onChange={(v) => s.updateShape(layer.id, v ? { stroke: '#ffffff', strokeWidth: Math.max(4, sh.strokeWidth) } : { stroke: '', strokeWidth: 0 })} />
            <span className="muted" style={{ flex: 1 }}>Borde</span>
            {sh.stroke && <input type="color" className="color-input" value={sh.stroke} onChange={(e) => s.updateShape(layer.id, { stroke: e.target.value }, 'stroke')} />}
          </div>
          {sh.stroke && <Slider label="Grosor borde" value={sh.strokeWidth} min={1} max={100} step={1} def={4} format={(v) => `${v} px`} onChange={(v) => s.updateShape(layer.id, { strokeWidth: v }, 'sw')} />}
          {sh.type === 'rect' && <Slider label="Esquinas" value={sh.radius} min={0} max={Math.round(Math.min(layer.w, layer.h) / 2)} step={1} def={0} format={(v) => `${v} px`} onChange={(v) => s.updateShape(layer.id, { radius: v }, 'radius')} />}
        </Section>
      )}

      {(layer.kind === 'image' || layer.kind === 'paint') && (
        <Section title="Máscara de capa">
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            {layer.hasMask
              ? 'Usa el borrador para ocultar zonas de la capa; con Alt las vuelves a mostrar. La foto original no se modifica.'
              : 'Oculta partes de la capa sin borrarlas. El borrador crea la máscara automáticamente en las imágenes.'}
          </p>
          {layer.hasMask ? (
            <button className="btn danger" onClick={() => s.removeMask(layer.id)}>Eliminar máscara</button>
          ) : (
            <button className="btn" onClick={() => s.addMask(layer.id)}>Añadir máscara</button>
          )}
        </Section>
      )}
    </>
  );
}
