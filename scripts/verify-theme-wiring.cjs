const assert = require('assert')
const fs = require('fs')
const {
  REQUIRED_THEME_VARIABLES,
  validateCustomTheme,
} = require('../electron/themeManager')

const appSource = fs.readFileSync('src/App.jsx', 'utf-8')
const titleBarSource = fs.readFileSync('src/components/TitleBar.jsx', 'utf-8')
const mainSource = fs.readFileSync('electron/main.js', 'utf-8')
const preloadSource = fs.readFileSync('electron/preload.js', 'utf-8')

assert(appSource.includes("theme: 'secure'"), 'default data should include secure theme')
assert(appSource.includes('const setTheme'), 'App should expose setTheme handler')
assert(appSource.includes('data-theme={rootTheme}'), 'app root should apply resolved data-theme')
assert(appSource.includes('readCustomThemes'), 'App should read local custom themes')
assert(appSource.includes('customThemeVariables'), 'App should apply inline custom theme variables')
assert(appSource.includes("event.key === 'Escape'"), 'App should close window on Escape')
assert(appSource.includes('onReorderNotepads={reorderNotepads}'), 'App should pass notepad reorder handler')
assert(titleBarSource.includes('themeOptions'), 'TitleBar should receive dynamic theme options')
assert(titleBarSource.includes('onThemeChange'), 'TitleBar should call onThemeChange')
assert(titleBarSource.includes('onImportTheme'), 'TitleBar should expose import theme action')
assert(mainSource.includes('read-custom-themes'), 'main process should expose read-custom-themes IPC')
assert(mainSource.includes('import-theme-file'), 'main process should expose import-theme-file IPC')
assert(mainSource.includes('windowStateManager'), 'main process should use window state manager')
assert(mainSource.includes('saveWindowSize'), 'main process should save last window size')
assert(mainSource.includes('saveMainWindowSize()'), 'window-close IPC should save current size before hiding')
assert(mainSource.includes('before-quit') && mainSource.includes('saveMainWindowSize()'), 'app quit path should save current size')
assert(mainSource.includes('session-end'), 'Windows shutdown path should save current size')
assert(mainSource.includes('getWindowOptions'), 'main process should restore saved window size')
assert(preloadSource.includes('readCustomThemes'), 'preload should expose readCustomThemes')
assert(preloadSource.includes('importThemeFile'), 'preload should expose importThemeFile')

// 主题文件规范必须覆盖完整变量集，验证脚本直接检查纯校验函数，避免 UI 手测漏掉危险值。
assert(REQUIRED_THEME_VARIABLES.includes('--app-bg'), 'theme spec should require app background')
assert(REQUIRED_THEME_VARIABLES.includes('--mono-font'), 'theme spec should require mono font')
const validTheme = validateCustomTheme({
  schemaVersion: 1,
  id: 'forest-night',
  name: '森林夜航',
  variables: Object.fromEntries(REQUIRED_THEME_VARIABLES.map(name => [name, '#123456'])),
})
assert.strictEqual(validTheme.success, true, 'valid custom theme should pass validation')
const unsafeTheme = validateCustomTheme({
  schemaVersion: 1,
  id: 'unsafe-theme',
  name: '危险主题',
  variables: Object.fromEntries(REQUIRED_THEME_VARIABLES.map(name => [name, 'url(http://example.com/a.png)'])),
})
assert.strictEqual(unsafeTheme.success, false, 'unsafe CSS values should fail validation')

console.log('theme wiring verification passed')
