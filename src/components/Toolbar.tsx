import { Brush, Crop, Eraser, Hand, MousePointer2, Pipette, Square, Type, ZoomIn } from 'lucide-react';
import { useStore } from '../store';
import type { Tool } from '../types';

export const TOOLS: { id: Tool; icon: typeof Brush; label: string; key: string }[] = [
  { id: 'move', icon: MousePointer2, label: 'Mover y transformar', key: 'V' },
  { id: 'crop', icon: Crop, label: 'Recortar', key: 'C' },
  { id: 'brush', icon: Brush, label: 'Pincel', key: 'B' },
  { id: 'eraser', icon: Eraser, label: 'Borrador (Alt restaura en imágenes)', key: 'E' },
  { id: 'text', icon: Type, label: 'Texto', key: 'T' },
  { id: 'shape', icon: Square, label: 'Formas', key: 'U' },
  { id: 'eyedropper', icon: Pipette, label: 'Cuentagotas', key: 'I' },
  { id: 'hand', icon: Hand, label: 'Mano (mantén Espacio)', key: 'H' },
  { id: 'zoom', icon: ZoomIn, label: 'Zoom (Alt para alejar)', key: 'Z' },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const color = useStore((s) => s.brush.color);
  const set = useStore((s) => s.set);
  return (
    <div className="toolbar panel">
      {TOOLS.map((t) => (
        <button key={t.id} className={`tool-btn ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key})`} onClick={() => set({ tool: t.id })}>
          <t.icon size={18} strokeWidth={1.8} />
        </button>
      ))}
      <div className="tool-sep" />
      <label className="swatch" title="Color del pincel">
        <span style={{ background: color }} />
        <input type="color" value={color} onChange={(e) => set({ brush: { ...useStore.getState().brush, color: e.target.value } })} />
      </label>
    </div>
  );
}
