const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const extensionDirectory = path.join(__dirname, '..', 'browser-extension')
const read = file => fs.readFileSync(path.join(extensionDirectory, file), 'utf8')

function input(overrides = {}) {
  return {
    type: 'text',
    autocomplete: '',
    name: '',
    id: '',
    disabled: false,
    hidden: false,
    formId: 'default',
    ...overrides,
  }
}

function verifyManifestAndSources() {
  const manifest = JSON.parse(read('manifest.json'))
  assert.strictEqual(manifest.manifest_version, 3)
  assert.strictEqual(manifest.permissions.includes('nativeMessaging'), true)
  assert.strictEqual(manifest.permissions.includes('storage'), true)
  assert.strictEqual(manifest.host_permissions.includes('http://*/*'), true)
  assert.strictEqual(manifest.host_permissions.includes('https://*/*'), true)
  assert.strictEqual(manifest.background.service_worker, 'service-worker.js')

  const sources = [
    read('service-worker.js'),
    read('content-script.js'),
    read('popup.js'),
    read('shared/fieldDetector.js'),
  ].join('\n')
  assert.doesNotMatch(sources, /\beval\s*\(|new Function\s*\(/)
  assert.doesNotMatch(sources, /https?:\/\/[^'"\s]+\.js/)
  assert.doesNotMatch(read('content-script.js'), /localStorage|sessionStorage|indexedDB|chrome\.storage/)
  assert.match(read('service-worker.js'), /sender\.tab\?\.url/)
  assert.match(read('service-worker.js'), /sender\.url/)
  assert.match(read('service-worker.js'), /sender\.frameId/)
  assert.doesNotMatch(read('service-worker.js'), /message\.origin/)
  assert.match(read('content-script.js'), /MutationObserver/)
  assert.match(read('content-script.js'), /disconnect\(\)/)
  assert.match(read('content-script.js'), /updateCredential/)
  assert.match(read('content-script.js'), /loginSubmitted/)
}

async function verifyAutomaticLoginSave() {
  const session = new Map()
  const nativeRequests = []
  let onMessage
  const chrome = {
    runtime: {
      onMessage: { addListener: handler => { onMessage = handler } },
      sendNativeMessage: (host, request, callback) => {
        nativeRequests.push(request)
        callback(request.action === 'listCredentials'
          ? { ok: true, data: { credentials: [] } }
          : { ok: true, data: { accountId: 'saved-account' } })
      },
    },
    tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
    storage: { session: {
      get: async key => key === null ? Object.fromEntries(session) : { [key]: session.get(key) },
      set: async items => { for (const [key, value] of Object.entries(items)) session.set(key, value) },
      remove: async key => { session.delete(key) },
    } },
  }
  vm.runInNewContext(read('service-worker.js'), { chrome, URL, crypto: { randomUUID: () => 'test-request' } })
  const dispatch = (message, url) => new Promise(resolve => {
    onMessage(message, { url, tab: { id: 7, url }, frameId: 0 }, resolve)
  })
  const submitted = await dispatch({
    type: 'loginSubmitted', accountName: 'Example', username: 'alice', password: 'secret',
  }, 'https://example.com/login')
  assert.strictEqual(submitted.ok, true)
  assert.strictEqual(session.size, 1)

  const samePage = await dispatch({ type: 'checkPendingLogin', hasLoginForm: false }, 'https://example.com/login')
  assert.strictEqual(samePage.data.pending, false)
  const stillLoggingIn = await dispatch({ type: 'checkPendingLogin', hasLoginForm: true }, 'https://example.com/dashboard')
  assert.strictEqual(stillLoggingIn.data.pending, false)
  const challenge = await dispatch({ type: 'checkPendingLogin', hasLoginForm: false, hasChallengeField: true }, 'https://example.com/verify')
  assert.strictEqual(challenge.data.pending, false)

  const candidate = await dispatch({ type: 'checkPendingLogin', hasLoginForm: false }, 'https://example.com/dashboard')
  assert.strictEqual(candidate.data.pending, true)
  assert.strictEqual(candidate.data.username, 'alice')
  assert.strictEqual(Object.hasOwn(candidate.data, 'password'), false)
  const saved = await dispatch({ type: 'acceptPendingLogin' }, 'https://example.com/dashboard')
  assert.strictEqual(saved.ok, true)
  assert.strictEqual(session.size, 0)
  const create = nativeRequests.find(request => request.action === 'createCredential')
  assert.strictEqual(create.origin, 'https://example.com')
  assert.strictEqual(create.loginUrl, 'https://example.com/login')
  assert.strictEqual(create.username, 'alice')
  assert.strictEqual(create.password, 'secret')
}

function verifyFieldDetection() {
  const { detectLoginForms } = require('../browser-extension/shared/fieldDetector')

  const standard = detectLoginForms([
    input({ autocomplete: 'username' }),
    input({ type: 'password', autocomplete: 'current-password' }),
  ])
  assert.strictEqual(standard.length, 1)
  assert.strictEqual(standard[0].usernameField.autocomplete, 'username')
  assert.strictEqual(standard[0].passwordField.autocomplete, 'current-password')

  const emailPassword = detectLoginForms([
    input({ type: 'email', name: 'email' }),
    input({ type: 'password', name: 'password' }),
  ])
  assert.strictEqual(emailPassword[0].usernameField.type, 'email')

  const filtered = detectLoginForms([
    input({ type: 'hidden', name: 'username' }),
    input({ disabled: true, name: 'email' }),
    input({ type: 'search', name: 'search' }),
    input({ type: 'password', name: 'password' }),
  ])
  assert.strictEqual(filtered[0].usernameField, null)
  assert.strictEqual(filtered[0].passwordField.type, 'password')

  const multiple = detectLoginForms([
    input({ formId: 'login-a', autocomplete: 'username' }),
    input({ formId: 'login-a', type: 'password' }),
    input({ formId: 'login-b', type: 'email' }),
    input({ formId: 'login-b', type: 'password' }),
  ])
  assert.strictEqual(multiple.length, 2)
  assert.notStrictEqual(multiple[0].formKey, multiple[1].formKey)

  const stagedUsername = detectLoginForms([
    input({ formId: 'staged', autocomplete: 'username' }),
  ])
  assert.strictEqual(stagedUsername.length, 1)
  assert.strictEqual(stagedUsername[0].kind, 'username-step')

  const stagedPassword = detectLoginForms([
    input({ formId: 'staged', type: 'password', autocomplete: 'current-password' }),
  ])
  assert.strictEqual(stagedPassword[0].kind, 'password-step')

  const passwordChange = detectLoginForms([
    input({ formId: 'change', type: 'password', autocomplete: 'current-password' }),
    input({ formId: 'change', type: 'password', autocomplete: 'new-password', name: 'newPassword' }),
    input({ formId: 'change', type: 'password', autocomplete: 'new-password', name: 'confirmPassword' }),
  ])
  assert.strictEqual(passwordChange[0].kind, 'password-change')
  assert.strictEqual(passwordChange[0].newPasswordFields.length, 2)

  const otpAndDecoy = detectLoginForms([
    input({ formId: 'otp', autocomplete: 'one-time-code', name: 'otp' }),
    input({ formId: 'otp', hidden: true, autocomplete: 'username' }),
    input({ formId: 'otp', type: 'password', autocomplete: 'current-password' }),
  ])
  assert.strictEqual(otpAndDecoy[0].usernameField, null)

  const dynamicInputs = [input({ formId: 'dynamic', autocomplete: 'username' })]
  assert.strictEqual(detectLoginForms(dynamicInputs)[0].kind, 'username-step')
  dynamicInputs.push(input({ formId: 'dynamic', type: 'password', autocomplete: 'current-password' }))
  assert.strictEqual(detectLoginForms(dynamicInputs)[0].kind, 'login')
}

async function verifyPopupTimeoutStatus(code = 'TIMEOUT', expected = 'SafeVault 服务启动超时，请手动打开主程序后重试。') {
  const statusElement = { textContent: '' }
  const accountsElement = { replaceChildren() {}, appendChild() {} }
  const saveForm = { addEventListener() {} }
  vm.runInNewContext(read('popup.js'), {
    document: {
      getElementById: id => id === 'status' ? statusElement : id === 'save-account-form' ? saveForm : accountsElement,
      createElement: () => ({}),
    },
    chrome: {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async () => ({ ok: false, code }),
      },
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.strictEqual(statusElement.textContent, expected)
}

async function verifyPopupSave() {
  let submitHandler
  let savedMessage
  let wasReset = false
  const statusElement = { textContent: '' }
  const button = { disabled: false }
  const fields = {
    'account-name': { value: 'Example' },
    username: { value: 'bob' },
    password: { value: 'another-secret' },
  }
  const saveForm = {
    addEventListener: (type, handler) => { if (type === 'submit') submitHandler = handler },
    querySelector: () => button,
    reset: () => { wasReset = true },
  }
  vm.runInNewContext(read('popup.js'), {
    document: {
      getElementById: id => id === 'status' ? statusElement
        : id === 'accounts' ? { replaceChildren() {}, appendChild() {} }
          : id === 'save-account-form' ? saveForm : fields[id] || {},
      createElement: () => ({}),
    },
    chrome: {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (id, message) => {
          if (message.type === 'saveCredential') {
            savedMessage = message
            return { ok: true }
          }
          return { ok: true, data: { credentials: [] } }
        },
      },
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  await submitHandler({ preventDefault() {} })
  assert.strictEqual(savedMessage.accountName, 'Example')
  assert.strictEqual(savedMessage.username, 'bob')
  assert.strictEqual(savedMessage.password, 'another-secret')
  assert.strictEqual(wasReset, true)
  assert.strictEqual(button.disabled, false)
  assert.strictEqual(statusElement.textContent, '已保存到默认标签。')
}

async function main() {
  verifyManifestAndSources()
  verifyFieldDetection()
  await verifyPopupTimeoutStatus()
  await verifyPopupTimeoutStatus('APP_UNAVAILABLE', 'SafeVault 桥接服务不可用，请重启主程序；若仍失败，请检查主程序与桥接组件版本。')
  await verifyPopupTimeoutStatus('NATIVE_HOST_ERROR', '无法启动 SafeVault 桥接组件，请检查扩展 ID、Native Host 注册和安装路径。')
  await verifyPopupSave()
  await verifyAutomaticLoginSave()
  console.log('browser extension verification passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
