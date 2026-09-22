const assert = require('assert')
const fs = require('fs').promises
const net = require('net')
const os = require('os')
const path = require('path')
const { createBridgeServer, writeBridgeConfig } = require('../electron/bridgeServer')

const DATA = {
  schemaVersion: 3,
  tabs: [{
    id: 'tab-1',
    name: 'Work',
    accounts: [{
      id: 'account-1',
      accountName: 'Example',
      username: 'alice',
      password: 'bridge-secret',
      email: 'alice@example.com',
      loginTargets: [{ id: 'target-1', type: 'website', origin: 'https://example.com', enabled: true }],
    }],
    urls: [],
  }],
}

function request(action, overrides = {}) {
  return {
    requestId: 'request-1',
    action,
    origin: 'https://example.com',
    ...overrides,
  }
}

async function main() {
  const updates = []
  const first = createBridgeServer({
    userSid: 'S-1-5-21-test',
    isUnlocked: () => true,
    getVaultData: async () => DATA,
    updateCredential: async update => {
      updates.push(update)
      return { success: true }
    },
  })
  const second = createBridgeServer({ userSid: 'S-1-5-21-test', isUnlocked: () => true, getVaultData: async () => DATA })
  assert.notStrictEqual(first.sessionToken, second.sessionToken)
  assert.strictEqual(first.pipeName, second.pipeName)
  assert.match(first.pipeName, /^safevault-[a-f0-9]{24}$/)

  const invalidToken = await first.handleMessage({ token: 'wrong', request: request('listCredentials') })
  assert.deepStrictEqual(invalidToken, { requestId: 'request-1', ok: false, code: 'AUTH_FAILED' })

  const locked = createBridgeServer({ userSid: 'S-1-5-21-test', isUnlocked: () => false, getVaultData: async () => DATA })
  const lockedResult = await locked.handleMessage({ token: locked.sessionToken, request: request('listCredentials') })
  assert.deepStrictEqual(lockedResult, { requestId: 'request-1', ok: false, code: 'LOCKED' })

  const unknown = await first.handleMessage({ token: first.sessionToken, request: request('deleteEverything') })
  assert.deepStrictEqual(unknown, { requestId: 'request-1', ok: false, code: 'UNKNOWN_ACTION' })

  const listed = await first.handleMessage({ token: first.sessionToken, request: request('listCredentials') })
  assert.strictEqual(listed.ok, true)
  assert.strictEqual(listed.data.credentials.length, 1)
  assert.strictEqual(Object.hasOwn(listed.data.credentials[0], 'password'), false)

  const credential = await first.handleMessage({
    token: first.sessionToken,
    request: request('getCredential', { accountId: 'account-1' }),
  })
  assert.deepStrictEqual(credential.data, { accountId: 'account-1', username: 'alice', password: 'bridge-secret' })

  const wrongOrigin = await first.handleMessage({
    token: first.sessionToken,
    request: request('getCredential', { origin: 'https://example.com.evil.test', accountId: 'account-1' }),
  })
  assert.strictEqual(wrongOrigin.code, 'NOT_FOUND')

  const updated = await first.handleMessage({
    token: first.sessionToken,
    request: request('updateCredential', { accountId: 'account-1', newPassword: 'rotated-secret' }),
  })
  assert.deepStrictEqual(updated, { requestId: 'request-1', ok: true, code: 'OK', data: { updated: true } })
  assert.deepStrictEqual(updates, [{ accountId: 'account-1', origin: 'https://example.com', newPassword: 'rotated-secret' }])

  const rejectedUpdate = await first.handleMessage({
    token: first.sessionToken,
    request: request('updateCredential', {
      origin: 'https://example.com.evil.test',
      accountId: 'account-1',
      newPassword: 'must-not-save',
    }),
  })
  assert.strictEqual(rejectedUpdate.code, 'NOT_FOUND')
  assert.strictEqual(updates.length, 1)

  const missingPassword = await first.handleMessage({
    token: first.sessionToken,
    request: request('updateCredential', { accountId: 'account-1', newPassword: '' }),
  })
  assert.strictEqual(missingPassword.code, 'INVALID_REQUEST')

  const timed = createBridgeServer({
    userSid: 'S-1-5-21-test',
    isUnlocked: () => true,
    getVaultData: () => new Promise(() => {}),
    requestTimeoutMs: 10,
  })
  const timeout = await timed.handleMessage({ token: timed.sessionToken, request: request('listCredentials') })
  assert.deepStrictEqual(timeout, { requestId: 'request-1', ok: false, code: 'TIMEOUT' })

  await first.start()
  try {
    const pipeResponse = await new Promise((resolve, reject) => {
      const socket = net.createConnection(first.pipePath)
      let responseText = ''
      socket.setEncoding('utf8')
      socket.on('connect', () => socket.write(`${JSON.stringify({
        token: first.sessionToken,
        request: request('listCredentials'),
      })}\n`))
      socket.on('data', chunk => { responseText += chunk })
      socket.on('end', () => resolve(JSON.parse(responseText)))
      socket.on('error', reject)
    })
    assert.strictEqual(pipeResponse.ok, true)
  } finally {
    await first.stop()
  }

  const configDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'safevault-bridge-config-'))
  try {
    const configPath = path.join(configDirectory, 'bridge.json')
    const appPath = 'C:\\Program Files\\SafeVault\\SafeVault.exe'
    writeBridgeConfig({
      pipeName: first.pipeName,
      sessionToken: first.sessionToken,
      appPath,
      configPath,
      protectToken: token => `protected:${token.length}`,
    })
    const configRaw = await fs.readFile(configPath, 'utf8')
    const config = JSON.parse(configRaw)
    assert.strictEqual(config.pipeName, first.pipeName)
    assert.strictEqual(config.appPath, appPath)
    assert.strictEqual(config.protectedToken, `protected:${first.sessionToken.length}`)
    assert.strictEqual(configRaw.includes(first.sessionToken), false)

    writeBridgeConfig({
      pipeName: first.pipeName,
      sessionToken: first.sessionToken,
      appPath,
      configPath,
      bridgePath: path.join(__dirname, '../native-bridge/bin/Debug/net8.0-windows/SafeVault.Bridge.exe'),
    })
    const protectedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'))
    const protectedBytes = Buffer.from(protectedConfig.protectedToken, 'base64')
    assert.strictEqual(protectedBytes.subarray(0, 4).toString('hex'), '01000000')
    assert.strictEqual(protectedConfig.protectedToken.includes(first.sessionToken), false)
  } finally {
    await fs.rm(configDirectory, { recursive: true, force: true })
  }

  console.log('bridge server verification passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
