const { app, dialog } = require('electron')
const fs = require('fs').promises
const path = require('path')

const DATA_FILE = path.join(app.getPath('userData'), 'safe_vault.json')

function normalizNoteContent(content) {
  if (!content) return { ops: [{ insert: '\n' }] }
  if (typeof content === 'object' && Array.isArray(content.ops)) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.ops)) return parsed
    } catch {}
    return { ops: [{ insert: content + '\n' }] }
  }
  return { ops: [{ insert: '\n' }] }
}

const defaultData = {
  schemaVersion: 2,
  tabs: [
    { id: 'default-tab', name: '个人账户', accounts: [], urls: [] },
  ],
  notepads: [
    { id: 'default-note', name: '未命名', content: '', createdAt: '', updatedAt: '' },
  ],
  activeNotepadId: 'default-note',
}

function normalizeData(data) {
  if (!data || !Array.isArray(data.tabs)) return defaultData

  let notepads = []
  if (Array.isArray(data.notepads) && data.notepads.length > 0) {
    notepads = data.notepads.map((note, index) => ({
      id: note.id || `note-${Date.now()}-${index}`,
      name: note.name || `记事本 ${index + 1}`,
      content: normalizNoteContent(note.content),
      createdAt: note.createdAt || '',
      updatedAt: note.updatedAt || '',
    }))
  } else {
    const legacyText = typeof data.notes === 'string' ? data.notes : ''
    notepads = [{
      id: 'default-note',
      name: '未命名',
      content: normalizNoteContent(legacyText),
      createdAt: '',
      updatedAt: '',
    }]
  }

  const activeNotepadId = notepads.some(n => n.id === data.activeNotepadId)
    ? data.activeNotepadId
    : notepads[0].id

  return {
    schemaVersion: 2,
    tabs: data.tabs,
    notepads,
    activeNotepadId,
  }
}

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return normalizeData(parsed)
  } catch {
    return defaultData
  }
}

async function writeData(data) {
  try {
    const normalized = normalizeData(data)
    const tempFile = `${DATA_FILE}.tmp`
    await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2), 'utf-8')
    await fs.rename(tempFile, DATA_FILE)
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
    await fs.writeFile(filePath, JSON.stringify(normalizeData(data), null, 2), 'utf-8')
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
    return { success: true, data: normalizeData(data) }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = { readData, writeData, exportData, importData }
