const fs = require('fs').promises
const path = require('path')

const THEME_STORE_SCHEMA_VERSION = 1
const THEME_STORE_FILE = 'safe_vault_themes.json'
const THEME_ID_PATTERN = /^[a-z][a-z0-9-]{2,31}$/
const RESERVED_THEME_IDS = new Set(['secure', 'compact', 'warm', 'custom'])
const UNSAFE_CSS_VALUE_PATTERN = /[<>{};]|url\s*\(|@import|expression\s*\(/i

const REQUIRED_THEME_VARIABLES = [
  '--app-bg',
  '--surface',
  '--surface-muted',
  '--surface-raised',
  '--sidebar-bg',
  '--sidebar-hover',
  '--sidebar-active',
  '--sidebar-text',
  '--sidebar-text-active',
  '--sidebar-border',
  '--titlebar-bg',
  '--titlebar-text',
  '--text',
  '--text-muted',
  '--border',
  '--accent',
  '--accent-strong',
  '--active-bg',
  '--icon-color',
  '--icon-hover-bg',
  '--icon-hover-color',
  '--danger',
  '--danger-bg',
  '--success',
  '--warning',
  '--input-bg',
  '--input-placeholder',
  '--shadow-sm',
  '--shadow-md',
  '--focus-ring',
  '--modal-overlay',
  '--mono-font',
]

function getThemeStorePath() {
  // Electron 的 app 对象只在运行时读取，避免普通 node 校验脚本 require 本模块时触发 Electron 上下文依赖。
  const { app } = require('electron')
  return path.join(app.getPath('userData'), THEME_STORE_FILE)
}

function validateCustomTheme(input) {
  if (!input || typeof input !== 'object') {
    return { success: false, error: '主题文件必须是 JSON 对象。' }
  }

  if (input.schemaVersion !== THEME_STORE_SCHEMA_VERSION) {
    return { success: false, error: `主题 schemaVersion 必须为 ${THEME_STORE_SCHEMA_VERSION}。` }
  }

  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!THEME_ID_PATTERN.test(id) || RESERVED_THEME_IDS.has(id)) {
    return { success: false, error: '主题 id 必须是 3-32 位小写字母、数字或连字符，且不能使用内置主题名称。' }
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1 || name.length > 24) {
    return { success: false, error: '主题名称长度必须为 1-24 个字符。' }
  }

  if (!input.variables || typeof input.variables !== 'object' || Array.isArray(input.variables)) {
    return { success: false, error: '主题 variables 必须是 CSS 变量对象。' }
  }

  const variables = {}
  for (const key of REQUIRED_THEME_VARIABLES) {
    const value = input.variables[key]
    if (typeof value !== 'string' || value.trim().length === 0) {
      return { success: false, error: `缺少必需主题变量 ${key}。` }
    }
    if (UNSAFE_CSS_VALUE_PATTERN.test(value)) {
      return { success: false, error: `主题变量 ${key} 包含不允许的 CSS 内容。` }
    }
    variables[key] = value.trim()
  }

  // 只保留规范声明的变量，避免主题文件通过额外字段影响非主题样式。
  return {
    success: true,
    theme: {
      schemaVersion: THEME_STORE_SCHEMA_VERSION,
      id,
      name,
      variables,
    },
  }
}

function normalizeThemeStore(rawStore) {
  const sourceThemes = Array.isArray(rawStore?.themes) ? rawStore.themes : []
  const validThemes = []
  const seenIds = new Set()

  for (const candidate of sourceThemes) {
    const result = validateCustomTheme(candidate)
    if (!result.success || seenIds.has(result.theme.id)) continue
    seenIds.add(result.theme.id)
    validThemes.push(result.theme)
  }

  return {
    schemaVersion: THEME_STORE_SCHEMA_VERSION,
    themes: validThemes,
  }
}

async function readThemeStore() {
  try {
    const raw = await fs.readFile(getThemeStorePath(), 'utf-8')
    return normalizeThemeStore(JSON.parse(raw))
  } catch {
    return normalizeThemeStore(null)
  }
}

async function writeThemeStore(store) {
  const filePath = getThemeStorePath()
  const tempPath = `${filePath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(normalizeThemeStore(store), null, 2), 'utf-8')
  await fs.rename(tempPath, filePath)
}

async function readCustomThemes() {
  try {
    const store = await readThemeStore()
    return { success: true, themes: store.themes }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function importThemeFile(mainWindow) {
  const { dialog } = require('electron')
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: '导入主题文件',
    filters: [{ name: 'JSON Theme Files', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (canceled || !filePaths || filePaths.length === 0) {
    return { success: false, cancelled: true }
  }

  try {
    const raw = await fs.readFile(filePaths[0], 'utf-8')
    const parsed = JSON.parse(raw)
    const validation = validateCustomTheme(parsed)
    if (!validation.success) throw new Error(validation.error)

    const store = await readThemeStore()
    const existingIndex = store.themes.findIndex(theme => theme.id === validation.theme.id)
    const updated = existingIndex >= 0
    const themes = [...store.themes]

    if (updated) {
      themes[existingIndex] = validation.theme
    } else {
      themes.push(validation.theme)
    }

    await writeThemeStore({ schemaVersion: THEME_STORE_SCHEMA_VERSION, themes })
    return { success: true, theme: validation.theme, updated }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = {
  REQUIRED_THEME_VARIABLES,
  validateCustomTheme,
  readCustomThemes,
  importThemeFile,
}
