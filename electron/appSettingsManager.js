const fs = require('fs')
const path = require('path')

const DEFAULT_APP_SETTINGS = Object.freeze({ idleTimeoutMinutes: 15 })

function isValidIdleTimeoutMinutes(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1440
}

function normalizeIdleTimeoutMinutes(value, fallback = DEFAULT_APP_SETTINGS.idleTimeoutMinutes) {
  return isValidIdleTimeoutMinutes(value) ? value : fallback
}

function getDefaultSettingsFile() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'safe_vault_settings.json')
}

function createAppSettingsManager({ settingsFile, fsApi = fs } = {}) {
  const targetFile = settingsFile || getDefaultSettingsFile()

  function readSettings() {
    try {
      const parsed = JSON.parse(fsApi.readFileSync(targetFile, 'utf8'))
      return { idleTimeoutMinutes: normalizeIdleTimeoutMinutes(parsed?.idleTimeoutMinutes) }
    } catch {
      return { ...DEFAULT_APP_SETTINGS }
    }
  }

  function saveIdleTimeoutMinutes(minutes) {
    if (!isValidIdleTimeoutMinutes(minutes)) {
      return { success: false, error: '自动锁定时间必须是 1 到 1440 分钟，或选择不自动锁定。' }
    }
    try {
      fsApi.mkdirSync(path.dirname(targetFile), { recursive: true })
      const temporaryFile = `${targetFile}.tmp`
      const settings = { idleTimeoutMinutes: minutes }
      fsApi.writeFileSync(temporaryFile, JSON.stringify(settings, null, 2), 'utf8')
      fsApi.renameSync(temporaryFile, targetFile)
      return { success: true, settings }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  return { readSettings, saveIdleTimeoutMinutes }
}

module.exports = {
  DEFAULT_APP_SETTINGS,
  createAppSettingsManager,
  normalizeIdleTimeoutMinutes,
}
