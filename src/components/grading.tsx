import { useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { curveTable } from '../lib/color';
import { Segmented } from './ui';
import type { CurvePoint, Grade, RGBW } from '../types';

// Rueda de color: el punto codifica un desplazamiento de crominancia (r,g,b de media cero).
export function Wheel({ label, value, neutral, range, masterMin, masterMax, onChange }: {
  label: string;
  value: RGBW;
  neutral: number;
  range: number;
  masterMin: number;
  masterMax: number;
  onChange: (v: RGBW) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dr = value.r - neutral, dg = value.g - neutral, db = value.b - neutral;
  const px = dr - 0.5 * (dg + db);
  const py = (Math.sqrt(3) / 2) * (dg - db);
  const R = 52;
  const mag = Math.min(1, Math.hypot(px, py) / range);
  const ang = Math.atan2(py, px);
  const set = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    let x = (clientX - r.left - r.width / 2) / R;
    let y = (clientY - r.top - r.height / 2) / R;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    const a = Math.min(1, Math.hypot(x, y)) * range;
    const th = Math.atan2(y, x);
    const k = (2 / 3) * a;
    onChange({ ...value, r: neutral + k * Math.cos(th), g: neutral + k * Math.cos(th - (2 * Math.PI) / 3), b: neutral + k * Math.cos(th + (2 * Math.PI) / 3) });
  };
  return (
    <div className="wheel-wrap">
      <div className="wheel-label">
        <span>{label}</span>
        <button className="icon-btn sm" title="Restablecer" onClick={() => onChange({ r: neutral, g: neutral, b: neutral, m: neutral === 0 ? 0 : 1 })}>
          <RotateCcw size={11} />
        </button>
      </div>
      <div
        ref={ref}
        className="wheel"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          set(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => e.buttons && set(e.clientX, e.clientY)}
        onDoubleClick={() => onChange({ ...value, r: neutral, g: neutral, b: neutral })}
      >
        <div className="puck" style={{ left: `calc(50% + ${Math.cos(ang) * mag * R}px)`, top: `calc(50% + ${Math.sin(ang) * mag * R}px)` }} />
      </div>
      <input type="range" className="wheel-master" min={masterMin} max={masterMax} step={0.005} value={value.m} style={{ ['--p' as any]: `${((value.m - masterMin) / (masterMax - masterMin)) * 100}%` }} onChange={(e) => onChange({ ...value, m: +e.target.value })} onDoubleClick={() => onChange({ ...value, m: neutral === 0 ? 0 : 1 })} />
    </div>
  );
}

const CH_COLOR: Record<string, string> = { m: '#f5f5f7', r: '#ff453a', g: '#30d158', b: '#0a84ff' };

export function Curves({ curves, onChange }: { curves: Grade['curves']; onChange: (c: Grade['curves']) => void }) {
  const [ch, setCh] = useState<'m' | 'r' | 'g' | 'b'>('m');
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const S = 220;
  const pts = curves[ch];
  const tab = curveTable(pts, 128);
  const path = Array.from(tab, (v, i) => `${i ? 'L' : 'M'}${((i / 127) * S).toFixed(1)},${((1 - Math.max(0, Math.min(1, v))) * S).toFixed(1)}`).join(' ');
  const toPt = (e: React.PointerEvent): CurvePoint => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))];
  };
  const setPts = (p: CurvePoint[]) => onChange({ ...curves, [ch]: p });
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Segmented value={ch} onChange={setCh} options={(['m', 'r', 'g', 'b'] as const).map((k) => ({ value: k, label: <span style={{ color: CH_COLOR[k] }}>{k === 'm' ? 'Luma' : k.toUpperCase()}</span> }))} />
        <button className="icon-btn sm" title="Restablecer curva" onClick={() => setPts([[0, 0], [1, 1]])}>
          <RotateCcw size={12} />
        </button>
      </div>
      <svg
        ref={ref}
        className="curves"
        viewBox={`0 0 ${S} ${S}`}
        onPointerDown={(e) => {
          const p = toPt(e);
          let i = pts.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 0.05);
          if (i < 0) {
            const next = [...pts, p].sort((a, b) => a[0] - b[0]);
            i = next.indexOf(p);
            setPts(next);
          }
          drag.current = i;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const p = toPt(e);
          const i = drag.current;
          const next = pts.map((q) => [...q] as CurvePoint);
          const lo = i > 0 ? next[i - 1][0] + 0.01 : 0;
          const hi = i < next.length - 1 ? next[i + 1][0] - 0.01 : 1;
          next[i] = [i === 0 ? 0 : i === next.length - 1 ? 1 : Math.max(lo, Math.min(hi, p[0])), p[1]];
          setPts(next);
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={(e) => {
          const p = toPt(e as any);
          const i = pts.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 0.05);
          if (i > 0 && i < pts.length - 1) setPts(pts.filter((_, j) => j !== i));
        }}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} stroke="rgba(255,255,255,0.08)">
            <line x1={g * S} y1={0} x2={g * S} y2={S} />
            <line x1={0} y1={g * S} x2={S} y2={g * S} />
          </g>
        ))}
        <line x1={0} y1={S} x2={S} y2={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
        <path d={path} fill="none" stroke={CH_COLOR[ch]} strokeWidth={2} />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x * S} cy={(1 - y) * S} r={5} fill="#1c1c1e" stroke={CH_COLOR[ch]} strokeWidth={2} />
        ))}
      </svg>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 11 }}>
        Clic para añadir un punto · arrastra · doble clic para quitarlo
      </p>
    </div>
  );
}
