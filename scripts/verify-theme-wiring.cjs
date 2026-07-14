const assert = require('assert')
const fs = require('fs')
const {
  REQUIRED_THEME_VARIABLES,
  validateCustomTheme,
} = require('../electron/themeManager')
const { normalizeWindowSize } = require('../electron/windowStateManager')

const appSource = fs.readFileSync('src/App.jsx', 'utf-8')
const titleBarSource = fs.readFileSync('src/components/TitleBar.jsx', 'utf-8')
const contentAreaSource = fs.readFileSync('src/components/ContentArea.jsx', 'utf-8')
const sidebarSource = fs.readFileSync('src/components/Sidebar.jsx', 'utf-8')
const mainSource = fs.readFileSync('electron/main.js', 'utf-8')
const preloadSource = fs.readFileSync('electron/preload.js', 'utf-8')
const fileManagerSource = fs.readFileSync('electron/fileManager.js', 'utf-8')

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

// 主窗口允许缩窄到 350 像素，因此持久化校验必须接受这个范围内的正常尺寸；否则退出时会把用户尺寸错误替换为默认值。
assert.deepStrictEqual(
  normalizeWindowSize({ width: 640, height: 600 }),
  { width: 640, height: 600 },
  'window sizes allowed by BrowserWindow should be persisted without falling back to defaults',
)

// 读数据失败不能静默回退成空数据，否则后续保存会覆盖损坏的原始文件。
assert(fileManagerSource.includes('success: false') && fileManagerSource.includes('ENOENT'), 'read-data should distinguish missing file from read/parse errors')
assert(appSource.includes('dataWriteProtectedRef'), 'App should enter write-protected mode after data read failures')

// 自动保存存在防抖队列，导出、导入、关闭和托盘退出前必须 flush，避免最后一次编辑丢失。
assert(appSource.includes('flushScheduledSave'), 'App should flush pending debounced writes before critical actions')
assert(appSource.includes('handleWindowClose'), 'TitleBar close should flush data before hiding window')
assert(preloadSource.includes('onBeforeAppQuit'), 'preload should expose app-before-quit listener')
assert(mainSource.includes('requestAppQuit') && mainSource.includes('renderer-ready-to-quit'), 'main process should wait for renderer flush before quitting')

// 删除最后一个标签会让内容区进入空标签状态，必须在侧边栏或 App 层阻止。
assert(appSource.includes('至少需要保留一个标签') || sidebarSource.includes('至少需要保留一个标签'), 'last tab deletion should be blocked with a user-facing message')

// 外部链接只允许 http/https，避免导入或手填的危险协议被 shell.openExternal 交给系统执行。
assert(mainSource.includes('normalizeExternalUrl') && mainSource.includes('http:') && mainSource.includes('https:'), 'external URL opening should validate protocol')

// 列表视图不能只覆盖账号；网址也需要列表渲染，和用户文档里的“列表视图”保持一致。
assert(contentAreaSource.includes('urlColumns') && contentAreaSource.includes('dataSource={filteredUrls}'), 'URL records should support list view')

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
