const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog, powerMonitor, clipboard, globalShortcut } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fileManager = require('./fileManager')
const themeManager = require('./themeManager')
const windowStateManager = require('./windowStateManager')
const { VaultSession } = require('./vaultSession')
const { createClipboardManager } = require('./clipboardManager')
const { normalizeWebsiteOrigin, normalizeExecutablePath, findCredentialsForApp, findMatchingAppTarget } = require('./credentialMatcher')
const { createBridgeServer, getCurrentUserSid, writeBridgeConfig } = require('./bridgeServer')
const { createNativeHostManager } = require('./nativeHostManager')
const { createAppSettingsManager } = require('./appSettingsManager')

const isDev = !app.isPackaged
// 用户主动开启置顶时使用 Electron 支持的高层级，兼容部分 Windows 环境默认 floating 层级不稳定的问题。
const TOPMOST_WINDOW_LEVEL = 'screen-saver'

// 图标路径：开发环境用源码目录，打包后用 extraResources
const iconPath = isDev
  ? path.join(__dirname, '../src/images/icon.png')
  : path.join(process.resourcesPath, 'icon.png')

let mainWindow
let tray
let forceQuit = false
// 记录用户期望的置顶状态，避免单纯依赖系统实时状态导致按钮被轮询错误地改回未选中。
let desiredAlwaysOnTop = false
let pendingQuit = false
let quitFallbackTimer = null
let saveMainWindowSize = () => {}
let vaultSession
let clipboardManager
let bridgeServer
let nativeHostManager
let appSettingsManager

function getBridgeExecutablePath() {
  return isDev
    ? path.join(__dirname, '../native-bridge/publish/SafeVault.Bridge.exe')
    : path.join(process.resourcesPath, 'native-bridge/SafeVault.Bridge.exe')
}

function runBridgeCommand(command, payload, timeoutMs = 5_000) {
  return new Promise(resolve => {
    const child = spawn(getBridgeExecutablePath(), [command], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    })
    let output = ''
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish({ success: false, code: 'automation-timeout' })
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      output += chunk
      if (Buffer.byteLength(output, 'utf8') > 1024 * 1024) {
        child.kill()
        finish({ success: false, code: 'automation-response-too-large' })
      }
    })
    child.on('error', () => finish({ success: false, code: 'bridge-unavailable' }))
    child.on('close', () => {
      if (settled) return
      try {
        finish(JSON.parse(output))
      } catch {
        finish({ success: false, code: 'invalid-bridge-response' })
      }
    })
    child.stdin.end(payload === undefined ? '' : JSON.stringify(payload))
  })
}

function findAccountById(data, accountId) {
  return (Array.isArray(data?.tabs) ? data.tabs : [])
    .flatMap(tab => Array.isArray(tab.accounts) ? tab.accounts : [])
    .find(account => account?.id === accountId) || null
}

function isSafeVaultExecutable(executablePath) {
  const targetPath = normalizeExecutablePath(executablePath)
  const currentPath = normalizeExecutablePath(process.execPath)
  return Boolean(targetPath && currentPath && targetPath.toLowerCase() === currentPath.toLowerCase())
}

