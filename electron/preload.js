const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // 置顶需要等待主进程确认后的窗口状态，避免渲染层按钮先选中又被轮询状态覆盖。
  toggleAlwaysOnTop: (value) => ipcRenderer.invoke('window-toggle-top', value),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),

  // File operations
  readData: () => ipcRenderer.invoke('read-data'),
  writeData: (data) => ipcRenderer.invoke('write-data', data),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  readCustomThemes: () => ipcRenderer.invoke('read-custom-themes'),
  importThemeFile: () => ipcRenderer.invoke('import-theme-file'),

  // Open external URL
  // 打开外部链接需要等待主进程完成协议校验，失败时调用方可以给出用户提示。
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  // 托盘退出前主进程会请求渲染层 flush 防抖保存队列；返回清理函数避免热更新重复注册监听。
  onBeforeAppQuit: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app-before-quit', listener)
    return () => ipcRenderer.removeListener('app-before-quit', listener)
  },
  quitAfterRendererFlush: () => ipcRenderer.invoke('renderer-ready-to-quit'),

  // Dialog
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
})
