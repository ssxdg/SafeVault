const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

let settingsApi = {}
try {
  settingsApi = require('../electron/appSettingsManager')
} catch {}

assert.strictEqual(typeof settingsApi.createAppSettingsManager, 'function', 'app settings manager should exist')
assert.strictEqual(typeof settingsApi.normalizeIdleTimeoutMinutes, 'function', 'idle timeout validation should exist')

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'safevault-app-settings-'))
const settingsFile = path.join(directory, 'settings.json')

try {
  const manager = settingsApi.createAppSettingsManager({ settingsFile })
  assert.deepStrictEqual(manager.readSettings(), { idleTimeoutMinutes: 15 })
  assert.deepStrictEqual(manager.saveIdleTimeoutMinutes(90), {
    success: true,
    settings: { idleTimeoutMinutes: 90 },
  })
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsFile, 'utf8')), { idleTimeoutMinutes: 90 })
  assert.deepStrictEqual(manager.saveIdleTimeoutMinutes(0).settings, { idleTimeoutMinutes: 0 })
  assert.strictEqual(manager.readSettings().idleTimeoutMinutes, 0)
  assert.deepStrictEqual(manager.saveIdleTimeoutMinutes(1441), {
    success: false,
    error: '自动锁定时间必须是 1 到 1440 分钟，或选择不自动锁定。',
  })
  fs.writeFileSync(settingsFile, '{invalid json', 'utf8')
  assert.deepStrictEqual(manager.readSettings(), { idleTimeoutMinutes: 15 })
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}

console.log('app settings verification passed')
