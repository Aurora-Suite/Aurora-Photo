import { useStore } from '../store';
import { loadImage, renderExport } from './render';

const baseName = (p: string) => (p.split(/[\\/]/).pop() || p).replace(/\.[^.]+$/, '');

export async function openImageAsDoc(src: string, name = baseName(src)) {
  const s = useStore.getState();
  try {
    const img = await loadImage(src);
    s.newDoc({ name, width: img.naturalWidth, height: img.naturalHeight, background: 'transparent' });
    useStore.getState().addImageLayer(src, 'Fondo', img.naturalWidth, img.naturalHeight, false);
    useStore.setState({ past: [], dirty: false });
  } catch {
    s.notify('No se pudo abrir la imagen');
  }
}

export async function addImages(srcs: { src: string; name: string }[]) {
  const s = useStore.getState();
  if (!s.doc) {
    if (srcs[0]) await openImageAsDoc(srcs[0].src, srcs[0].name);
    srcs = srcs.slice(1);
  }
  for (const { src, name } of srcs) {
    try {
      const img = await loadImage(src);
      useStore.getState().addImageLayer(src, name, img.naturalWidth, img.naturalHeight);
    } catch {
      s.notify(`No se pudo abrir ${name}`);
    }
  }
}

export async function openDialog() {
  const r = await window.api.openProject();
  if (!r) return;
  if (r.image) return openImageAsDoc(r.filePath);
  await useStore.getState().loadProject(r.data, r.filePath);
}

export async function placeImages() {
  const paths = await window.api.openImages(true);
  await addImages(paths.map((p) => ({ src: p, name: baseName(p) })));
}

export async function saveProject(saveAs = false) {
  const s = useStore.getState();
  if (!s.doc) return;
  const path = await window.api.saveProject(s.toProject(), saveAs ? null : s.filePath, s.doc.name);
  if (path) {
    useStore.setState({ filePath: path, dirty: false });
    s.notify('Proyecto guardado');
  }
}

// Archivos soltados o pegados: rutas locales si existen; si no, data URL.
export async function importFiles(files: File[]) {
  const items: { src: string; name: string }[] = [];
  for (const f of files) {
    if (!f.type.startsWith('image/') && !/\.auphoto$/i.test(f.name)) continue;
    if (/\.auphoto$/i.test(f.name)) {
      const data = JSON.parse(await f.text());
      await useStore.getState().loadProject(data, window.api.pathForFile(f) || null);
      return;
    }
    const p = window.api.pathForFile(f);
    items.push({ src: p || (await fileToDataUrl(f)), name: baseName(f.name || 'Imagen pegada') });
  }
  if (items.length) await addImages(items);
}

const fileToDataUrl = (f: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });

export type ExportFormat = 'png' | 'jpg' | 'webp';

export function encode(canvas: HTMLCanvasElement, fmt: ExportFormat, quality: number): Promise<Blob> {
  const mime = fmt === 'png' ? 'image/png' : fmt === 'jpg' ? 'image/jpeg' : 'image/webp';
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('No se pudo codificar la imagen'))), mime, quality));
}

export async function exportImage(fmt: ExportFormat, quality: number, scale: number, matte: string) {
  const s = useStore.getState();
  if (!s.doc) return null;
  const path = await window.api.pickExportPath(s.doc.name, fmt);
  if (!path) return null;
  // JPG no admite transparencia: se compone sobre el color de fondo elegido.
  const bg = fmt === 'jpg' && s.doc.background === 'transparent' ? matte : undefined;
  const canvas = renderExport(s.doc, s.layers, scale, bg);
  const blob = await encode(canvas, fmt, quality);
  const size = await window.api.writeFile(path, await blob.arrayBuffer());
  return { path, size, w: canvas.width, h: canvas.height };
}
