const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { findCredentialsForOrigin, normalizeWebsiteOrigin } = require('./credentialMatcher')

const ALLOWED_ACTIONS = new Set(['listCredentials', 'getCredential', 'reportFillResult', 'updateCredential'])
const MAX_PIPE_MESSAGE_BYTES = 1024 * 1024

function createError(requestId, code) {
  return { requestId: typeof requestId === 'string' ? requestId : '', ok: false, code }
}

function findAccount(data, accountId) {
  for (const tab of Array.isArray(data?.tabs) ? data.tabs : []) {
    const account = (Array.isArray(tab?.accounts) ? tab.accounts : [])
      .find(item => item?.id === accountId)
    if (account) return account
  }
  return null
}

function createBridgeServer({
  userSid,
  isUnlocked,
  getVaultData,
  updateCredential,
  requestTimeoutMs = 3_000,
  sessionToken = crypto.randomBytes(32).toString('base64url'),
} = {}) {
  if (typeof userSid !== 'string' || !userSid.trim()) throw new Error('Bridge Server 需要当前用户 SID。')
  if (typeof isUnlocked !== 'function' || typeof getVaultData !== 'function') {
    throw new Error('Bridge Server 需要密码库状态和数据提供函数。')
  }

  const sidHash = crypto.createHash('sha256').update(userSid).digest('hex').slice(0, 24)
  const pipeName = `safevault-${sidHash}`
  const pipePath = `\\\\.\\pipe\\${pipeName}`
  let server = null

  async function processRequest(request) {
    const requestId = request?.requestId
    if (typeof requestId !== 'string' || !requestId || requestId.length > 128) {
      return createError(requestId, 'INVALID_REQUEST')
    }
    if (!ALLOWED_ACTIONS.has(request?.action)) return createError(requestId, 'UNKNOWN_ACTION')

    const origin = normalizeWebsiteOrigin(request.origin)
    if (!origin) return createError(requestId, 'INVALID_REQUEST')
    if ((request.action === 'getCredential' || request.action === 'reportFillResult' || request.action === 'updateCredential')
      && (typeof request.accountId !== 'string' || !request.accountId)) {
      return createError(requestId, 'INVALID_REQUEST')
    }
    if (request.action === 'reportFillResult' && typeof request.success !== 'boolean') {
      return createError(requestId, 'INVALID_REQUEST')
    }
    if (request.action === 'updateCredential'
      && (typeof request.newPassword !== 'string' || !request.newPassword || request.newPassword.length > 4096)) {
      return createError(requestId, 'INVALID_REQUEST')
    }
    if (!isUnlocked()) return createError(requestId, 'LOCKED')

    if (request.action === 'reportFillResult') {
      return { requestId, ok: true, code: 'OK', data: { accepted: true } }
    }

    const data = await getVaultData()
    const summaries = findCredentialsForOrigin(data, origin)
    if (request.action === 'listCredentials') {
      return { requestId, ok: true, code: 'OK', data: { credentials: summaries } }
    }

    if (!summaries.some(summary => summary.id === request.accountId)) {
      return createError(requestId, 'NOT_FOUND')
    }
    if (request.action === 'updateCredential') {
      if (typeof updateCredential !== 'function') return createError(requestId, 'UPDATE_UNAVAILABLE')
      const result = await updateCredential({
        accountId: request.accountId,
        origin,
        newPassword: request.newPassword,
      })
      return result?.success
        ? { requestId, ok: true, code: 'OK', data: { updated: true } }
        : createError(requestId, 'UPDATE_FAILED')
    }
    const account = findAccount(data, request.accountId)
    if (!account) return createError(requestId, 'NOT_FOUND')
    return {
      requestId,
      ok: true,
      code: 'OK',
      data: {
        accountId: account.id,
        username: typeof account.username === 'string' ? account.username : '',
        password: typeof account.password === 'string' ? account.password : '',
      },
    }
  }

  async function handleMessage(envelope) {
    const requestId = envelope?.request?.requestId
    if (typeof envelope?.token !== 'string' || envelope.token !== sessionToken) {
      return createError(requestId, 'AUTH_FAILED')
    }

    let timeoutId
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve(createError(requestId, 'TIMEOUT')), requestTimeoutMs)
    })
    try {
      return await Promise.race([processRequest(envelope.request), timeout])
    } catch {
      return createError(requestId, 'INTERNAL_ERROR')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  function handleConnection(socket) {
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', async chunk => {
      buffer += chunk
      if (Buffer.byteLength(buffer, 'utf8') > MAX_PIPE_MESSAGE_BYTES) {
        socket.end(`${JSON.stringify(createError('', 'MESSAGE_TOO_LARGE'))}\n`)
        return
      }
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return
      const line = buffer.slice(0, newlineIndex)
      buffer = ''
      let envelope
      try {
        envelope = JSON.parse(line)
      } catch {
        socket.end(`${JSON.stringify(createError('', 'INVALID_JSON'))}\n`)
        return
      }
      socket.end(`${JSON.stringify(await handleMessage(envelope))}\n`)
    })
    socket.on('error', () => {})
  }

  async function start() {
    if (server) return
    server = net.createServer(handleConnection)
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(pipePath, () => {
        server.off('error', reject)
        resolve()
      })
    })
  }

  async function stop() {
    if (!server) return
    const activeServer = server
    server = null
    await new Promise(resolve => activeServer.close(resolve))
  }

  return { sessionToken, pipeName, pipePath, handleMessage, start, stop }
}

function getCurrentUserSid() {
  const output = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true })
  const matches = [...output.matchAll(/"([^"]+)"/g)]
  const sid = matches.at(-1)?.[1]
  if (!sid?.startsWith('S-')) throw new Error('无法获取当前 Windows 用户 SID。')
  return sid
}

function protectTokenForCurrentUser(token) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$encoded = [Console]::In.ReadToEnd()',
    '$bytes = [Convert]::FromBase64String($encoded)',
    '$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($protected))',
  ].join('; ')
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: Buffer.from(token, 'utf8').toString('base64'),
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
}

function writeBridgeConfig({ pipeName, sessionToken, configPath }) {
  const targetPath = configPath || path.join(process.env.LOCALAPPDATA || os.homedir(), 'SafeVault', 'bridge.json')
  const temporaryPath = `${targetPath}.tmp`
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(temporaryPath, JSON.stringify({
    pipeName,
    protectedToken: protectTokenForCurrentUser(sessionToken),
  }, null, 2), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, targetPath)
  return targetPath
}

module.exports = {
  createBridgeServer,
  getCurrentUserSid,
  protectTokenForCurrentUser,
  writeBridgeConfig,
}
