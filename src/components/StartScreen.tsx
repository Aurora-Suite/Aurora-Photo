import { useState } from 'react';
import { FileImage, FolderOpen, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { openDialog } from '../lib/actions';
import { BrandMark, Toggle } from './ui';

export const DOC_PRESETS = [
  { name: 'Miniatura de YouTube', w: 1280, h: 720, tag: '16:9' },
  { name: 'Publicación Instagram', w: 1080, h: 1350, tag: '4:5' },
  { name: 'Story / Reel / Short', w: 1080, h: 1920, tag: '9:16' },
  { name: 'Cuadrado', w: 1080, h: 1080, tag: '1:1' },
  { name: 'Full HD', w: 1920, h: 1080, tag: '16:9' },
  { name: '4K UHD', w: 3840, h: 2160, tag: '16:9' },
  { name: 'Banner de YouTube', w: 2560, h: 1440, tag: 'Canal' },
  { name: 'A4 (300 ppp)', w: 2480, h: 3508, tag: 'Impresión' },
];

function PresetGrid({ onPick }: { onPick: (w: number, h: number, name: string) => void }) {
  return (
    <div className="doc-presets">
      {DOC_PRESETS.map((p) => {
        const k = 54 / Math.max(p.w, p.h);
        return (
          <button key={p.name} className="doc-preset" onClick={() => onPick(p.w, p.h, p.name)}>
            <span className="frame-wrap">
              <span className="frame" style={{ width: p.w * k, height: p.h * k }} />
            </span>
            <b>{p.name}</b>
            <span>{p.w} × {p.h} · {p.tag}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NewDocDialog() {
  const s = useStore.getState();
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [name, setName] = useState('Sin título');
  const [transparent, setTransparent] = useState(false);
  const create = (W: number, H: number, n: string) => s.newDoc({ name: n, width: Math.max(1, Math.round(W)), height: Math.max(1, Math.round(H)), background: transparent ? 'transparent' : '#ffffff' });
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && s.set({ newOpen: false })}>
      <div className="modal newdoc">
        <div className="panel-head">
          <h3>Nuevo documento</h3>
          <button className="icon-btn" onClick={() => s.set({ newOpen: false })}>
            <X size={15} />
          </button>
        </div>
        <PresetGrid onPick={(W, H, n) => create(W, H, n)} />
        <div className="newdoc-custom">
          <div className="field" style={{ flex: 2 }}>
            <label>Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Ancho (px)</label>
            <input className="input" type="number" value={w} min={1} onChange={(e) => setW(+e.target.value)} />
          </div>
          <div className="field">
            <label>Alto (px)</label>
            <input className="input" type="number" value={h} min={1} onChange={(e) => setH(+e.target.value)} />
          </div>
          <div className="field">
            <label>Fondo transparente</label>
            <Toggle on={transparent} onChange={setTransparent} />
          </div>
          <button className="btn primary" onClick={() => create(w, h, name)}>
            <Plus size={14} /> Crear
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StartScreen() {
  const s = useStore.getState();
  return (
    <div className="start">
      <div className="start-hero">
        <BrandMark size={72} />
        <h1>Aurora Photo</h1>
        <p>Revela, retoca y diseña. Arrastra una foto aquí o empieza con una plantilla.</p>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn primary big" onClick={openDialog}>
            <FolderOpen size={16} /> Abrir foto o proyecto
          </button>
          <button className="btn big" onClick={() => s.set({ newOpen: true })}>
            <FileImage size={16} /> Nuevo documento
          </button>
        </div>
      </div>
      <div className="start-section">
        <h2>Empezar con una plantilla</h2>
        <PresetGrid onPick={(w, h, name) => s.newDoc({ name, width: w, height: h, background: '#ffffff' })} />
      </div>
    </div>
  );
}
