function setFieldValue(field, value) {
  if (!field || typeof value !== 'string') return false
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

let detectedForms = []
let refreshTimer = null

function refreshDetectedForms() {
  detectedForms = globalThis.SafeVaultFieldDetector.detectLoginForms(document.querySelectorAll('input'))
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshDetectedForms()
  }, 120)
}

function fillCredential(credential) {
  refreshDetectedForms()
  const target = detectedForms.find(form => form.kind !== 'password-change')
  if (!target) return false
  const usernameFilled = credential.username && target.usernameField
    ? setFieldValue(target.usernameField, credential.username)
    : true
  const passwordFilled = target.passwordField
    ? setFieldValue(target.passwordField, credential.password || '')
    : true
  return usernameFilled && passwordFilled
}

function containsLoginInput(node) {
  if (!(node instanceof Element)) return false
  return node.matches('input') || Boolean(node.querySelector('input'))
}

const observer = new MutationObserver(mutations => {
  if (mutations.some(mutation => [...mutation.addedNodes].some(containsLoginInput))) scheduleRefresh()
})

refreshDetectedForms()
observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('pagehide', () => {
  observer.disconnect()
  if (refreshTimer) clearTimeout(refreshTimer)
}, { once: true })

document.addEventListener('submit', event => {
  refreshDetectedForms()
  const target = detectedForms.find(form => form.kind === 'password-change'
    && (form.formKey === event.target || form.newPasswordFields.some(field => event.target?.contains?.(field))))
  if (!target) return
  const values = target.newPasswordFields.map(field => field.value).filter(Boolean)
  if (values.length === 0 || (values.length > 1 && values.some(value => value !== values[0]))) return
  if (!window.confirm('是否将新密码保存到 SafeVault？主程序必须保持解锁。')) return
  chrome.runtime.sendMessage({ type: 'updateCredential', newPassword: values[0] })
}, true)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'requestCredentialList') {
    chrome.runtime.sendMessage({ type: 'getCredentials' }, sendResponse)
    return true
  }
  if (message?.type === 'fillAccount' && typeof message.accountId === 'string') {
    chrome.runtime.sendMessage({ type: 'getCredential', accountId: message.accountId }, response => {
      if (!response?.ok || !response.data) {
        sendResponse(response || { ok: false, code: 'EMPTY_RESPONSE' })
        return
      }
      const success = fillCredential(response.data)
      chrome.runtime.sendMessage({ type: 'reportFillResult', accountId: message.accountId, success })
      sendResponse({ ok: success, code: success ? 'FILLED' : 'FIELDS_NOT_FOUND' })
    })
    return true
  }
  return false
})
