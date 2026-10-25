const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  testMode: !!process.env.AURORA_TEST,
  info: () => ipcRenderer.invoke('app:info'),
  openImages: (multi) => ipcRenderer.invoke('image:open', multi),
  readTextFile: (exts) => ipcRenderer.invoke('file:readText', exts),
  pathForFile: (file) => webUtils.getPathForFile(file),
  saveProject: (data, filePath, name) => ipcRenderer.invoke('project:save', { data, filePath, name }),
  openProject: () => ipcRenderer.invoke('project:open'),
  autosave: (data) => ipcRenderer.invoke('project:autosave', data),
  restore: () => ipcRenderer.invoke('project:restore'),
  clearAutosave: () => ipcRenderer.invoke('project:clearAutosave'),
  pickExportPath: (name, ext) => ipcRenderer.invoke('export:pickPath', { name, ext }),
  writeFile: (filePath, bytes) => ipcRenderer.invoke('file:write', { filePath, bytes }),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
});