async function handleDesktopAutofill() {
  if (vaultSession?.getStatus().state !== 'unlocked') {
    showMainWindow()
    await dialog.showMessageBox(mainWindow, { type: 'warning', message: '请先解锁 SafeVault，再使用桌面自动填充。' })
    return
  }
  const inspected = await runBridgeCommand('desktop-inspect')
  if (!inspected.appIdentity) {
    await dialog.showMessageBox(mainWindow, { type: 'warning', message: `无法识别或安全访问当前程序（${inspected.code || 'unknown'}）。` })
    return
  }
  if (isSafeVaultExecutable(inspected.appIdentity.executablePath)) {
    await dialog.showMessageBox(mainWindow, { type: 'warning', message: '不能向 SafeVault 自身执行桌面填充。' })
    return
  }
  const data = await vaultSession.requireData()
  const summaries = findCredentialsForApp(data, inspected.appIdentity)
  if (summaries.length === 0) {
    await dialog.showMessageBox(mainWindow, { type: 'info', message: '当前前台程序没有匹配的已启用账号规则。' })
    return
  }
  const buttons = [...summaries.map(summary => summary.accountName || summary.username || '未命名账号'), '取消']
  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'SafeVault 桌面填充',
    message: '请选择要填充到当前程序的账号。',
    buttons,
    cancelId: buttons.length - 1,
    defaultId: 0,
    noLink: true,
  })
  if (choice.response >= summaries.length) return
  const account = findAccountById(data, summaries[choice.response].id)
  const target = findMatchingAppTarget(account, inspected.appIdentity)
  if (!account || !target) return
  if (target.fillStrategy === 'clipboard') {
    const clipboardChoice = await dialog.showMessageBox({
      type: 'question',
      title: 'SafeVault 剪贴板兜底',
      message: '请选择要复制的字段；仅当前剪贴板仍由 SafeVault 持有时，内容会在 30 秒后清理。',
      buttons: ['复制账号', '复制密码', '取消'],
      cancelId: 2,
      defaultId: 0,
      noLink: true,
    })
    if (clipboardChoice.response === 0 && account.username) clipboardManager.copySecret(account.username)
    if (clipboardChoice.response === 1 && account.password) clipboardManager.copySecret(account.password)
    return
  }
  if (target.fillStrategy === 'keystroke') {
    if (!account.username || !account.password) {
      await dialog.showMessageBox({ type: 'warning', message: '模拟粘贴要求账号和密码均非空。' })
      return
    }
    clipboardManager.copySecret(account.username)
    const usernameResult = await runBridgeCommand('desktop-paste', {
      expectedExecutablePath: target.executablePath,
      windowTitlePattern: target.windowTitlePattern || null,
      pressTabAfter: true,
    })
    if (!usernameResult.success) {
      clipboardManager.clearOwnedSecret()
      await dialog.showMessageBox({ type: 'warning', message: `未执行模拟粘贴（${usernameResult.code || 'unknown'}）。` })
      return
    }
    clipboardManager.copySecret(account.password)
    const passwordResult = await runBridgeCommand('desktop-paste', {
      expectedExecutablePath: target.executablePath,
      windowTitlePattern: target.windowTitlePattern || null,
      pressTabAfter: false,
    })
    await new Promise(resolve => setTimeout(resolve, 150))
    clipboardManager.clearOwnedSecret()
    await dialog.showMessageBox({
      type: passwordResult.success ? 'info' : 'warning',
      message: passwordResult.success ? '账号密码已模拟粘贴，提交前请核对。' : `密码未粘贴（${passwordResult.code || 'unknown'}）。`,
    })
    return
  }
  const result = await runBridgeCommand('desktop-fill', {
    expectedExecutablePath: target.executablePath,
    windowTitlePattern: target.windowTitlePattern || null,
    username: typeof account.username === 'string' ? account.username : '',
    password: typeof account.password === 'string' ? account.password : '',
    usernameSelector: target.usernameSelector || null,
    passwordSelector: target.passwordSelector || null,
  })
  await dialog.showMessageBox(mainWindow, {
    type: result.success ? 'info' : 'warning',
    message: result.success ? '账号密码已填入，提交前请核对。' : `未执行填充（${result.code || 'unknown'}）。`,
  })
}

// 单实例检查
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，将焦点设置到主窗口
    if (mainWindow) {
      showMainWindow()
    }
  })

  // 只有获得单实例锁的应用才启动
  app.whenReady().then(async () => {
    appSettingsManager = createAppSettingsManager()
    const appSettings = appSettingsManager.readSettings()
    nativeHostManager = createNativeHostManager({
      bridgePath: getBridgeExecutablePath(),
      manifestDirectory: path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'SafeVault', 'NativeMessagingHosts'),
    })
    try {
      await nativeHostManager.repairRegistration()
    } catch (error) {
      console.error(`SafeVault Native Host 注册修复失败：${error.message}`)
    }
    clipboardManager = createClipboardManager({
      readText: () => clipboard.readText(),
      writeText: value => clipboard.writeText(value),
    })
    vaultSession = new VaultSession({
      unlock: password => fileManager.unlockVault(password),
      lock: () => fileManager.lockVault(),
      idleTimeoutMinutes: appSettings.idleTimeoutMinutes,
      onStateChange: status => {
        if (status.state === 'locked') clipboardManager.clearOwnedSecret()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vault-status-changed', status)
        }
      },
    })
    powerMonitor.on('lock-screen', () => {
      void vaultSession.lock('system')
    })
    try {
      bridgeServer = createBridgeServer({
        userSid: getCurrentUserSid(),
        isUnlocked: () => vaultSession.getStatus().state === 'unlocked',
        getVaultData: () => vaultSession.requireData(),
        updateCredential: async ({ accountId, newPassword }) => {
          const currentData = await vaultSession.requireData()
          const updatedData = structuredClone(currentData)
          const account = updatedData.tabs
            ?.flatMap(tab => Array.isArray(tab.accounts) ? tab.accounts : [])
            .find(item => item?.id === accountId)
          if (!account) return { success: false }
          account.password = newPassword
          account.updatedAt = new Date().toISOString()
          const result = await fileManager.writeEncryptedData(updatedData)
          if (!result.success) return result
          vaultSession.replaceData(result.data)
          vaultSession.touch()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('vault-credential-updated', { accountId, newPassword, updatedAt: account.updatedAt })
          }
          return { success: true }
        },
      })
      writeBridgeConfig({
        ...bridgeServer,
        appPath: isDev ? null : process.execPath,
        bridgePath: getBridgeExecutablePath(),
      })
      await bridgeServer.start()
    } catch (error) {
      console.error(`SafeVault Bridge 服务启动失败：${error.message}`)
    }
    createWindow()
    createTray()
    if (!globalShortcut.register('CommandOrControl+Shift+L', () => void handleDesktopAutofill())) {
      void dialog.showMessageBox(mainWindow, {
        type: 'warning',
        message: '快捷键 Ctrl+Shift+L 已被其他程序占用，桌面自动填充快捷键未启用。',
      })
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // 窗口关闭后程序仍在托盘中运行，不自动退出
  app.on('window-all-closed', () => {})

  // 应用退出前清理
  app.on('before-quit', (e) => {
    // 系统关机、托盘退出、应用退出前都先保存一次尺寸，兜底处理未触发 window-close 的情况。
    saveMainWindowSize()
    if (!forceQuit) {
      e.preventDefault()
      requestAppQuit()
    }
  })

  // 应用退出事件
  app.on('will-quit', (e) => {
    if (!forceQuit) {
      e.preventDefault()
    } else {
      globalShortcut.unregisterAll()
      if (tray) {
        tray.destroy()
        tray = null
      }
    }
  })
}

