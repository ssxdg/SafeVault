const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog } = require('electron')
const path = require('path')
const fileManager = require('./fileManager')

const isDev = !app.isPackaged

// 图标路径：开发环境用源码目录，打包后用 extraResources
const iconPath = isDev
  ? path.join(__dirname, '../src/images/icon.png')
  : path.join(process.resourcesPath, 'icon.png')

let mainWindow
let tray
let forceQuit = false

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
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
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
    if (!forceQuit) {
      e.preventDefault()
      mainWindow.hide()
    }
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
ipcMain.on('window-close', () => mainWindow.hide())
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

ipcMain.handle('show-message-box', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options)
})

ipcMain.on('open-url', (event, url) => {
  shell.openExternal(url)
})
