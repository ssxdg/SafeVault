const assert = require('assert')
const { normalizeData } = require('../electron/dataNormalizer')

const input = {
  schemaVersion: 2,
  theme: 'compact',
  tabs: [
    {
      id: 'tab-1',
      name: 'Main',
      accounts: [
        { id: 'a-low', accountName: 'Low', useCount: 1 },
        { id: 'a-high', accountName: 'High', useCount: 7 },
        { id: 'a-tie-1', accountName: 'Tie 1', useCount: 3 },
        { id: 'a-tie-2', accountName: 'Tie 2', useCount: 3 },
      ],
      urls: [
        { id: 'u-missing', name: 'Missing' },
        { id: 'u-high', name: 'High', useCount: 4 },
        { id: 'u-zero', name: 'Zero', useCount: 0 },
      ],
    },
  ],
  notepads: [
    { id: 'note-1', name: 'Note', content: 'hello', createdAt: '', updatedAt: '' },
  ],
  activeNotepadId: 'note-1',
}

const normalized = normalizeData(input)

assert.strictEqual(normalized.schemaVersion, 3)
assert.strictEqual(normalized.theme, 'compact')
assert.deepStrictEqual(
  normalized.tabs[0].accounts.map(item => item.id),
  ['a-high', 'a-tie-1', 'a-tie-2', 'a-low']
)
assert.deepStrictEqual(
  normalized.tabs[0].urls.map(item => item.id),
  ['u-high', 'u-missing', 'u-zero']
)
assert.deepStrictEqual(normalized.notepads[0].content, { ops: [{ insert: 'hello\n' }] })

const invalidTheme = normalizeData({ schemaVersion: 2, theme: 'unknown', tabs: [] })
assert.strictEqual(invalidTheme.theme, 'secure')
assert.strictEqual(invalidTheme.tabs.length, 1)
assert.strictEqual(invalidTheme.activeNotepadId, invalidTheme.notepads[0].id)

// 自定义主题只在本机主题库里保存定义，业务数据里只保留 custom:<id> 引用。
// 这里验证合法引用会被数据归一化保留，避免重启后被错误回退成内置主题。
const customTheme = normalizeData({ schemaVersion: 2, theme: 'custom:forest-night', tabs: [] })
assert.strictEqual(customTheme.theme, 'custom:forest-night')

// 非法自定义主题引用不能进入业务数据，防止后续把任意字符串写入 data-theme。
const invalidCustomTheme = normalizeData({ schemaVersion: 2, theme: 'custom:Secure Theme', tabs: [] })
assert.strictEqual(invalidCustomTheme.theme, 'secure')

const reservedCustomTheme = normalizeData({ schemaVersion: 2, theme: 'custom:secure', tabs: [] })
assert.strictEqual(reservedCustomTheme.theme, 'secure')

const missingData = normalizeData(null)
assert.strictEqual(missingData.theme, 'secure')
assert.strictEqual(missingData.tabs.length, 1)

// 导入旧版或手工维护的备份时，账号和网址可能没有 id；规范化必须补齐，避免后续编辑/删除用 undefined 命中多条记录。
const missingItemIds = normalizeData({
  schemaVersion: 2,
  theme: 'secure',
  tabs: [{
    id: 'legacy-tab',
    name: 'Legacy',
    accounts: [{ accountName: 'No Id Account' }],
    urls: [{ name: 'No Id Url' }],
  }],
})
assert.match(missingItemIds.tabs[0].accounts[0].id, /^account-\d+-0$/)
assert.match(missingItemIds.tabs[0].urls[0].id, /^url-\d+-0$/)

// schema v2 的合法登录网址会迁移为显式网站目标；无效网址保留原字段，但不得获得填充权限。
const legacyAccounts = normalizeData({
  schemaVersion: 2,
  tabs: [{
    id: 'legacy-targets',
    name: 'Legacy Targets',
    accounts: [
      { id: 'legacy-valid', accountName: 'Valid', loginUrl: 'https://login.example.com/sign-in' },
      { id: 'legacy-invalid', accountName: 'Invalid', loginUrl: 'example.com/login' },
      { id: 'legacy-unsafe', accountName: 'Unsafe', loginUrl: 'javascript:alert(1)' },
    ],
    urls: [],
  }],
})
assert.strictEqual(legacyAccounts.schemaVersion, 3)
assert.deepStrictEqual(
  legacyAccounts.tabs[0].accounts[0].loginTargets.map(target => ({
    type: target.type,
    origin: target.origin,
    enabled: target.enabled,
  })),
  [{ type: 'website', origin: 'https://login.example.com', enabled: true }],
)
assert.strictEqual(legacyAccounts.tabs[0].accounts[1].loginUrl, 'example.com/login')
assert.deepStrictEqual(legacyAccounts.tabs[0].accounts[1].loginTargets, [])
assert.strictEqual(legacyAccounts.tabs[0].accounts[2].loginUrl, 'javascript:alert(1)')
assert.deepStrictEqual(legacyAccounts.tabs[0].accounts[2].loginTargets, [])

// schema v3 只接受显式目标，不根据普通 loginUrl 隐式扩大自动填充权限。
const currentAccounts = normalizeData({
  schemaVersion: 3,
  tabs: [{
    id: 'current-targets',
    name: 'Current Targets',
    accounts: [{
      id: 'current-account',
      accountName: 'Current',
      loginUrl: 'https://implicit.example.com/login',
      loginTargets: [
        { id: 'website-target', type: 'website', origin: 'https://explicit.example.com/path', enabled: true },
        { id: 'disabled-target', type: 'website', origin: 'https://disabled.example.com', enabled: false },
        { id: 'invalid-target', type: 'website', origin: 'chrome://settings/', enabled: true },
        {
          id: 'desktop-target',
          type: 'windowsApp',
          executablePath: 'C:/Program Files/Example/example.exe',
          windowTitlePattern: 'Example Login',
          enabled: true,
          fillStrategy: 'uia',
          usernameSelector: { automationId: 'username' },
          passwordSelector: { name: 'Password' },
        },
      ],
    }],
    urls: [],
  }],
})
assert.deepStrictEqual(currentAccounts.tabs[0].accounts[0].loginTargets, [
  { id: 'website-target', type: 'website', origin: 'https://explicit.example.com', enabled: true },
  { id: 'disabled-target', type: 'website', origin: 'https://disabled.example.com', enabled: false },
  {
    id: 'desktop-target',
    type: 'windowsApp',
    executablePath: 'C:\\Program Files\\Example\\example.exe',
    windowTitlePattern: 'Example Login',
    enabled: true,
    fillStrategy: 'uia',
    usernameSelector: { automationId: 'username' },
    passwordSelector: { name: 'Password' },
  },
])

console.log('normalize-data verification passed')
