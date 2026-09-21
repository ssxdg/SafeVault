const NATIVE_HOST_NAME = 'com.safevault.bridge'
const SELECTION_TTL_MS = 2 * 60 * 1000
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

function sendNative(request) {
  return new Promise(resolve => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request, response => {
      if (chrome.runtime.lastError) {
        resolve({ requestId: request.requestId, ok: false, code: 'APP_UNAVAILABLE' })
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
  sendResponse({ ok: false, code: 'UNKNOWN_MESSAGE' })
  return false
})

chrome.tabs.onRemoved.addListener(clearTabSelections)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) clearTabSelections(tabId)
})
