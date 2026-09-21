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
  inspectVault: () => ipcRenderer.invoke('vault-inspect'),
  unlockVault: (password) => ipcRenderer.invoke('vault-unlock', password),
  createVault: (password) => ipcRenderer.invoke('vault-create', password),
  migrateVault: (password) => ipcRenderer.invoke('vault-migrate', password),
  lockVault: (reason = 'manual') => ipcRenderer.invoke('vault-lock', reason),
  touchVault: () => ipcRenderer.invoke('vault-touch'),
  setVaultIdleTimeout: (minutes) => ipcRenderer.invoke('vault-set-idle-timeout', minutes),
  onVaultStatusChanged: (callback) => {
    const listener = (event, status) => callback(status)
    ipcRenderer.on('vault-status-changed', listener)
    return () => ipcRenderer.removeListener('vault-status-changed', listener)
  },
  onVaultCredentialUpdated: (callback) => {
    const listener = (event, update) => callback(update)
    ipcRenderer.on('vault-credential-updated', listener)
    return () => ipcRenderer.removeListener('vault-credential-updated', listener)
  },
  writeVaultData: (data) => ipcRenderer.invoke('vault-write-data', data),
  copySecret: (value, ttlMs = 30_000) => ipcRenderer.invoke('vault-copy-secret', value, ttlMs),
  normalizeWebsiteTarget: (value) => ipcRenderer.invoke('login-target-normalize-website', value),
  selectExecutableTarget: () => ipcRenderer.invoke('login-target-select-executable'),
  captureForegroundTarget: () => ipcRenderer.invoke('login-target-capture-foreground'),
  exportEncryptedVault: () => ipcRenderer.invoke('vault-export-encrypted'),
  importEncryptedVault: (password) => ipcRenderer.invoke('vault-import-encrypted', password),
  exportPlaintextVault: (password) => ipcRenderer.invoke('vault-export-plaintext', password),
  getNativeHostStatus: () => ipcRenderer.invoke('native-host-status'),
  registerNativeHost: (extensionIds) => ipcRenderer.invoke('native-host-register', extensionIds),
  unregisterNativeHost: () => ipcRenderer.invoke('native-host-unregister'),
  readCustomThemes: () => ipcRenderer.invoke('read-custom-themes'),
  importThemeFile: () => ipcRenderer.invoke('import-theme-file'),
  // 删除主题必须走主进程统一校验并写入用户数据目录，避免渲染层直接接触本地文件路径。
  deleteCustomTheme: (themeId) => ipcRenderer.invoke('delete-custom-theme', themeId),

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
