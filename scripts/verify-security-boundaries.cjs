const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { createBridgeServer } = require('../electron/bridgeServer')

const SECRET = 'security-boundary-secret'
const DATA = {
  schemaVersion: 3,
  tabs: [{
    id: 'security-tab',
    accounts: [{
      id: 'security-account',
      username: 'security-user',
      password: SECRET,
      loginTargets: [{ type: 'website', origin: 'https://example.com', enabled: true }],
    }],
  }],
}

function request(action, overrides = {}) {
  return { requestId: 'security-request', action, origin: 'https://example.com', ...overrides }
}

async function main() {
  const locked = createBridgeServer({
    userSid: 'S-1-5-21-security',
    isUnlocked: () => false,
    getVaultData: async () => DATA,
  })
  const lockedResult = await locked.handleMessage({
    token: locked.sessionToken,
    request: request('getCredential', { accountId: 'security-account' }),
  })
  assert.strictEqual(lockedResult.code, 'LOCKED')
  assert.strictEqual(JSON.stringify(lockedResult).includes(SECRET), false)

  const unlocked = createBridgeServer({
    userSid: 'S-1-5-21-security',
    isUnlocked: () => true,
    getVaultData: async () => DATA,
  })
  const phishing = await unlocked.handleMessage({
    token: unlocked.sessionToken,
    request: request('getCredential', {
      origin: 'https://example.com.evil.test',
      accountId: 'security-account',
    }),
  })
  assert.strictEqual(phishing.code, 'NOT_FOUND')
  assert.strictEqual(JSON.stringify(phishing).includes(SECRET), false)

  const forgedMessage = await unlocked.handleMessage({
    token: 'forged-token',
    request: request('getCredential', { accountId: 'security-account' }),
  })
  assert.strictEqual(forgedMessage.code, 'AUTH_FAILED')
  assert.strictEqual(JSON.stringify(forgedMessage).includes(SECRET), false)

  const workerSource = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'service-worker.js'), 'utf8')
  assert.match(workerSource, /sender\.url/)
  assert.doesNotMatch(workerSource, /message\.origin/)

  const fillerSource = fs.readFileSync(path.join(__dirname, '..', 'native-bridge', 'Automation', 'CredentialFiller.cs'), 'utf8')
  assert.match(fillerSource, /foreground-changed/)
  assert.match(fillerSource, /ExpectedExecutablePath/)
  assert.doesNotMatch(fillerSource, /Console\.(Write|WriteLine).*Password/)

  console.log('security boundary verification passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
