import { useEffect, useState } from 'react';
import { SlidersHorizontal, Layers as LayersIcon } from 'lucide-react';
import { useStore } from './store';
import TitleBar from './components/TitleBar';
import Toolbar from './components/Toolbar';
import ToolOptions from './components/ToolOptions';
import Canvas from './components/Canvas';
import Histogram from './components/Histogram';
import DevelopPanel from './components/DevelopPanel';
import PropsPanel from './components/PropsPanel';
import LayersPanel from './components/LayersPanel';
import StartScreen, { NewDocDialog } from './components/StartScreen';
import ExportDialog from './components/ExportDialog';
import Boundary from './components/Boundary';
import { Segmented } from './components/ui';
import { importFiles, openDialog, placeImages, saveProject } from './lib/actions';
import { forget } from './lib/render';
import type { Tool } from './types';

const TOOL_KEYS: Record<string, Tool> = { v: 'move', c: 'crop', b: 'brush', e: 'eraser', t: 'text', u: 'shape', i: 'eyedropper', h: 'hand', z: 'zoom' };

function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const s = useStore.getState();
      if (s.exportOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const handled = () => e.preventDefault();
      if (mod && k === 'z' && !e.shiftKey) return handled(), s.undo();
      if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) return handled(), s.redo();
      if (mod && k === 's') return handled(), saveProject(e.shiftKey);
      if (mod && k === 'o') return handled(), openDialog();
      if (mod && k === 'n') return handled(), s.set({ newOpen: true });
      if (!s.doc) return;
      if (mod && k === 'e') return handled(), s.set({ exportOpen: true });
      if (mod && k === 'j') return handled(), s.selected && s.duplicateLayer(s.selected);
      if (mod && k === 'i') return handled(), placeImages();
      if (mod && k === '0') return handled(), s.set({ fitTick: s.fitTick + 1 });
      if (mod && (k === '+' || k === '=')) return handled(), s.set({ zoom: s.zoom * 1.25 });
      if (mod && k === '-') return handled(), s.set({ zoom: s.zoom / 1.25 });
      if (mod) return;
      if (k === '\\') return handled(), s.set({ compare: true });
      if (k === 'delete' || k === 'backspace') return handled(), s.selected && s.removeLayer(s.selected);
      if (k === '[') return s.set({ brush: { ...s.brush, size: Math.max(1, Math.round(s.brush.size / 1.15)) } });
      if (k === ']') return s.set({ brush: { ...s.brush, size: Math.min(2000, Math.round(s.brush.size * 1.15) + 1) } });
      if (k === 'escape') return s.set({ selected: null });
      if (TOOL_KEYS[k]) return s.set({ tool: TOOL_KEYS[k] });
      // Flechas: mover la capa seleccionada (Mayús = 10 px)
      const sel = s.layers.find((l) => l.id === s.selected);
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
      if (sel && arrows[k] && !sel.locked) return handled(), s.updateLayer(sel.id, { x: sel.x + arrows[k][0], y: sel.y + arrows[k][1] }, 'nudge');
    };
    const up = (e: KeyboardEvent) => e.key === '\\' && useStore.setState({ compare: false });
    // Pegar imágenes del portapapeles como capa nueva (o documento si no hay ninguno).
    const paste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      if (files.length) importFiles(files);
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('paste', paste);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('paste', paste);
    };
  }, []);
}

// Autoguardado cada 10 s con cambios; al abrir se restaura la última sesión.
function useAutosave() {
  useEffect(() => {
    let restored = false;
    window.api.restore().then(async (data) => {
      const s = useStore.getState();
      if (data?.doc && !s.doc) {
        try {
          await s.loadProject(data.project ?? data, data.filePath ?? null);
          useStore.setState({ dirty: !!data.dirty });
          s.notify('Sesión anterior restaurada');
        } catch {}
      }
      restored = true;
    });
    let lastLayers: unknown = null;
    let lastDoc: unknown = null;
    const id = setInterval(() => {
      const s = useStore.getState();
      if (!restored || !s.doc || !s.dirty || (s.layers === lastLayers && s.doc === lastDoc)) return;
      lastLayers = s.layers;
      lastDoc = s.doc;
      window.api.autosave({ ...s.toProject(), filePath: s.filePath, dirty: s.dirty }).catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, []);
}

export default function App() {
  const doc = useStore((s) => s.doc);
  const layers = useStore((s) => s.layers);
  const toast = useStore((s) => s.toast);
  const exportOpen = useStore((s) => s.exportOpen);
  const newOpen = useStore((s) => s.newOpen);
  const [platform, setPlatform] = useState('win32');
  const [tab, setTab] = useState<'develop' | 'layer'>('develop');
  useShortcuts();
  useAutosave();

  useEffect(() => {
    window.api.info().then((i) => setPlatform(i.platform));
  }, []);
  useEffect(() => forget(new Set(layers.map((l) => l.id))), [layers]);
  // Al seleccionar texto o forma, el panel útil es «Capa».
  const selKind = useStore((s) => s.layers.find((l) => l.id === s.selected)?.kind);
  const selId = useStore((s) => s.selected);
  useEffect(() => {
    if (selKind === 'text' || selKind === 'shape') setTab('layer');
    if (selKind === 'image') setTab('develop');
  }, [selKind, selId]);

  return (
    <div className="app">
      <TitleBar platform={platform} />
      {doc ? (
        <div className="photo-ws">
          <Boundary name="Herramientas">
            <Toolbar />
          </Boundary>
          <div className="center-col">
            <ToolOptions />
            <div className="panel stage-panel">
              <Boundary name="Lienzo">
                <Canvas />
              </Boundary>
            </div>
          </div>
          <div className="right-col">
            <div className="panel histo-panel">
              <Histogram />
            </div>
            <div className="panel side-panel">
              <div className="side-tabs">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'develop', label: <><SlidersHorizontal size={13} /> Revelar</> },
                    { value: 'layer', label: <><LayersIcon size={13} /> Capa</> },
                  ]}
                />
              </div>
              <div className="panel-body">
                <Boundary name={tab === 'develop' ? 'Revelar' : 'Capa'}>{tab === 'develop' ? <DevelopPanel /> : <PropsPanel />}</Boundary>
              </div>
            </div>
            <div className="panel layers-panel">
              <Boundary name="Capas">
                <LayersPanel />
              </Boundary>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="start-wrap"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            importFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <StartScreen />
        </div>
      )}
      {exportOpen && doc && <ExportDialog />}
      {newOpen && <NewDocDialog />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
