const path = require('path')

const SUPPORTED_WEBSITE_PROTOCOLS = new Set(['http:', 'https:'])

function normalizeWebsiteOrigin(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (!SUPPORTED_WEBSITE_PROTOCOLS.has(parsed.protocol)) return null
    if (parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

function normalizeExecutablePath(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('\0') || !path.win32.isAbsolute(trimmed)) return null

  const normalized = path.win32.normalize(trimmed)
  if (path.win32.extname(normalized).toLowerCase() !== '.exe') return null
  return normalized
}

function toCredentialSummary(account, tab) {
  return {
    id: account.id,
    tabId: tab.id,
    tabName: typeof tab.name === 'string' ? tab.name : '',
    accountName: typeof account.accountName === 'string' ? account.accountName : '',
    username: typeof account.username === 'string' ? account.username : '',
    email: typeof account.email === 'string' ? account.email : '',
  }
}

function findCredentialSummaries(data, matchesTarget) {
  const summaries = []
  for (const tab of Array.isArray(data?.tabs) ? data.tabs : []) {
    for (const account of Array.isArray(tab?.accounts) ? tab.accounts : []) {
      const targets = Array.isArray(account?.loginTargets) ? account.loginTargets : []
      if (targets.some(target => target?.enabled === true && matchesTarget(target))) {
        summaries.push(toCredentialSummary(account, tab))
      }
    }
  }
  return summaries
}

function findCredentialsForOrigin(data, origin) {
  const normalizedOrigin = normalizeWebsiteOrigin(origin)
  if (!normalizedOrigin) return []

  return findCredentialSummaries(data, target => (
    target.type === 'website'
    && normalizeWebsiteOrigin(target.origin) === normalizedOrigin
  ))
}

function matchesWindowTitle(pattern, windowTitle) {
  if (!pattern) return true
  if (!isSafeWindowTitlePattern(pattern)) return false

  try {
    return new RegExp(pattern).test(windowTitle)
  } catch {
    return false
  }
}

function isSafeWindowTitlePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 128) return false
  if (/\\[1-9]|\(\?[=!<]|\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return false
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function findCredentialsForApp(data, appIdentity) {
  const executablePath = normalizeExecutablePath(appIdentity?.executablePath)
  if (!executablePath) return []
  const comparablePath = executablePath.toLowerCase()
  const windowTitle = typeof appIdentity?.windowTitle === 'string' ? appIdentity.windowTitle : ''

  return findCredentialSummaries(data, target => {
    if (target.type !== 'windowsApp') return false
    const targetPath = normalizeExecutablePath(target.executablePath)
    if (!targetPath || targetPath.toLowerCase() !== comparablePath) return false
    return matchesWindowTitle(target.windowTitlePattern, windowTitle)
  })
}

function findMatchingAppTarget(account, appIdentity) {
  const executablePath = normalizeExecutablePath(appIdentity?.executablePath)
  if (!executablePath) return null
  const windowTitle = typeof appIdentity?.windowTitle === 'string' ? appIdentity.windowTitle : ''
  return (Array.isArray(account?.loginTargets) ? account.loginTargets : []).find(target => {
    if (target?.type !== 'windowsApp' || target.enabled !== true) return false
    const targetPath = normalizeExecutablePath(target.executablePath)
    return targetPath?.toLowerCase() === executablePath.toLowerCase()
      && matchesWindowTitle(target.windowTitlePattern, windowTitle)
  }) || null
}

module.exports = {
  normalizeWebsiteOrigin,
  normalizeExecutablePath,
  findCredentialsForOrigin,
  findCredentialsForApp,
  findMatchingAppTarget,
  isSafeWindowTitlePattern,
}
