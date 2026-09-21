const {
  normalizeWebsiteOrigin,
  normalizeExecutablePath,
  isSafeWindowTitlePattern,
} = require('./credentialMatcher')

const EMPTY_DELTA = { ops: [{ insert: '\n' }] }
const VALID_THEMES = new Set(['secure', 'compact', 'warm'])
const CUSTOM_THEME_PATTERN = /^custom:[a-z][a-z0-9-]{2,31}$/
const RESERVED_CUSTOM_THEME_IDS = new Set(['secure', 'compact', 'warm', 'custom'])

function normalizeTheme(theme) {
  // 自定义主题定义只保存在本机主题库，业务数据里只允许保存 custom:<id> 引用。
  if (VALID_THEMES.has(theme)) return theme
  if (CUSTOM_THEME_PATTERN.test(theme)) {
    const customThemeId = theme.slice('custom:'.length)
    if (!RESERVED_CUSTOM_THEME_IDS.has(customThemeId)) return theme
  }
  return 'secure'
}

function normalizeNoteContent(content) {
  if (!content) return EMPTY_DELTA
  if (typeof content === 'object' && Array.isArray(content.ops)) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.ops)) return parsed
    } catch {}
    return { ops: [{ insert: `${content}\n` }] }
  }
  return EMPTY_DELTA
}

function normalizeUseCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function stableSortByUseCount(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item: { ...item, useCount: normalizeUseCount(item?.useCount) },
      index,
    }))
    .sort((a, b) => {
      const countDiff = b.item.useCount - a.item.useCount
      return countDiff || a.index - b.index
    })
    .map(({ item }) => item)
}

function normalizeCollectionItems(items, idPrefix) {
  // 旧版备份或用户手工维护的 JSON 可能缺少条目 id；这里统一补齐，避免编辑/删除时多个 undefined id 被同时命中。
  return stableSortByUseCount(items).map((item, index) => ({
    ...item,
    id: item?.id || `${idPrefix}-${Date.now()}-${index}`,
  }))
}

function normalizeLoginTarget(target, fallbackId) {
  if (!target || typeof target !== 'object') return null
  const id = typeof target.id === 'string' && target.id.trim() ? target.id.trim() : fallbackId

  if (target.type === 'website') {
    const origin = normalizeWebsiteOrigin(target.origin)
    if (!origin) return null
    return {
      id,
      type: 'website',
      origin,
      enabled: target.enabled !== false,
    }
  }

  if (target.type === 'windowsApp') {
    const executablePath = normalizeExecutablePath(target.executablePath)
    if (!executablePath) return null
    const normalized = {
      id,
      type: 'windowsApp',
      executablePath,
      enabled: target.enabled !== false,
      fillStrategy: ['uia', 'clipboard', 'keystroke'].includes(target.fillStrategy)
        ? target.fillStrategy
        : 'uia',
    }
    if (typeof target.windowTitlePattern === 'string' && target.windowTitlePattern.trim()) {
      const pattern = target.windowTitlePattern.trim()
      if (!isSafeWindowTitlePattern(pattern)) return null
      normalized.windowTitlePattern = pattern
    }
    for (const selectorName of ['usernameSelector', 'passwordSelector']) {
      const selector = target[selectorName]
      if (!selector || typeof selector !== 'object') continue
      const automationId = typeof selector.automationId === 'string' ? selector.automationId.trim() : ''
      const name = typeof selector.name === 'string' ? selector.name.trim() : ''
      if ((!automationId && !name) || automationId.length > 256 || name.length > 256) return null
      normalized[selectorName] = {
        ...(automationId ? { automationId } : {}),
        ...(name ? { name } : {}),
      }
    }
    return normalized
  }

  return null
}

function normalizeLoginTargets(account, accountId, migrateLegacyLoginUrl) {
  const targets = (Array.isArray(account?.loginTargets) ? account.loginTargets : [])
    .map((target, index) => normalizeLoginTarget(target, `${accountId}-target-${index}`))
    .filter(Boolean)

  if (migrateLegacyLoginUrl) {
    const legacyOrigin = normalizeWebsiteOrigin(account?.loginUrl)
    const hasOrigin = targets.some(target => target.type === 'website' && target.origin === legacyOrigin)
    if (legacyOrigin && !hasOrigin) {
      targets.push({
        id: `${accountId}-website-legacy`,
        type: 'website',
        origin: legacyOrigin,
        enabled: true,
      })
    }
  }

  return targets
}

function normalizeAccounts(items, migrateLegacyLoginUrl) {
  return stableSortByUseCount(items).map((item, index) => {
    const accountId = item?.id || `account-${Date.now()}-${index}`
    return {
      ...item,
      id: accountId,
      loginTargets: normalizeLoginTargets(item, accountId, migrateLegacyLoginUrl),
    }
  })
}

const defaultData = {
  schemaVersion: 3,
  theme: 'secure',
  tabs: [
    { id: 'default-tab', name: 'Default', accounts: [], urls: [] },
  ],
  notepads: [
    { id: 'default-note', name: 'Untitled', content: EMPTY_DELTA, createdAt: '', updatedAt: '' },
  ],
  activeNotepadId: 'default-note',
}

function normalizeTabs(tabs, migrateLegacyLoginUrl) {
  const sourceTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : defaultData.tabs
  return sourceTabs.map((tab, index) => ({
    id: tab.id || `tab-${Date.now()}-${index}`,
    name: tab.name || `Tab ${index + 1}`,
    accounts: normalizeAccounts(tab.accounts, migrateLegacyLoginUrl),
    urls: normalizeCollectionItems(tab.urls, 'url'),
  }))
}

function normalizeNotepads(data) {
  if (Array.isArray(data?.notepads) && data.notepads.length > 0) {
    return data.notepads.map((note, index) => ({
      id: note.id || `note-${Date.now()}-${index}`,
      name: note.name || `Note ${index + 1}`,
      content: normalizeNoteContent(note.content),
      createdAt: note.createdAt || '',
      updatedAt: note.updatedAt || '',
    }))
  }

  const legacyText = typeof data?.notes === 'string' ? data.notes : ''
  return [{
    id: 'default-note',
    name: 'Untitled',
    content: normalizeNoteContent(legacyText),
    createdAt: '',
    updatedAt: '',
  }]
}

function normalizeData(data) {
  const source = data && typeof data === 'object' ? data : {}
  const sourceSchemaVersion = Number(source.schemaVersion)
  const migrateLegacyLoginUrl = !Number.isFinite(sourceSchemaVersion) || sourceSchemaVersion < 3
  const tabs = normalizeTabs(source.tabs, migrateLegacyLoginUrl)
  const notepads = normalizeNotepads(source)
  const activeNotepadId = notepads.some(note => note.id === source.activeNotepadId)
    ? source.activeNotepadId
    : notepads[0].id

  return {
    schemaVersion: 3,
    theme: normalizeTheme(source.theme),
    tabs,
    notepads,
    activeNotepadId,
  }
}

module.exports = {
  EMPTY_DELTA,
  normalizeData,
  normalizeNoteContent,
  normalizeTheme,
  stableSortByUseCount,
}
