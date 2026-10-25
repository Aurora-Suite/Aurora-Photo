import { useEffect, useRef } from 'react';
import { onHisto } from '../lib/histogram';
import { useStore } from '../store';

export default function Histogram() {
  const ref = useRef<HTMLCanvasElement>(null);
  const doc = useStore((s) => s.doc);
  useEffect(
    () =>
      onHisto((h) => {
        const c = ref.current;
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        const W = c.clientWidth, H = c.clientHeight;
        c.width = W * dpr;
        c.height = H * dpr;
        const ctx = c.getContext('2d')!;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);
        // Escala por raíz: los picos no aplastan el resto del histograma.
        const max = Math.sqrt(Math.max(1, ...[h.r, h.g, h.b].map((a) => Math.max(...a.slice(2, 254)))));
        const curve = (bins: Uint32Array, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (let i = 0; i < 256; i++) ctx.lineTo((i / 255) * W, H - Math.min(1, Math.sqrt(bins[i]) / max) * (H - 4));
          ctx.lineTo(W, H);
          ctx.fill();
        };
        ctx.globalCompositeOperation = 'lighter';
        curve(h.r, 'rgba(255,69,58,0.55)');
        curve(h.g, 'rgba(48,209,88,0.55)');
        curve(h.b, 'rgba(10,132,255,0.6)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 256; i++) {
          const y = H - Math.min(1, Math.sqrt(h.l[i]) / max) * (H - 4);
          i ? ctx.lineTo((i / 255) * W, y) : ctx.moveTo(0, y);
        }
        ctx.stroke();
      }),
    []
  );
  return (
    <div className="histo">
      <canvas ref={ref} />
      {doc && (
        <div className="histo-meta">
          <span>{doc.width} × {doc.height}</span>
          <span>{((doc.width * doc.height) / 1e6).toFixed(1)} MP</span>
        </div>
      )}
    </div>
  );
}