function createWindow() {
  const savedWindowSize = windowStateManager.getWindowOptions()
  let saveWindowSizeTimer = null
  saveMainWindowSize = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // 只记录普通窗口尺寸；最大化/全屏时保存会让下次启动尺寸失真。
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return
    windowStateManager.saveWindowSize(mainWindow.getBounds())
  }
  const scheduleSaveWindowSize = () => {
    if (saveWindowSizeTimer) clearTimeout(saveWindowSizeTimer)
    // 拖拽调整尺寸会连续触发 resize，防抖写入可以减少磁盘写入次数。
    saveWindowSizeTimer = setTimeout(saveMainWindowSize, 400)
  }

  mainWindow = new BrowserWindow({
    width: savedWindowSize.width,
    height: savedWindowSize.height,
    // 创建窗口与状态持久化复用同一尺寸限制，防止两处配置漂移后把合法尺寸回退为默认值。
    minWidth: windowStateManager.MIN_WINDOW_SIZE.width,
    minHeight: windowStateManager.MIN_WINDOW_SIZE.height,
    frame: false,
    icon: iconPath,
    // 立即显示窗口，背景色与标题栏一致，避免白屏等待
    backgroundColor: '#1E293B',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:7331')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 拦截关闭事件：隐藏到托盘而不退出程序
  mainWindow.on('close', (e) => {
    saveMainWindowSize()
    if (!forceQuit) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('resize', scheduleSaveWindowSize)
  mainWindow.on('show', () => {
    // 窗口从托盘或任务栏恢复时，重新应用用户主动开启的置顶状态，避免 Windows 桌面环境丢失 TOPMOST 标记。
    reapplyAlwaysOnTop()
  })
  mainWindow.on('restore', () => {
    // 任务栏点击最小化窗口后会触发 restore，这里只做前台抬升，避免再次 restore 造成事件重入。
    raiseMainWindowToFront()
  })
  mainWindow.on('session-end', () => {
    // Windows 注销/关机时会触发 session-end，立即保存可以覆盖用户不手动关闭进程的场景。
    saveMainWindowSize()
  })
}

function hasMainWindow() {
  // 所有窗口控制入口先走同一个可用性判断，避免托盘回调或 IPC 在窗口已销毁时访问失效对象。
  return mainWindow && !mainWindow.isDestroyed()
}

function destroyTray() {
  // 托盘销毁集中到一个函数里，避免退出路径多次 destroy 导致不同 Windows 版本下出现残留图标或异常。
  if (tray) {
    tray.destroy()
    tray = null
  }
}

function finalizeAppQuit() {
  // 渲染层确认数据 flush 后才真正退出；fallback 计时器防止渲染进程异常时应用无法退出。
  if (quitFallbackTimer) {
    clearTimeout(quitFallbackTimer)
    quitFallbackTimer = null
  }
  forceQuit = true
  void vaultSession?.lock('quit')
  void bridgeServer?.stop()
  destroyTray()
  app.quit()
}

function requestAppQuit() {
  if (pendingQuit) return
  pendingQuit = true
  saveMainWindowSize()

  if (hasMainWindow() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    // 真正退出前通知渲染层清空防抖保存队列；超时后仍退出，避免异常页面阻塞用户关闭应用。
    mainWindow.webContents.send('app-before-quit')
    quitFallbackTimer = setTimeout(finalizeAppQuit, 1500)
  } else {
    finalizeAppQuit()
  }
}

function normalizeExternalUrl(rawUrl) {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!value) return null

  try {
    // 用户经常只填写域名；没有协议时按 HTTPS 补齐，但仍只允许 http/https 交给系统浏览器。
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function reapplyAlwaysOnTop() {
  if (!hasMainWindow() || !desiredAlwaysOnTop) return
  // 系统仍然保留 TOPMOST 标记时不重复设置，减少状态轮询期间对原生窗口层级的打扰。
  if (mainWindow.isAlwaysOnTop()) return
  // Windows 上默认置顶层级在部分系统环境中不稳定，使用 Electron 支持的高层级来表达用户明确开启的置顶意图。
  mainWindow.setAlwaysOnTop(true, TOPMOST_WINDOW_LEVEL)
}

function raiseMainWindowToFront() {
  if (!hasMainWindow()) return

  // 这里专注处理已经可恢复的窗口：显示、补置顶、抬高 Z 序并请求焦点。
  mainWindow.show()
  reapplyAlwaysOnTop()

  // moveTop() 只调整窗口 Z 序，不依赖焦点抢占；配合 focus() 可以覆盖部分 Windows 环境中任务栏点击不前置的问题。
  if (typeof mainWindow.moveTop === 'function') mainWindow.moveTop()
  mainWindow.focus()
}

function showMainWindow() {
  if (!hasMainWindow()) return

  // show() 不一定会恢复最小化窗口，先 restore 再统一抬到前台，保证任务栏和托盘入口都能把窗口带回可见状态。
  if (mainWindow.isMinimized()) mainWindow.restore()
  raiseMainWindowToFront()
}

function getMainWindowState() {
  if (!hasMainWindow()) {
    return {
      isAlwaysOnTop: false,
      isFullScreen: false,
      isMaximized: false,
    }
  }

  reapplyAlwaysOnTop()
  return {
    // 按钮展示用户当前选择的置顶模式，实际 TOPMOST 标记由 reapplyAlwaysOnTop 持续兜底维护。
    isAlwaysOnTop: desiredAlwaysOnTop,
    isFullScreen: mainWindow.isFullScreen(),
    isMaximized: mainWindow.isMaximized(),
  }
}

function setMainWindowAlwaysOnTop(alwaysOnTop) {
  if (!hasMainWindow()) return getMainWindowState()

  desiredAlwaysOnTop = Boolean(alwaysOnTop)
  if (desiredAlwaysOnTop) {
    reapplyAlwaysOnTop()
    showMainWindow()
  } else {
    mainWindow.setAlwaysOnTop(false)
  }

  return getMainWindowState()
}

function createTray() {
  tray = new Tray(iconPath)
  tray.setToolTip('密码保险箱')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // 托盘退出需要先等待渲染层 flush 当前数据，不能直接 app.quit()。
        requestAppQuit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', showMainWindow)
}


// Window control IPC
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-toggle-maximize', () => {
  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false)
  } else if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})
