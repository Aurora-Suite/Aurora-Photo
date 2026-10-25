import { FilePlus2, FolderOpen, Redo2, Save, Share, Undo2, X } from 'lucide-react';
import { useStore } from '../store';
import { openDialog, saveProject } from '../lib/actions';
import { BrandMark } from './ui';

export default function TitleBar({ platform }: { platform: string }) {
  const doc = useStore((s) => s.doc);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const s = useStore.getState();
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl+';

  return (
    <div className={`titlebar ${platform === 'darwin' ? 'mac' : 'win'}`}>
      <div className="brand" title="Aurora Photo">
        <BrandMark size={24} />
      </div>
      <div className="title-actions">
        <button className="icon-btn" title={`Nuevo (${mod}N)`} onClick={() => s.set({ newOpen: true })}>
          <FilePlus2 size={16} />
        </button>
        <button className="icon-btn" title={`Abrir (${mod}O)`} onClick={openDialog}>
          <FolderOpen size={16} />
        </button>
        <button className="icon-btn" title={`Guardar proyecto (${mod}S)`} disabled={!doc} onClick={() => saveProject()}>
          <Save size={16} />
        </button>
        <span className="tb-sep" />
        <button className="icon-btn" title={`Deshacer (${mod}Z)`} disabled={!canUndo} onClick={s.undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title={`Rehacer (${mod}Y)`} disabled={!canRedo} onClick={s.redo}>
          <Redo2 size={16} />
        </button>
      </div>
      <div className="title-center">
        {doc && (
          <>
            <input value={doc.name} onChange={(e) => s.set({ doc: { ...doc, name: e.target.value }, dirty: true })} spellCheck={false} />
            {dirty && <span className="dirty-dot" title="Cambios sin guardar" />}
            <button className="icon-btn sm" title="Cerrar documento" onClick={() => (!dirty || confirm('¿Cerrar el documento? Los cambios sin guardar se perderán.')) && s.closeDoc()}>
              <X size={13} />
            </button>
          </>
        )}
      </div>
      <div className="title-actions">
        <button className="btn primary" disabled={!doc} onClick={() => s.set({ exportOpen: true })}>
          <Share size={14} /> Exportar
        </button>
      </div>
    </div>
  );
}
