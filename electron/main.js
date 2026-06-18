const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron')
const path = require('path')
const fileManager = require('./fileManager')
const themeManager = require('./themeManager')
const windowStateManager = require('./windowStateManager')

const isDev = !app.isPackaged

// 图标路径：开发环境用源码目录，打包后用 extraResources
const iconPath = isDev
  ? path.join(__dirname, '../src/images/icon.png')
  : path.join(process.resourcesPath, 'icon.png')

let mainWindow
let tray
let forceQuit = false
let saveMainWindowSize = () => {}

// 单实例检查
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，将焦点设置到主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
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
  app.on('before-quit', () => {
    // 系统关机、托盘退出、应用退出前都先保存一次尺寸，兜底处理未触发 window-close 的情况。
    saveMainWindowSize()
    forceQuit = true
    if (tray) {
      tray.destroy()
      tray = null
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
    minWidth: 700,
    minHeight: 500,
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
  mainWindow.on('session-end', () => {
    // Windows 注销/关机时会触发 session-end，立即保存可以覆盖用户不手动关闭进程的场景。
    saveMainWindowSize()
  })
}

function createTray() {
  tray = new Tray(iconPath)
  tray.setToolTip('密码保险箱')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => { mainWindow.show(); mainWindow.focus() },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        forceQuit = true
        // 清理托盘图标
        if (tray) {
          tray.destroy()
          tray = null
        }
        // 退出应用
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus() })
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
ipcMain.on('window-toggle-top', (event, alwaysOnTop) => {
  mainWindow.setAlwaysOnTop(alwaysOnTop)
})

// Window state IPC
ipcMain.handle('get-window-state', () => {
  return {
    isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
    isFullScreen: mainWindow.isFullScreen(),
    isMaximized: mainWindow.isMaximized()
  }
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

ipcMain.handle('show-message-box', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options)
})

ipcMain.on('open-url', (event, url) => {
  shell.openExternal(url)
})
