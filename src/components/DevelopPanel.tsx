import { useEffect, useRef, useState } from 'react';
import { ClipboardCopy, ClipboardPaste, Eye, RotateCcw, Upload, X } from 'lucide-react';
import { selectedLayer, useStore } from '../store';
import { defaultFx, defaultGrade, parseCube } from '../lib/color';
import { developer } from '../lib/develop';
import { getImage } from '../lib/render';
import { pixels, pkey } from '../lib/pixels';
import { LOOKS, applyLook } from '../lib/presets';
import { Curves, Wheel } from './grading';
import { Section, Slider, Toggle } from './ui';
import type { Fx, Grade, Layer } from '../types';

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

function useThumbSource(layer: Layer | null) {
  if (!layer) return null;
  if (layer.kind === 'image' && layer.src) return getImage(layer.src);
  if (layer.kind === 'paint') return pixels.get(pkey(layer.id)) ?? null;
  return null;
}

// Miniaturas de los looks sobre la foto seleccionada (se generan una a una para no bloquear la interfaz).
function Looks({ layer, onPick }: { layer: Layer; onPick: (i: number) => void }) {
  const src = useThumbSource(layer);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const srcKey = layer.kind === 'image' ? layer.src : layer.id;
  useEffect(() => {
    setThumbs([]);
    if (!src) return;
    let alive = true;
    const sw = (src as any).naturalWidth || src.width, sh = (src as any).naturalHeight || src.height;
    const k = 132 / Math.max(sw, sh);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const base = document.createElement('canvas');
    base.width = w;
    base.height = h;
    base.getContext('2d')!.drawImage(src, 0, 0, w, h);
    const out: string[] = [];
    let i = 0;
    const next = () => {
      if (!alive || i >= LOOKS.length) return;
      const { grade, fx } = applyLook(LOOKS[i]);
      out[i] = developer().run(base, w, h, grade, fx, 3.3).toDataURL('image/jpeg', 0.8);
      setThumbs([...out]);
      i++;
      setTimeout(next, 0);
    };
    next();
    return () => {
      alive = false;
    };
  }, [srcKey, src]);
  return (
    <div className="looks">
      {LOOKS.map((l, i) => (
        <button key={l.name} className="look" onClick={() => onPick(i)} title={`Aplicar «${l.name}»`}>
          <span className="look-img" style={{ backgroundImage: thumbs[i] ? `url(${thumbs[i]})` : undefined }} />
          <span className="look-name">{l.name}</span>
        </button>
      ))}
    </div>
  );
}

