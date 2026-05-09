const { app, dialog } = require('electron')
const fs = require('fs').promises
const path = require('path')

const DATA_FILE = path.join(app.getPath('userData'), 'safe_vault.json')

const defaultData = {
  tabs: [
    { id: 'default-tab', name: '个人账户', accounts: [], urls: [] },
  ],
}

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.tabs)) return defaultData
    return parsed
  } catch {
    return defaultData
  }
}

async function writeData(data) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function exportData(mainWindow, data) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `safe_vault_${date}.json`,
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  })
  if (canceled || !filePath) return { success: false, cancelled: true }
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function importData(mainWindow) {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths || filePaths.length === 0) return { success: false, cancelled: true }
  try {
    const raw = await fs.readFile(filePaths[0], 'utf-8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.tabs)) throw new Error('数据格式不正确')
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = { readData, writeData, exportData, importData }
