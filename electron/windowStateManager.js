const fs = require('fs')
const path = require('path')

const DEFAULT_WINDOW_SIZE = { width: 1300, height: 800 }
const MIN_WINDOW_SIZE = { width: 700, height: 500 }
const WINDOW_STATE_FILE = 'safe_vault_window_state.json'

function getWindowStatePath() {
  // Electron app 只在运行时读取，避免普通 node 校验脚本 require 本模块时依赖 Electron 环境。
  const { app } = require('electron')
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function normalizeWindowSize(size) {
  const width = Number(size?.width)
  const height = Number(size?.height)

  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= MIN_WINDOW_SIZE.width &&
    height >= MIN_WINDOW_SIZE.height
  ) {
    return {
      width: Math.round(width),
      height: Math.round(height),
    }
  }

  return { ...DEFAULT_WINDOW_SIZE }
}

function readWindowSize() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf-8')
    return normalizeWindowSize(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_WINDOW_SIZE }
  }
}

function saveWindowSize(bounds) {
  try {
    const filePath = getWindowStatePath()
    const tempPath = `${filePath}.tmp`
    const size = normalizeWindowSize(bounds)
    fs.writeFileSync(tempPath, JSON.stringify(size, null, 2), 'utf-8')
    fs.renameSync(tempPath, filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function getWindowOptions() {
  // BrowserWindow 创建时需要同步拿到尺寸，因此这里使用同步读取并只返回宽高字段。
  return readWindowSize()
}

module.exports = {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  normalizeWindowSize,
  readWindowSize,
  saveWindowSize,
  getWindowOptions,
}
