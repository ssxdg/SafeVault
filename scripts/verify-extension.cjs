const assert = require('assert')
const fs = require('fs')
const path = require('path')

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

verifyManifestAndSources()
verifyFieldDetection()
console.log('browser extension verification passed')