// 标题栏 X 按鈕：隐藏到托盘
ipcMain.on('window-close', () => {
  // 标题栏关闭和 ESC 都会走这个 IPC，隐藏前立即保存尺寸，避免用户刚调整窗口就关闭时丢失尺寸。
  saveMainWindowSize()
  mainWindow.hide()
})
ipcMain.handle('window-toggle-top', (event, alwaysOnTop) => setMainWindowAlwaysOnTop(alwaysOnTop))

// Window state IPC
ipcMain.handle('get-window-state', () => {
  return getMainWindowState()
})

// File operation IPC
ipcMain.handle('vault-inspect', async () => {
  const result = await fileManager.inspectVault()
  // 渲染层只需要状态来选择创建、迁移或解锁界面，不返回密文、文件路径等内部信息。
  if (result.state === 'locked') return { state: 'locked' }
  return result
})
ipcMain.handle('vault-unlock', async (event, password) => {
  return await vaultSession.unlock(password)
})
ipcMain.handle('vault-create', async (event, password) => {
  const result = await fileManager.createVault(password)
  if (result.success) vaultSession.adoptData(result.data)
  return result
})
ipcMain.handle('vault-migrate', async (event, password) => {
  const result = await fileManager.migratePlaintextVault(password)
  if (result.success) vaultSession.adoptData(result.data)
  return result
})
ipcMain.handle('vault-lock', async (event, reason = 'manual') => {
  return await vaultSession.lock(reason)
})
ipcMain.handle('vault-touch', () => {
  vaultSession.touch()
  return vaultSession.getStatus()
})
ipcMain.handle('vault-set-idle-timeout', (event, minutes) => {
  const saveResult = appSettingsManager.saveIdleTimeoutMinutes(minutes)
  if (!saveResult.success) return saveResult
  vaultSession.setIdleTimeoutMinutes(minutes)
  return { success: true, status: vaultSession.getStatus() }
})
ipcMain.handle('vault-copy-secret', (event, value, ttlMs = 30_000) => {
  if (vaultSession.getStatus().state !== 'unlocked') {
    return { success: false, error: '密码库尚未解锁，不能复制敏感信息。' }
  }
  try {
    return clipboardManager.copySecret(value, ttlMs)
  } catch (error) {
    return { success: false, error: error.message }
  }
})
ipcMain.handle('login-target-normalize-website', (event, value) => {
  const origin = normalizeWebsiteOrigin(value)
  return origin
    ? { success: true, origin }
    : { success: false, error: '请输入完整的 HTTP 或 HTTPS 网站地址。' }
})
ipcMain.handle('login-target-select-executable', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择登录程序',
    filters: [{ name: 'Windows 程序', extensions: ['exe'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths?.[0]) return { success: false, cancelled: true }
  const executablePath = normalizeExecutablePath(filePaths[0])
  return executablePath
    ? { success: true, executablePath }
    : { success: false, error: '只能选择本机绝对路径下的 .exe 程序。' }
})
ipcMain.handle('login-target-capture-foreground', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false, code: 'window-unavailable' }
  mainWindow.hide()
  await new Promise(resolve => setTimeout(resolve, 1500))
  const result = await runBridgeCommand('desktop-inspect')
  showMainWindow()
  if (result?.appIdentity && isSafeVaultExecutable(result.appIdentity.executablePath)) {
    return { success: false, code: 'unsafe-target' }
  }
  return result
})

