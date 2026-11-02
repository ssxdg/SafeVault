const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const msal = require('@azure/msal-node')
const { isVaultEnvelope } = require('./vaultCrypto')

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
const VAULT_NAME = 'safe_vault.json'
const SCOPES = ['Files.ReadWrite.AppFolder', 'offline_access']
const MAX_VAULT_BYTES = 20 * 1024 * 1024

const hashEnvelope = envelope => crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex')

function decideSync({ localHash, syncedHash, remoteEtag, storedEtag, remoteHash, hasRemote }) {
  if (!hasRemote) return syncedHash ? 'conflict' : 'initial-upload'
  if (!syncedHash) return remoteHash === localHash ? 'synced' : 'conflict'
  if (remoteEtag !== storedEtag) {
    if (remoteHash === localHash) return 'synced'
    return localHash === syncedHash ? 'remote-newer' : 'conflict'
  }
  return localHash === syncedHash ? 'synced' : 'upload'
}

function createOneDriveSync({ userDataPath, safeStorage, fileManager, vaultSession, openExternal, onStatus = () => {}, onDeviceCode = () => {} }) {
  const settingsPath = path.join(userDataPath, 'safe_vault_cloud.json')
  let settings = {}
  let client = null
  let timer = null
  let pendingTask = Promise.resolve()
  let status = { state: 'disabled' }

  const publish = (state, extra = {}) => {
    status = { state, account: settings.account || '', clientId: settings.clientId || '', lastSyncedAt: settings.lastSyncedAt || '', ...extra }
    onStatus(status)
    return status
  }

  const saveSettings = async () => {
    const temporaryPath = `${settingsPath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(settings), 'utf8')
    await fs.rename(temporaryPath, settingsPath)
  }

  const persistTokenCache = async () => {
    if (!client) return
    // OAuth 缓存仅在主进程可读，并使用当前 Windows 用户的系统密钥保护。
    settings.cache = safeStorage.encryptString(client.getTokenCache().serialize()).toString('base64')
    await saveSettings()
  }

  const createClient = clientId => new msal.PublicClientApplication({
    auth: { clientId, authority: 'https://login.microsoftonline.com/consumers/' },
  })

  const initialize = async () => {
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
      if (!settings.clientId) return publish('disabled')
      client = createClient(settings.clientId)
      if (settings.cache) {
        const cache = safeStorage.decryptString(Buffer.from(settings.cache, 'base64'))
        client.getTokenCache().deserialize(cache)
      }
      return publish(settings.accountId ? 'connected' : 'auth-required')
    } catch (error) {
      if (error.code === 'ENOENT') return publish('disabled')
      return publish('auth-required', { error: 'OneDrive 授权缓存不可用，请重新连接。' })
    }
  }

  const getToken = async () => {
    if (!client || !settings.accountId) throw new Error('请先连接 OneDrive。')
    const accounts = await client.getTokenCache().getAllAccounts()
    const account = accounts.find(item => item.homeAccountId === settings.accountId)
    if (!account) throw new Error('OneDrive 授权已失效，请重新连接。')
    const result = await client.acquireTokenSilent({ account, scopes: SCOPES })
    await persistTokenCache()
    if (!result?.accessToken) throw new Error('无法获取 OneDrive 授权。')
    return result.accessToken
  }

  const graphRequest = async (token, endpoint, options = {}) => {
    const response = await fetch(`${GRAPH_ROOT}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 404) return null
    if (!response.ok) {
      const error = new Error(`OneDrive 请求失败（${response.status}）。`)
      error.status = response.status
      throw error
    }
    return response
  }

  const readRemoteMetadata = async token => {
    const response = await graphRequest(token, `/me/drive/special/approot:/${VAULT_NAME}?$select=id,eTag,size`)
    return response ? response.json() : null
  }

  const readRemoteEnvelope = async (token, metadata) => {
    if (!metadata || metadata.size > MAX_VAULT_BYTES) throw new Error('云端密码库不存在或文件过大。')
    const response = await graphRequest(token, `/me/drive/items/${encodeURIComponent(metadata.id)}/content`)
    if (!response) throw new Error('云端密码库已被删除。')
    const raw = await response.text()
    if (Buffer.byteLength(raw, 'utf8') > MAX_VAULT_BYTES) throw new Error('云端密码库文件过大。')
    const envelope = JSON.parse(raw)
    if (!isVaultEnvelope(envelope)) throw new Error('云端文件不是有效的加密密码库。')
    return envelope
  }

  const rememberSync = async (envelope, metadata) => {
    settings.syncedHash = hashEnvelope(envelope)
    settings.remoteEtag = metadata.eTag
    settings.lastSyncedAt = new Date().toISOString()
    await saveSettings()
    return publish('synced')
  }

  const upload = async (token, envelope, metadata) => {
    const content = Buffer.from(JSON.stringify(envelope), 'utf8')
    if (content.length > MAX_VAULT_BYTES) throw new Error('本地加密密码库文件过大，无法同步。')
    const endpoint = metadata
      ? `/me/drive/items/${encodeURIComponent(metadata.id)}/createUploadSession`
      : `/me/drive/special/approot:/${VAULT_NAME}:/createUploadSession`
    // 上传会话明确支持版本条件，避免检查远端版本后又被其他设备抢先写入。
    const sessionResponse = await graphRequest(token, endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(metadata ? { 'If-Match': metadata.eTag } : { 'If-None-Match': '*' }),
      },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': metadata ? 'replace' : 'fail', name: VAULT_NAME } }),
    })
    if (!sessionResponse) throw new Error('无法创建 OneDrive 上传会话。')
    const { uploadUrl } = await sessionResponse.json()
    if (!uploadUrl || new URL(uploadUrl).protocol !== 'https:') throw new Error('OneDrive 返回的上传地址无效。')
    const chunkSize = 5 * 1024 * 1024
    let result
    for (let offset = 0; offset < content.length; offset += chunkSize) {
      const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.length))
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${content.length}`,
        },
        body: chunk,
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        const error = new Error(`OneDrive 上传失败（${response.status}）。`)
        error.status = response.status
        throw error
      }
      result = await response.json()
    }
    if (!result?.eTag) throw new Error('OneDrive 未确认文件上传完成。')
    return rememberSync(envelope, result)
  }

  const exclusive = task => {
    const next = pendingTask.then(task)
    pendingTask = next.catch(() => {})
    return next
  }

  const connect = clientId => exclusive(async () => {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId || '')) {
      return { success: false, error: '请输入有效的 Microsoft 应用 Client ID。' }
    }
    if (settings.accountId && settings.clientId !== clientId) {
      return { success: false, error: '请先断开当前 OneDrive 连接，再切换应用。' }
    }
    try {
      client = createClient(clientId)
      settings.clientId = clientId
      const result = await client.acquireTokenByDeviceCode({
        scopes: SCOPES,
        deviceCodeCallback: code => {
          onDeviceCode({ userCode: code.userCode, verificationUri: code.verificationUri })
          const url = new URL(code.verificationUri)
          if (url.protocol === 'https:' && (url.hostname === 'microsoft.com' || url.hostname.endsWith('.microsoft.com'))) {
            void Promise.resolve(openExternal(url.toString())).catch(() => {})
          }
        },
      })
      if (!result?.account) throw new Error('Microsoft 登录未完成。')
      if (settings.accountId && settings.accountId !== result.account.homeAccountId) {
        throw new Error('登录的 Microsoft 账号与当前同步账号不一致，请先断开连接。')
      }
      settings.accountId = result.account.homeAccountId
      settings.account = result.account.username
      await persistTokenCache()
      publish('connected')
      return { success: true, status }
    } catch (error) {
      publish('auth-required', { error: error.message })
      return { success: false, error: error.message }
    }
  })

  const performSync = async () => {
    if (!settings.accountId) return { success: false, status: publish(settings.clientId ? 'auth-required' : 'disabled') }
    if (!vaultSession.getData()) return { success: false, error: '请先解锁本地密码库。' }
    try {
      publish('syncing')
      const token = await getToken()
      const local = await fileManager.readEncryptedEnvelope()
      const localHash = hashEnvelope(local)
      const remote = await readRemoteMetadata(token)
      const remoteHash = remote && (!settings.syncedHash || remote.eTag !== settings.remoteEtag)
        ? hashEnvelope(await readRemoteEnvelope(token, remote)) : ''
      const decision = decideSync({
        localHash, syncedHash: settings.syncedHash, remoteEtag: remote?.eTag,
        storedEtag: settings.remoteEtag, remoteHash, hasRemote: Boolean(remote),
      })
      if (decision === 'synced') return { success: true, status: await rememberSync(local, remote) }
      if (decision === 'upload') return { success: true, status: await upload(token, local, remote) }
      const error = !remote && settings.syncedHash ? '云端文件已被删除，请选择恢复方式。'
        : !settings.syncedHash && remote ? '本地与云端都有密码库，请选择保留哪一份。' : ''
      return { success: false, status: publish(decision, error ? { error } : {}) }
    } catch (error) {
      const needsAuth = error.status === 401 || error.status === 403 || /interaction_required|no_account/i.test(error.errorCode || '')
      const state = needsAuth ? 'auth-required' : [409, 412].includes(error.status) ? 'conflict' : 'pending'
      return { success: false, status: publish(state, { error: error.message }) }
    }
  }

  const sync = () => exclusive(performSync)

  const uploadLocal = force => exclusive(async () => {
    if (!vaultSession.getData()) return { success: false, error: '请先解锁本地密码库。' }
    try {
      const token = await getToken()
      const remote = await readRemoteMetadata(token)
      if (remote && !force && remote.eTag !== settings.remoteEtag) {
        return { success: false, status: publish('conflict', { error: '云端已变化，请先检查冲突。' }) }
      }
      const local = await fileManager.readEncryptedEnvelope()
      return { success: true, status: await upload(token, local, remote) }
    } catch (error) {
      return { success: false, status: publish([409, 412].includes(error.status) ? 'conflict' : 'pending', { error: error.message }) }
    }
  })

  const restoreRemote = password => exclusive(async () => {
    try {
      if (!password) throw new Error('请输入云端密码库的主密码。')
      const token = await getToken()
      const remote = await readRemoteMetadata(token)
      const envelope = await readRemoteEnvelope(token, remote)
      const data = await fileManager.installEncryptedEnvelope(envelope, password)
      vaultSession.adoptData(data)
      await rememberSync(envelope, remote)
      return { success: true, data, status }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  const markLocalChanged = () => {
    if (!settings.accountId) return
    publish('pending')
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void sync() }, 5000)
  }

  const disconnect = () => exclusive(async () => {
    if (timer) clearTimeout(timer)
    settings = {}
    client = null
    await fs.rm(settingsPath, { force: true })
    return { success: true, status: publish('disabled') }
  })

  return { initialize, connect, sync, uploadLocal, restoreRemote, markLocalChanged, disconnect, getStatus: () => status }
}

module.exports = { createOneDriveSync, hashEnvelope, decideSync }
