import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Loader2, Share, X } from 'lucide-react';
import { useStore } from '../store';
import { encode, exportImage, type ExportFormat } from '../lib/actions';
import { renderExport } from '../lib/render';
import { Section, Segmented, Slider } from './ui';

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export default function ExportDialog() {
  const doc = useStore((s) => s.doc)!;
  const layers = useStore((s) => s.layers);
  const s = useStore.getState();
  const [fmt, setFmt] = useState<ExportFormat>('jpg');
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(1);
  const [matte, setMatte] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [done, setDone] = useState<{ path: string; size: number; w: number; h: number } | null>(null);
  const W = Math.round(doc.width * scale), H = Math.round(doc.height * scale);

  // Estimación del peso: se codifica una versión reducida y se extrapola por píxeles.
  useEffect(() => {
    setEstimate(null);
    const t = setTimeout(async () => {
      const k = Math.min(scale, 640 / Math.max(doc.width, doc.height));
      const bg = fmt === 'jpg' && doc.background === 'transparent' ? matte : undefined;
      const c = renderExport(doc, layers, k, bg);
      const b = await encode(c, fmt, quality);
      setEstimate((b.size * (W * H)) / (c.width * c.height));
    }, 250);
    return () => clearTimeout(t);
  }, [fmt, quality, scale, matte, doc, layers]);

  const preview = useMemo(() => {
    const k = 420 / Math.max(doc.width, doc.height);
    return renderExport(doc, layers, k).toDataURL();
  }, [doc, layers]);

  const run = async () => {
    setBusy(true);
    try {
      const r = await exportImage(fmt, quality, scale, matte);
      if (r) setDone(r);
    } catch (e: any) {
      s.notify(e.message || 'Error al exportar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && !busy && s.set({ exportOpen: false })}>
      <div className="modal export-photo">
        <div className="panel-head">
          <h3>Exportar imagen</h3>
          <button className="icon-btn" onClick={() => s.set({ exportOpen: false })}>
            <X size={15} />
          </button>
        </div>
        <div className="export-body">
          <div className={`export-preview ${doc.background === 'transparent' && fmt !== 'jpg' ? 'checker' : ''}`}>
            <img src={preview} alt="" />
          </div>
          <div className="export-form">
            <Section title="Formato">
              <Segmented
                value={fmt}
                onChange={setFmt}
                options={[
                  { value: 'jpg', label: 'JPG' },
                  { value: 'png', label: 'PNG' },
                  { value: 'webp', label: 'WebP' },
                ]}
              />
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                {fmt === 'jpg' && 'Fotos: el más compatible y ligero. Sin transparencia.'}
                {fmt === 'png' && 'Sin pérdida y con transparencia. Ideal para gráficos y miniaturas.'}
                {fmt === 'webp' && 'Para la web: más ligero que JPG, admite transparencia.'}
              </p>
              {fmt !== 'png' && <Slider label="Calidad" value={quality} min={0.4} max={1} step={0.01} def={0.92} format={(v) => `${Math.round(v * 100)}%`} onChange={setQuality} />}
              {fmt === 'jpg' && doc.background === 'transparent' && (
                <div className="row">
                  <span className="label" style={{ flex: 1 }}>Fondo para zonas transparentes</span>
                  <input type="color" className="color-input" value={matte} onChange={(e) => setMatte(e.target.value)} />
                </div>
              )}
            </Section>
            <Section title="Tamaño">
              <Slider label="Escala" value={scale} min={0.1} max={4} step={0.05} def={1} format={(v) => `${Math.round(v * 100)}%`} onChange={setScale} />
              <div className="row wrap">
                {[0.25, 0.5, 1, 2].map((k) => (
                  <button key={k} className={`chip-btn ${scale === k ? 'on' : ''}`} onClick={() => setScale(k)}>
                    {k * 100}%
                  </button>
                ))}
              </div>
              <div className="export-summary">
                <span>{W} × {H} px</span>
                <span>{estimate === null ? 'Calculando…' : `≈ ${fmtSize(estimate)}`}</span>
              </div>
            </Section>
            {done ? (
              <div className="export-done">
                <b>Exportado</b>
                <span>{done.w} × {done.h} · {fmtSize(done.size)}</span>
                <div className="row">
                  <button className="btn" onClick={() => window.api.reveal(done.path)}>
                    <FolderOpen size={13} /> Mostrar en carpeta
                  </button>
                  <button className="btn primary" onClick={() => s.set({ exportOpen: false })}>Listo</button>
                </div>
              </div>
            ) : (
              <button className="btn primary big" disabled={busy} onClick={run}>
                {busy ? <Loader2 size={15} className="spin" /> : <Share size={15} />} Exportar {fmt.toUpperCase()}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
