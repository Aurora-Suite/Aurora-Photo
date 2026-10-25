import { Check, Circle, FlipHorizontal2, FlipVertical2, Maximize, RotateCcw, RotateCw, Square, X } from 'lucide-react';
import { useStore } from '../store';
import { Segmented } from './ui';
import { TOOLS } from './Toolbar';

const ASPECTS: { label: string; v: number | null | 'orig' }[] = [
  { label: 'Libre', v: null },
  { label: 'Original', v: 'orig' },
  { label: '1:1', v: 1 },
  { label: '4:5', v: 4 / 5 },
  { label: '3:2', v: 3 / 2 },
  { label: '16:9', v: 16 / 9 },
  { label: '9:16', v: 9 / 16 },
];

function Mini({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="mini">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ ['--p' as any]: `${((value - min) / (max - min)) * 100}%` }} onChange={(e) => onChange(+e.target.value)} />
      <b>
        {Math.round(value * (unit === '%' ? 100 : 1))}
        {unit}
      </b>
    </label>
  );
}

export default function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const crop = useStore((s) => s.crop);
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  const shapeType = useStore((s) => s.shapeType);
  const s = useStore.getState();
  const setBrush = (p: Partial<typeof brush>) => s.set({ brush: { ...useStore.getState().brush, ...p } });
  const info = TOOLS.find((t) => t.id === tool)!;

  const zoomTo = (z: number) => {
    const el = document.querySelector('.stage') as HTMLElement | null;
    if (!el || !doc) return;
    s.set({ zoom: z, panX: (el.clientWidth - doc.width * z) / 2, panY: (el.clientHeight - doc.height * z) / 2 });
  };

  return (
    <div className="tool-options">
      <span className="tool-name">
        <info.icon size={15} /> {info.label.split(' (')[0]}
      </span>
      <div className="opts">
        {(tool === 'brush' || tool === 'eraser') && (
          <>
            <Mini label="Tamaño" value={brush.size} min={1} max={800} onChange={(v) => setBrush({ size: v })} unit=" px" />
            <Mini label="Dureza" value={brush.hardness} min={0} max={1} step={0.01} unit="%" onChange={(v) => setBrush({ hardness: v })} />
            <Mini label="Opacidad" value={brush.opacity} min={0.01} max={1} step={0.01} unit="%" onChange={(v) => setBrush({ opacity: v })} />
            {tool === 'brush' && (
              <label className="mini">
                <span>Color</span>
                <input type="color" className="color-input" value={brush.color} onChange={(e) => setBrush({ color: e.target.value })} />
              </label>
            )}
            <span className="hint">[ y ] cambian el tamaño</span>
          </>
        )}
        {tool === 'crop' && crop && doc && (
          <>
            <div className="aspect-row">
              {ASPECTS.map((a) => {
                const v = a.v === 'orig' ? doc.width / doc.height : a.v;
                const on = crop.aspect === v || (v === null && crop.aspect === null);
                return (
                  <button
                    key={a.label}
                    className={`chip-btn ${on ? 'on' : ''}`}
                    onClick={() => {
                      if (!v) return s.set({ crop: { ...crop, aspect: null } });
                      // Ajusta el recorte actual a la proporción, centrado.
                      let w = crop.w, h = crop.w / v;
                      if (h > crop.h) (h = crop.h), (w = h * v);
                      s.set({ crop: { aspect: v, w, h, x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2 } });
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
            <button className="btn" onClick={() => s.set({ crop: { x: 0, y: 0, w: doc.width, h: doc.height, aspect: null } })}>
              <RotateCcw size={13} /> Restablecer
            </button>
            <button className="btn" onClick={() => s.set({ tool: 'move' })}>
              <X size={13} /> Cancelar
            </button>
            <button className="btn primary" onClick={() => s.applyCrop()}>
              <Check size={13} /> Aplicar (Intro)
            </button>
          </>
        )}
        {tool === 'shape' && (
          <>
            <Segmented
              value={shapeType}
              onChange={(v) => s.set({ shapeType: v })}
              options={[
                { value: 'rect', label: <><Square size={13} /> Rectángulo</> },
                { value: 'ellipse', label: <><Circle size={13} /> Elipse</> },
              ]}
            />
            <span className="hint">Arrastra sobre el lienzo · Mayús = proporción 1:1</span>
          </>
        )}
        {tool === 'text' && <span className="hint">Haz clic en el lienzo para añadir texto y edítalo en el panel «Capa».</span>}
        {tool === 'eyedropper' && <span className="hint">Haz clic para tomar un color para el pincel.</span>}
        {tool === 'move' && doc && (
          <>
            <button className="icon-btn" title="Girar lienzo 90° a la izquierda" onClick={() => s.rotateDoc(-1)}>
              <RotateCcw size={15} />
            </button>
            <button className="icon-btn" title="Girar lienzo 90° a la derecha" onClick={() => s.rotateDoc(1)}>
              <RotateCw size={15} />
            </button>
            <button className="icon-btn" title="Voltear lienzo horizontal" onClick={() => s.flipDoc('h')}>
              <FlipHorizontal2 size={15} />
            </button>
            <button className="icon-btn" title="Voltear lienzo vertical" onClick={() => s.flipDoc('v')}>
              <FlipVertical2 size={15} />
            </button>
            <span className="hint">Arrastra para mover · esquinas para escalar · círculo para rotar (Mayús = 15°)</span>
          </>
        )}
      </div>
      {doc && (
        <div className="zoom-ctl">
          <button className="btn ghost" title="Encajar (Ctrl+0)" onClick={() => s.set({ fitTick: s.fitTick + 1 })}>
            <Maximize size={13} />
          </button>
          <button className="btn ghost" title="Tamaño real (Ctrl+1)" onClick={() => zoomTo(1)}>
            100%
          </button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
        </div>
      )}
    </div>
  );
}