export default function DevelopPanel() {
  const layer = useStore(selectedLayer);
  const s = useStore.getState();
  const copied = useStore((st) => st.clipboardLook);
  const holdRef = useRef(false);

  if (!layer)
    return <div className="empty">Selecciona una capa de imagen para revelarla.<br />Abre una foto o arrástrala al lienzo.</div>;
  if (layer.kind !== 'image' && layer.kind !== 'paint')
    return <div className="empty">El revelado se aplica a capas de imagen y de pintura.<br />Edita esta capa en la pestaña «Capa».</div>;

  const g: Grade = layer.grade ?? defaultGrade();
  const fx: Fx = layer.fx ?? defaultFx();
  const G = (p: Partial<Grade>, key: string) => s.updateGrade(layer.id, p, key);
  const F = (p: Partial<Fx>, key: string) => s.updateFx(layer.id, p, key);
  const sl = (label: string, key: keyof Grade, min: number, max: number, def: number, format = pct) => (
    <Slider label={label} value={g[key] as number} min={min} max={max} def={def} step={0.01} format={format} onChange={(v) => G({ [key]: v } as any, key)} />
  );
  const fl = (label: string, key: keyof Fx, min: number, max: number) => (
    <Slider label={label} value={fx[key]} min={min} max={max} def={0} step={0.01} format={pct} onChange={(v) => F({ [key]: v }, key)} />
  );

  return (
    <div className="develop">
      <div className="dev-actions">
        <button
          className="btn"
          title="Mantén pulsado para ver el original (también la tecla \)"
          onPointerDown={() => ((holdRef.current = true), s.set({ compare: true }))}
          onPointerUp={() => ((holdRef.current = false), s.set({ compare: false }))}
          onPointerLeave={() => holdRef.current && ((holdRef.current = false), s.set({ compare: false }))}
        >
          <Eye size={13} /> Antes
        </button>
        <button className="btn" title="Copiar ajustes" onClick={() => (s.set({ clipboardLook: { grade: structuredClone(g), fx: { ...fx } } }), s.notify('Ajustes copiados'))}>
          <ClipboardCopy size={13} />
        </button>
        <button
          className="btn"
          title="Pegar ajustes"
          disabled={!copied}
          onClick={() => {
            s.commit();
            s.updateLayer(layer.id, { grade: structuredClone(copied!.grade), fx: { ...copied!.fx } });
          }}
        >
          <ClipboardPaste size={13} />
        </button>
        <button className="btn" title="Restablecer todo" onClick={() => s.updateLayer(layer.id, { grade: defaultGrade(), fx: defaultFx() })}>
          <RotateCcw size={13} /> Restablecer
        </button>
      </div>

      <Section title="Looks">
        <Looks
          layer={layer}
          onPick={(i) => {
            const { grade, fx: f } = applyLook(LOOKS[i]);
            s.updateLayer(layer.id, { grade, fx: f });
          }}
        />
      </Section>

      <Section title="Luz">
        {sl('Exposición', 'exposure', -2, 2, 0, (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`)}
        {sl('Contraste', 'contrast', -1, 1, 0)}
        {sl('Altas luces', 'highlights', -1, 1, 0)}
        {sl('Sombras', 'shadows', -1, 1, 0)}
        {sl('Blancos', 'whites', -1, 1, 0)}
        {sl('Negros', 'blacks', -1, 1, 0)}
      </Section>

      <Section title="Color">
        <div className="temp-strip" />
        {sl('Temperatura', 'temperature', -1, 1, 0)}
        <div className="tint-strip" />
        {sl('Matiz', 'tint', -1, 1, 0)}
        {sl('Intensidad', 'vibrance', -1, 1, 0)}
        <Slider label="Saturación" value={g.saturation} min={0} max={2} def={1} step={0.01} format={(v) => pct(v - 1)} onChange={(v) => G({ saturation: v }, 'saturation')} />
        <Slider label="Blanco y negro" value={g.bw} min={0} max={1} def={0} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => G({ bw: v }, 'bw')} />
      </Section>

      <Section title="Detalle">
        {fl('Claridad', 'clarity', -1, 1)}
        <Slider label="Nitidez" value={fx.sharpen} min={0} max={2} def={0} step={0.01} format={(v) => `${Math.round(v * 50)}`} onChange={(v) => F({ sharpen: v }, 'sharpen')} />
      </Section>

      <Section title="Efectos">
        {fl('Viñeta', 'vignette', -1, 1)}
        {fl('Grano', 'grain', 0, 1)}
        {fl('Desenfoque', 'blur', 0, 1)}
        <Slider label="Desvanecer" value={g.fade} min={0} max={1} def={0} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => G({ fade: v }, 'fade')} />
      </Section>

      <Section title="Curvas">
        <Curves curves={g.curves} onChange={(c) => G({ curves: c }, 'curves')} />
      </Section>

      <Section title="Ruedas de color">
        <div className="wheels">
          <Wheel label="Sombras" value={g.lift} neutral={0} range={0.25} masterMin={-0.3} masterMax={0.3} onChange={(v) => G({ lift: v }, 'lift')} />
          <Wheel label="Medios" value={g.gamma} neutral={1} range={0.35} masterMin={0.5} masterMax={1.8} onChange={(v) => G({ gamma: v }, 'gamma')} />
          <Wheel label="Luces" value={g.gain} neutral={1} range={0.35} masterMin={0.5} masterMax={1.8} onChange={(v) => G({ gain: v }, 'gain')} />
        </div>
      </Section>

      <Section title="Color selectivo (HSL)" right={<Toggle on={g.hsl.enabled} onChange={(v) => G({ hsl: { ...g.hsl, enabled: v } }, 'hsl')} />}>
        {g.hsl.enabled && (
          <>
            <div className="hue-strip" />
            <Slider label="Tono" value={g.hsl.hue} min={0} max={360} step={1} def={0} format={(v) => `${Math.round(v)}°`} onChange={(v) => G({ hsl: { ...g.hsl, hue: v } }, 'hsl-h')} />
            <Slider label="Rango" value={g.hsl.range} min={5} max={180} step={1} def={60} format={(v) => `${Math.round(v)}°`} onChange={(v) => G({ hsl: { ...g.hsl, range: v } }, 'hsl-r')} />
            <Slider label="Suavidad" value={g.hsl.softness} min={1} max={90} step={1} def={30} format={(v) => `${Math.round(v)}°`} onChange={(v) => G({ hsl: { ...g.hsl, softness: v } }, 'hsl-s')} />
            <Slider label="Cambio tono" value={g.hsl.hueShift} min={-180} max={180} step={1} def={0} format={(v) => `${Math.round(v)}°`} onChange={(v) => G({ hsl: { ...g.hsl, hueShift: v } }, 'hsl-x')} />
            <Slider label="Saturación" value={g.hsl.sat} min={0} max={2} def={1} format={(v) => pct(v - 1)} onChange={(v) => G({ hsl: { ...g.hsl, sat: v } }, 'hsl-sat')} />
            <Slider label="Luminancia" value={g.hsl.lum} min={-1} max={1} def={0} format={pct} onChange={(v) => G({ hsl: { ...g.hsl, lum: v } }, 'hsl-l')} />
          </>
        )}
      </Section>

      <Section
        title="LUT (.cube)"
        right={
          g.lut ? (
            <button className="icon-btn sm" title="Quitar LUT" onClick={() => G({ lut: undefined }, 'lut')}>
              <X size={12} />
            </button>
          ) : null
        }
      >
        {g.lut ? (
          <>
            <div className="muted" style={{ fontSize: 12 }}>{g.lut.name} · {g.lut.size}³</div>
            <Slider label="Intensidad" value={g.lutMix} min={0} max={1} def={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => G({ lutMix: v }, 'lutmix')} />
          </>
        ) : (
          <button
            className="btn"
            onClick={async () => {
              const f = await window.api.readTextFile(['cube']);
              if (!f) return;
              try {
                const lut = parseCube(f.text);
                G({ lut: { name: f.name, ...lut }, lutMix: 1 }, 'lut');
              } catch (e: any) {
                s.notify(e.message);
              }
            }}
          >
            <Upload size={13} /> Importar LUT
          </button>
        )}
      </Section>
    </div>
  );
}
