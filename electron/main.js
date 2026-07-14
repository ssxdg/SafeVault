const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron')
const path = require('path')
const fileManager = require('./fileManager')
const themeManager = require('./themeManager')
const windowStateManager = require('./windowStateManager')

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
  app.whenReady().then(() => {
    createWindow()
    createTray()
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
ipcMain.handle('read-data', async () => {
  return await fileManager.readData()
})
ipcMain.handle('write-data', async (event, data) => {
  return await fileManager.writeData(data)
})
ipcMain.handle('export-data', async (event, data) => {
  return await fileManager.exportData(mainWindow, data)
})
ipcMain.handle('import-data', async () => {
  return await fileManager.importData(mainWindow)
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
