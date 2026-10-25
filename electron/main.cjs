const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const isDev = !!process.env.AURORA_DEV;
// AURORA_PROFILE: perfil aislado para pruebas.
app.setName('Aurora Photo');
app.setPath('userData', process.env.AURORA_PROFILE || path.join(app.getPath('appData'), 'Aurora Photo'));
const isMac = process.platform === 'darwin';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg', 'ico'];
const PROJECT_EXT = 'auphoto';

let win;

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function handleMedia(request) {
  const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(stat.size), 'Access-Control-Allow-Origin': '*' },
  });
}

function createWindow() {
  const opts = {
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Aurora Photo',
    icon: path.join(__dirname, '..', 'build', isMac ? 'icon.png' : 'icon.ico'),
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  };
  if (isMac) {
    Object.assign(opts, { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, vibrancy: 'under-window', visualEffectState: 'active' });
  } else {
    Object.assign(opts, {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#e8e8ed', height: 44 },
      backgroundMaterial: 'mica',
    });
  }
  win = new BrowserWindow(opts);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('app:info', () => ({ platform: process.platform, version: app.getVersion() }));

ipcMain.handle(
  'image:open',
  async (_e, multi) => {
    const r = await dialog.showOpenDialog(win, {
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Imágenes', extensions: IMAGE_EXT }],
    });
    return r.canceled ? [] : r.filePaths;
  }
);

ipcMain.handle('file:readText', async (_e, exts) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: exts.join(', ').toUpperCase(), extensions: exts }] });
  if (r.canceled) return null;
  return { name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
});

ipcMain.handle(
  'project:save',
  async (_e, { data, filePath, name }) => {
    let target = filePath;
    if (!target) {
      const r = await dialog.showSaveDialog(win, {
        defaultPath: `${name || 'Sin título'}.${PROJECT_EXT}`,
        filters: [{ name: 'Proyecto Aurora Photo', extensions: [PROJECT_EXT] }],
      });
      if (r.canceled) return null;
      target = r.filePath;
    }
    fs.writeFileSync(target, JSON.stringify(data));
    return target;
  }
);

ipcMain.handle(
  'project:open',
  async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Proyectos e imágenes', extensions: [PROJECT_EXT, ...IMAGE_EXT] },
        { name: 'Proyecto Aurora Photo', extensions: [PROJECT_EXT] },
      ],
    });
    if (r.canceled) return null;
    const filePath = r.filePaths[0];
    if (!filePath.toLowerCase().endsWith(`.${PROJECT_EXT}`)) return { filePath, image: true };
    return { filePath, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  }
);

const autosavePath = () => path.join(app.getPath('userData'), 'autosave.json');
ipcMain.handle('project:autosave', async (_e, data) => fs.writeFileSync(autosavePath(), JSON.stringify(data)));
ipcMain.handle(
  'project:restore',
  async () => {
    try {
      return JSON.parse(fs.readFileSync(autosavePath(), 'utf8'));
    } catch {
      return null;
    }
  }
);
ipcMain.handle('project:clearAutosave', async () => fs.rmSync(autosavePath(), { force: true }));

ipcMain.handle(
  'export:pickPath',
  async (_e, { name, ext }) => {
    const labels = { png: 'PNG', jpg: 'JPEG', webp: 'WebP' };
    const r = await dialog.showSaveDialog(win, { defaultPath: `${name}.${ext}`, filters: [{ name: labels[ext] || ext.toUpperCase(), extensions: [ext] }] });
    return r.canceled ? null : r.filePath;
  }
);

ipcMain.handle(
  'file:write',
  async (_e, { filePath, bytes }) => {
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return fs.statSync(filePath).size;
  }
);

ipcMain.handle('shell:reveal', async (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  protocol.handle('media', handleMedia);
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
