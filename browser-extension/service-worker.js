const NATIVE_HOST_NAME = 'com.safevault.bridge'
const SELECTION_TTL_MS = 2 * 60 * 1000
const PENDING_LOGIN_TTL_MS = 2 * 60 * 1000
const selectedAccounts = new Map()

function createRequest(action, origin, extra = {}) {
  return {
    requestId: crypto.randomUUID(),
    action,
    origin,
    ...extra,
  }
}

function getTrustedContext(sender) {
  try {
    const url = new URL(sender.url || sender.tab?.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId)) return null
    return {
      origin: url.origin,
      loginUrl: `${url.origin}${url.pathname}`,
      tabId: sender.tab.id,
      frameId: sender.frameId,
      key: `${sender.tab.id}:${sender.frameId}:${url.origin}`,
    }
  } catch {
    return null
  }
}

function rememberSelection(context, accountId) {
  selectedAccounts.set(context.key, { accountId, expiresAt: Date.now() + SELECTION_TTL_MS })
}

function getSelection(context) {
  const selected = selectedAccounts.get(context.key)
  if (!selected || selected.expiresAt <= Date.now()) {
    selectedAccounts.delete(context.key)
    return null
  }
  return selected.accountId
}

function clearTabSelections(tabId) {
  for (const key of selectedAccounts.keys()) {
    if (key.startsWith(`${tabId}:`)) selectedAccounts.delete(key)
  }
}

const pendingLoginKey = context => `pending-login:${context.tabId}:${context.frameId}`

async function getPendingLogin(context) {
  const key = pendingLoginKey(context)
  const pending = (await chrome.storage.session.get(key))[key]
  if (!pending) return null
  if (pending.expiresAt <= Date.now()) {
    await chrome.storage.session.remove(key)
    return null
  }
  return pending
}

function sendNative(request) {
  return new Promise(resolve => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, response => {
      if (chrome.runtime.lastError) {
        resolve({ requestId: request.requestId, ok: false, code: 'NATIVE_HOST_ERROR' })
        return
      }
      resolve(response || { requestId: request.requestId, ok: false, code: 'EMPTY_RESPONSE' })
    })
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const context = getTrustedContext(sender)
  if (!context) {
    sendResponse({ ok: false, code: 'UNTRUSTED_PAGE' })
    return false
  }

  if (message?.type === 'getCredentials') {
    sendNative(createRequest('listCredentials', context.origin)).then(response => {
      if (response?.ok && response.data) response.data.selectedAccountId = getSelection(context)
      sendResponse(response)
    })
    return true
  }
  if (message?.type === 'getCredential' && typeof message.accountId === 'string') {
    sendNative(createRequest('getCredential', context.origin, { accountId: message.accountId })).then(response => {
      if (response?.ok) rememberSelection(context, message.accountId)
      sendResponse(response)
    })
    return true
  }
  if (message?.type === 'reportFillResult' && typeof message.accountId === 'string') {
    sendNative(createRequest('reportFillResult', context.origin, {
      accountId: message.accountId,
      success: Boolean(message.success),
    })).then(sendResponse)
    return true
  }
  if (message?.type === 'updateCredential' && typeof message.newPassword === 'string') {
    const accountId = getSelection(context)
    if (!accountId) {
      sendResponse({ ok: false, code: 'SELECTION_EXPIRED' })
      return false
    }
    sendNative(createRequest('updateCredential', context.origin, {
      accountId,
      newPassword: message.newPassword,
    })).then(sendResponse)
    return true
  }
  if (message?.type === 'saveCredential') {
    sendNative(createRequest('createCredential', context.origin, {
      loginUrl: context.loginUrl,
      accountName: message.accountName,
      username: message.username,
      password: message.password,
    })).then(sendResponse)
    return true
  }
  if (message?.type === 'loginSubmitted') {
    const accountName = message.accountName?.trim()
    const username = message.username?.trim()
    const password = message.password
    if (!accountName || accountName.length > 200 || !username || username.length > 320
      || typeof password !== 'string' || !password || password.length > 4096) {
      sendResponse({ ok: false, code: 'INVALID_REQUEST' })
      return false
    }
    // 会话内存只暂存这次提交，浏览器关闭或超时后不能再用于新增账号。
    chrome.storage.session.set({ [pendingLoginKey(context)]: {
      origin: context.origin,
      loginUrl: context.loginUrl,
      accountName,
      username,
      password,
      expiresAt: Date.now() + PENDING_LOGIN_TTL_MS,
      prompted: false,
    } }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false, code: 'UPDATE_FAILED' }))
    return true
  }
  if (message?.type === 'checkPendingLogin') {
    getPendingLogin(context).then(async pending => {
      if (!pending || pending.origin !== context.origin || pending.prompted
        || context.loginUrl === pending.loginUrl || message.hasLoginForm !== false
        || message.hasChallengeField === true
        || /(?:^|\/)(?:otp|verify|verification|challenge|mfa|2fa)(?:\/|$)/i.test(new URL(context.loginUrl).pathname)) {
        sendResponse({ ok: true, data: { pending: false } })
        return
      }
      const listed = await sendNative(createRequest('listCredentials', context.origin))
      if (!listed?.ok) {
        sendResponse(listed)
        return
      }
      if ((listed.data?.credentials || []).some(item => item.username?.trim().toLowerCase() === pending.username.toLowerCase())) {
        await chrome.storage.session.remove(pendingLoginKey(context))
        sendResponse({ ok: true, data: { pending: false } })
        return
      }
      await chrome.storage.session.set({ [pendingLoginKey(context)]: { ...pending, prompted: true } })
      sendResponse({ ok: true, data: { pending: true, accountName: pending.accountName, username: pending.username } })
    }).catch(() => sendResponse({ ok: false, code: 'UPDATE_FAILED' }))
    return true
  }
  if (message?.type === 'acceptPendingLogin' || message?.type === 'discardPendingLogin') {
    getPendingLogin(context).then(async pending => {
      const key = pendingLoginKey(context)
      await chrome.storage.session.remove(key)
      if (!pending || pending.origin !== context.origin || !pending.prompted) {
        sendResponse({ ok: false, code: 'SELECTION_EXPIRED' })
        return
      }
      if (message.type === 'discardPendingLogin') {
        sendResponse({ ok: true })
        return
      }
      sendResponse(await sendNative(createRequest('createCredential', pending.origin, {
        loginUrl: pending.loginUrl,
        accountName: pending.accountName,
        username: pending.username,
        password: pending.password,
      })))
    }).catch(() => sendResponse({ ok: false, code: 'UPDATE_FAILED' }))
    return true
  }
  sendResponse({ ok: false, code: 'UNKNOWN_MESSAGE' })
  return false
})

chrome.tabs.onRemoved.addListener(tabId => {
  clearTabSelections(tabId)
  // 删除标签页时清除所有框架暂存的登录信息。
  chrome.storage.session.get(null).then(items => Promise.all(
    Object.keys(items).filter(key => key.startsWith(`pending-login:${tabId}:`))
      .map(key => chrome.storage.session.remove(key))
  )).catch(error => console.warn('SafeVault 清理待保存账号失败：', error))
})
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) clearTabSelections(tabId)
})
