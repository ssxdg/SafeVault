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
let hasSubmittedLogin = false
let isCheckingLogin = false

function refreshDetectedForms() {
  detectedForms = globalThis.SafeVaultFieldDetector.detectLoginForms(document.querySelectorAll('input'))
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshDetectedForms()
    if (hasSubmittedLogin) void checkPendingLogin()
  }, 120)
}

async function checkPendingLogin() {
  if (isCheckingLogin) return
  isCheckingLogin = true
  try {
    refreshDetectedForms()
    const hasLoginForm = detectedForms.some(form => form.passwordField || form.newPasswordFields.length > 0)
    const hasChallengeField = Boolean(document.querySelector('input[autocomplete="one-time-code"]'))
    const response = await chrome.runtime.sendMessage({ type: 'checkPendingLogin', hasLoginForm, hasChallengeField })
    if (!response?.ok || !response.data?.pending) return
    const { username } = response.data
    // 页面跳转且登录表单消失只能说明“可能成功”，由用户确认后才写入保险箱。
    if (!window.confirm(`检测到「${username}」可能已登录，是否保存到 SafeVault 默认标签？`)) {
      await chrome.runtime.sendMessage({ type: 'discardPendingLogin' })
      return
    }
    const saved = await chrome.runtime.sendMessage({ type: 'acceptPendingLogin' })
    if (!saved?.ok) window.alert('账号未能保存，请打开 SafeVault 插件手动添加。')
  } catch (error) {
    console.warn('SafeVault 检查待保存账号失败：', error)
  } finally {
    isCheckingLogin = false
  }
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
  if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(containsLoginInput))) scheduleRefresh()
})

refreshDetectedForms()
observer.observe(document.documentElement, { childList: true, subtree: true })
setTimeout(() => { void checkPendingLogin() }, 1200)

window.addEventListener('pagehide', () => {
  observer.disconnect()
  if (refreshTimer) clearTimeout(refreshTimer)
}, { once: true })

document.addEventListener('submit', event => {
  refreshDetectedForms()
  const target = detectedForms.find(form => (form.kind === 'password-change' || form.kind === 'login')
    && (form.formKey === event.target || form.newPasswordFields.some(field => event.target?.contains?.(field))))
  if (!target) return
  if (target.kind === 'login') {
    const username = target.usernameField?.value?.trim()
    const password = target.passwordField?.value
    if (!username || !password) return
    hasSubmittedLogin = true
    chrome.runtime.sendMessage({
      type: 'loginSubmitted',
      accountName: document.title?.trim().slice(0, 200) || location.hostname,
      username,
      password,
    }).catch(error => console.warn('SafeVault 暂存登录账号失败：', error))
    setTimeout(() => { void checkPendingLogin() }, 1500)
    return
  }
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
  if (message?.type === 'saveCredential') {
    chrome.runtime.sendMessage({
      type: 'saveCredential',
      accountName: message.accountName,
      username: message.username,
      password: message.password,
    }, sendResponse)
    return true
  }
  return false
})
