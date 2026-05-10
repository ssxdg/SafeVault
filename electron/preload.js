const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleAlwaysOnTop: (value) => ipcRenderer.send('window-toggle-top', value),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),

  // File operations
  readData: () => ipcRenderer.invoke('read-data'),
  writeData: (data) => ipcRenderer.invoke('write-data', data),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),

  // Open external URL
  openUrl: (url) => ipcRenderer.send('open-url', url),
})