ipcMain.handle('vault-write-data', async (event, data) => {
  if (vaultSession.getStatus().state !== 'unlocked') {
    return { success: false, error: '密码库尚未解锁，不能写入数据。' }
  }
  const result = await fileManager.writeEncryptedData(data)
  if (result.success) vaultSession.replaceData(result.data)
  return result
})
ipcMain.handle('vault-export-encrypted', async () => {
  if (vaultSession.getStatus().state !== 'unlocked') return { success: false, error: '密码库尚未解锁。' }
  return await fileManager.exportEncryptedVault(mainWindow)
})
ipcMain.handle('vault-import-encrypted', async (event, password) => {
  if (vaultSession.getStatus().state !== 'unlocked') return { success: false, error: '密码库尚未解锁。' }
  return await fileManager.importEncryptedVault(mainWindow, password)
})
ipcMain.handle('vault-export-plaintext', async (event, password) => {
  if (vaultSession.getStatus().state !== 'unlocked') return { success: false, error: '密码库尚未解锁。' }
  return await fileManager.exportPlaintextVault(mainWindow, password)
})
ipcMain.handle('native-host-status', async () => {
  return await nativeHostManager.getStatus()
})
ipcMain.handle('native-host-register', async (event, extensionIds) => {
  try {
    return await nativeHostManager.register(extensionIds || {})
  } catch (error) {
    return { success: false, error: error.message }
  }
})
ipcMain.handle('native-host-unregister', async () => {
  try {
    return await nativeHostManager.unregister()
  } catch (error) {
    return { success: false, error: error.message }
  }
})
ipcMain.handle('read-custom-themes', async () => {
  return await themeManager.readCustomThemes()
})
ipcMain.handle('import-theme-file', async () => {
  return await themeManager.importThemeFile(mainWindow)
})
ipcMain.handle('delete-custom-theme', async (event, themeId) => {
  return await themeManager.deleteCustomTheme(themeId)
})

ipcMain.handle('show-message-box', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options)
})

ipcMain.handle('renderer-ready-to-quit', () => {
  finalizeAppQuit()
  return { success: true }
})

ipcMain.handle('open-url', async (event, url) => {
  const externalUrl = normalizeExternalUrl(url)
  if (!externalUrl) {
    return { success: false, error: '仅支持 http/https 链接。' }
  }

  try {
    await shell.openExternal(externalUrl)
    return { success: true, url: externalUrl }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
