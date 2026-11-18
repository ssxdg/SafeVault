const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { decryptVault, isVaultEnvelope } = require('./vaultCrypto')
const { normalizeData } = require('./dataNormalizer')
const { randomUUID } = require('crypto')
const { mergeVaultData, mergeVaultWriteData, contentEqual } = require('./vaultMerge')

const VAULT_FILE = 'safe_vault.json'

function validateRemoteUrl(value, allowLocalRemote = false) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error('请输入有效的仓库地址。')
  if (allowLocalRemote && path.isAbsolute(value)) return 'ssh'
  if (/^git@[^\s:@/]+:[^\s]+$/.test(value)) return 'ssh'
  let url
  try { url = new URL(value) } catch { throw new Error('仓库地址仅支持 HTTPS 或 SSH。') }
  if (!url.hostname || !url.pathname || url.pathname === '/' || url.search || url.hash) {
    throw new Error('仓库地址格式无效。')
  }
  if (url.password || (url.protocol === 'https:' && url.username)) throw new Error('不要把账户凭据写在仓库地址中。')
  if (url.protocol === 'https:') return 'https'
  if (url.protocol === 'ssh:') return 'ssh'
  throw new Error('仓库地址仅支持 HTTPS 或 SSH。')
}

function runGit(args, { cwd, env, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 100_000) child.kill() })
    child.stderr.on('data', chunk => { stderr += chunk.toString(); if (stderr.length > 100_000) child.kill() })
    child.on('error', error => {
      clearTimeout(timer)
      reject(new Error(error.code === 'ENOENT' ? '未找到 Git，请安装 Git 并确保 git 命令在 PATH 中。' : error.message))
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else {
        const message = timedOut ? 'Git 连接超时。' : (stderr.trim() || `Git 命令失败（退出码 ${code}）。`)
        reject(new Error(env?.SAFEVAULT_GIT_SECRET ? message.replaceAll(env.SAFEVAULT_GIT_SECRET, '[已隐藏]') : message))
      }
    })
  })
}

function createGitSyncManager({ userDataPath, safeStorage, allowLocalRemote = false, vault } = {}) {
  const settingsFile = path.join(userDataPath, 'git_sync_settings.json')
  // 远端提交必须在界面完成合并、写盘后才可成为新的同步基线。
  let pendingPull = null
  const baselineFile = path.join(userDataPath, 'git_sync_baseline.json')
  const snapshotsPath = path.join(userDataPath, 'sync-snapshots')
  let pendingSync = null
  let generation = 0

  async function readSettings() {
    try { return JSON.parse(await fs.readFile(settingsFile, 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') return null
      throw new Error('Git 同步配置无法读取，请检查配置文件。')
    }
  }

  function publicSettings(settings) {
    return {
      remoteUrl: settings?.remoteUrl || '',
      authMode: settings?.authMode || 'ssh',
      username: settings?.username || '',
      hasCredential: Boolean(settings?.encryptedCredential),
    }
  }

  async function writeSettings(settings) {
    await fs.mkdir(userDataPath, { recursive: true })
    const temporaryFile = `${settingsFile}.tmp`
    await fs.writeFile(temporaryFile, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 })
    await fs.rename(temporaryFile, settingsFile)
  }

  async function getSettings() {
    try { return { success: true, ...publicSettings(await readSettings()) } }
    catch (error) { return { success: false, error: error.message } }
  }

  async function saveSettings(input) {
    try {
      const authMode = validateRemoteUrl(input?.remoteUrl, allowLocalRemote)
      if (input.authMode !== authMode) throw new Error('认证方式与仓库地址不匹配。')
      const username = authMode === 'https' ? String(input.username || '').trim() : ''
      if (authMode === 'https' && !username) throw new Error('HTTPS 连接需要填写用户名。')
      const previous = await readSettings()
      const sameRemote = previous?.remoteUrl === input.remoteUrl && previous?.authMode === authMode && previous?.username === username
      let encryptedCredential = sameRemote ? previous.encryptedCredential : undefined
      if (input.credential) {
        if (authMode !== 'https') throw new Error('SSH 模式不需要填写访问令牌。')
        if (!safeStorage?.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存访问令牌。')
        encryptedCredential = safeStorage.encryptString(String(input.credential)).toString('base64')
      }
      if (authMode === 'https' && !encryptedCredential) throw new Error('请输入 HTTPS 访问令牌。')
      const settings = {
        remoteUrl: input.remoteUrl,
        authMode,
        username,
        encryptedCredential,
        lastCommit: sameRemote ? previous.lastCommit : null,
      }
      await writeSettings(settings)
      pendingPull = null
      cancelSync()
      return { success: true, ...publicSettings(settings) }
    } catch (error) { return { success: false, error: error.message } }
  }

  async function withClone(action) {
    const settings = await readSettings()
    if (!settings) throw new Error('请先配置 Git 仓库。')
    const authMode = validateRemoteUrl(settings.remoteUrl, allowLocalRemote)
    if (settings.authMode !== authMode) throw new Error('Git 仓库配置无效。')
    const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'safevault-sync-'))
    const clonePath = path.join(workRoot, 'repository')
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: '',
    }
    try {
      if (authMode === 'https') {
        // 凭据只放在短生命周期子进程环境中，askpass 脚本文件本身不包含用户名或令牌。
        if (!settings.encryptedCredential || !safeStorage?.isEncryptionAvailable()) throw new Error('HTTPS 凭据不可用，请重新保存访问令牌。')
        env.SAFEVAULT_GIT_USERNAME = settings.username
        env.SAFEVAULT_GIT_SECRET = safeStorage.decryptString(Buffer.from(settings.encryptedCredential, 'base64'))
        env.SAFEVAULT_ELECTRON_EXE = process.execPath
        env.SAFEVAULT_ASKPASS_SCRIPT = path.join(__dirname, 'gitAskpass.js')
        env.ELECTRON_RUN_AS_NODE = '1'
        env.GIT_ASKPASS = path.join(workRoot, 'askpass.cmd')
        await fs.writeFile(env.GIT_ASKPASS, '@echo off\r\n"%SAFEVAULT_ELECTRON_EXE%" "%SAFEVAULT_ASKPASS_SCRIPT%" "%~1"\r\n', 'utf8')
      } else {
        // SSH 使用本机已配置的密钥和 ssh-agent；禁止弹出无法由应用接管的交互提示。
        env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
      }
      // 合并使用独立保存的加密基线，只需远端最新提交，避免反复下载全部加密历史。
      await runGit(['-c', 'credential.helper=', 'clone', '--depth', '1', '--single-branch', '--no-tags', '--', settings.remoteUrl, clonePath], { env })
      const head = await runGit(['-C', clonePath, 'rev-parse', '--verify', 'HEAD'], { env }).catch(() => null)
      const result = await action({ settings, clonePath, env, head })
      return result
    } finally {
      await fs.rm(workRoot, { recursive: true, force: true })
    }
  }

  async function testConnection() {
    try {
      return await withClone(async ({ clonePath }) => {
        const hasVault = await fs.lstat(path.join(clonePath, VAULT_FILE))
          .then(stat => stat.isFile())
          .catch(error => {
            if (error.code === 'ENOENT') return false
            throw error
          })
        return { success: true, hasVault }
      })
    } catch (error) { return { success: false, error: error.message } }
  }

  async function pull(password) {
    try {
      pendingPull = null
      return await withClone(async ({ settings, clonePath, head }) => {
        if (!head) throw new Error('远端仓库还没有密码库，请先在有数据的设备上推送。')
        if (settings.lastCommit === head) return { success: true, unchanged: true }
        const vaultPath = path.join(clonePath, VAULT_FILE)
        const stat = await fs.lstat(vaultPath)
        if (!stat.isFile()) throw new Error('远端密码库文件无效。')
        const envelope = JSON.parse(await fs.readFile(vaultPath, 'utf8'))
        if (!isVaultEnvelope(envelope)) throw new Error('远端文件不是 SafeVault 加密密码库。')
        const data = normalizeData(await decryptVault(envelope, password))
        // UI 合并并保存成功后才确认同步版本，避免导入失败却允许覆盖远端。
        pendingPull = { commit: head, remoteUrl: settings.remoteUrl }
        return { success: true, data, commit: head }
      })
    } catch (error) { return { success: false, error: error.message } }
  }

  async function confirmPull(commit) {
    try {
      if (typeof commit !== 'string' || !/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('远端版本无效。')
      const settings = await readSettings()
      if (!settings) throw new Error('请先配置 Git 仓库。')
      if (pendingPull?.commit !== commit || pendingPull.remoteUrl !== settings.remoteUrl) throw new Error('没有待确认的 Git 导入。')
      await writeSettings({ ...settings, lastCommit: commit })
      pendingPull = null
      return { success: true }
    } catch (error) { return { success: false, error: error.message } }
  }

  async function push(envelope) {
    try {
      if (!isVaultEnvelope(envelope)) throw new Error('本地密码库不是有效的加密文件。')
      return await withClone(async ({ settings, clonePath, env, head }) => {
        // 加密 JSON 不做 Git 文本合并；只允许从已确认的远端版本继续提交。
        const remoteVaultPath = path.join(clonePath, VAULT_FILE)
        const remoteVaultExists = await fs.lstat(remoteVaultPath).then(stat => {
          if (!stat.isFile()) throw new Error('远端密码库文件无效。')
          return true
        }).catch(error => {
          if (error.code === 'ENOENT') return false
          throw error
        })
        if (remoteVaultExists && settings.lastCommit !== head) {
          throw new Error('远端密码库已有更新，请先拉取并导入，再重新推送。')
        }
        if (!remoteVaultExists && settings.lastCommit) {
          throw new Error('远端密码库已被删除或仓库已更换，请检查仓库后重新配置。')
        }
        const branch = await runGit(['-C', clonePath, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { env })
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) throw new Error('远端分支名称无效。')
        await fs.writeFile(path.join(clonePath, VAULT_FILE), JSON.stringify(envelope, null, 2), 'utf8')
        await runGit(['-C', clonePath, 'add', '--', VAULT_FILE], { env })
        const changes = await runGit(['-C', clonePath, 'status', '--porcelain', '--', VAULT_FILE], { env })
        if (changes) {
          await runGit(['-C', clonePath, '-c', 'user.name=SafeVault', '-c', 'user.email=safevault@local.invalid', '-c', 'core.hooksPath=NUL', 'commit', '-m', '更新加密密码库', '--', VAULT_FILE], { env })
          await runGit(['-C', clonePath, 'push', 'origin', `HEAD:refs/heads/${branch}`], { env })
        }
        const commit = await runGit(['-C', clonePath, 'rev-parse', 'HEAD'], { env })
        await writeSettings({ ...settings, lastCommit: commit })
        return { success: true, unchanged: !changes }
      })
    } catch (error) { return { success: false, error: error.message } }
  }

  async function writeEncryptedFile(file, data) {
    const envelope = await vault.encrypt(data)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(`${file}.tmp`, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 })
    // 回读验证后替换，快照或基线落盘失败不能继续写入用户数据。
    const verified = await vault.decrypt(JSON.parse(await fs.readFile(`${file}.tmp`, 'utf8')))
    if (!contentEqual(verified, data)) throw new Error('同步备份回读验证失败。')
    await fs.rename(`${file}.tmp`, file)
  }

  async function readBaseline(remoteUrl) {
    try {
      const data = await vault.decrypt(JSON.parse(await fs.readFile(baselineFile, 'utf8')))
      return data.remoteUrl === remoteUrl ? data : null
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw new Error(`同步基线读取失败，已停止同步：${error.message}`)
    }
  }

  async function snapshot(data, reason) {
    const id = `${Date.now()}-${randomUUID()}.json`
    await writeEncryptedFile(path.join(snapshotsPath, id), { data, reason, createdAt: new Date().toISOString() })
    return id
  }

  function cancelSync() {
    generation++
    pendingSync = null
    pendingPull = null
    return { success: true }
  }

  // 准备阶段只读取和计算，不写本地数据、不推进基线，取消冲突处理不会改变数据。
  async function prepareSync({ mode = 'sync', password, importData } = {}) {
    const ticket = ++generation
    pendingSync = null
    try {
      if (!vault || !['sync', 'pull', 'push', 'import'].includes(mode)) throw new Error('同步方式无效。')
      const local = structuredClone(await vault.getData())
      let state
      if (mode === 'import') {
        if (!importData) throw new Error('没有可导入的数据。')
        state = { remote: { ...normalizeData(importData), syncTombstones: [] }, base: null, head: null }
      } else {
        state = await withClone(async ({ settings, clonePath, head }) => {
          const base = await readBaseline(settings.remoteUrl)
          let envelope
          try {
            const file = path.join(clonePath, VAULT_FILE)
            if (!(await fs.lstat(file)).isFile()) throw new Error('远端密码库文件无效。')
            envelope = JSON.parse(await fs.readFile(file, 'utf8'))
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
            if (base) throw new Error('远端密码库已被删除，请核对仓库后再同步。')
          }
          let remote = null
          if (envelope) {
            if (!isVaultEnvelope(envelope)) throw new Error('远端不是有效的加密密码库。')
            try { remote = normalizeData(await vault.decrypt(envelope)) } catch {
              if (!password) {
                const error = new Error('远端密码库无法用当前主密码解密，请输入远端主密码。')
                error.needsPassword = true
                throw error
              }
              remote = normalizeData(await decryptVault(envelope, password))
            }
          }
          if (mode === 'pull' && !remote) throw new Error('远端还没有密码库，请先上传。')
          if (mode === 'push' && remote && base?.commit !== head) throw new Error('远端版本尚未合并，请使用“立即同步”。')
          return { remote, base, head, remoteUrl: settings.remoteUrl }
        })
      }
      if (ticket !== generation) throw new Error('同步已取消或密码库已锁定。')
      if (!contentEqual(local, await vault.getData())) throw new Error('本地数据已变化，请重新同步。')
      const remote = state.remote || { tabs: [], notepads: [] }
      const result = mode === 'push' ? mergeVaultWriteData(local, remote, state.base?.data) : mergeVaultData(local, remote, state.base?.data)
      const token = randomUUID()
      pendingSync = { ...state, local, mode, token, generation: ticket, remote }
      return { success: true, token, conflicts: result.conflicts, stats: result.stats }
    } catch (error) { return { success: false, error: error.message, needsPassword: Boolean(error.needsPassword) } }
  }

  async function completeSync(token, resolutions = {}) {
    const pending = pendingSync
    try {
      if (!pending || pending.token !== token || pending.generation !== generation) throw new Error('同步已取消或过期，请重新同步。')
      if (!contentEqual(await vault.getData(), pending.local)) throw new Error('本地数据已变化，已停止覆盖，请重新同步。')
      const result = pending.mode === 'push' ? mergeVaultWriteData(pending.local, pending.remote, pending.base?.data)
        : mergeVaultData(pending.local, pending.remote, pending.base?.data, resolutions)
      if (result.conflicts.length) return { success: false, error: '请先处理所有冲突。', conflicts: result.conflicts }
      const merged = normalizeData(result.data)
      const saveLocal = async () => {
        if (pending.generation !== generation) throw new Error('同步已取消或密码库已锁定。')
        if (!contentEqual(merged, pending.local)) {
          await snapshot(pending.local, pending.mode === 'import' ? '文件导入前' : 'Git 同步前')
          if (pending.generation !== generation) throw new Error('同步已取消或密码库已锁定。')
          if (!contentEqual(await vault.getData(), pending.local)) throw new Error('本地数据已变化，已停止覆盖。')
          const saved = await vault.saveData(merged)
          if (!saved.success) throw new Error(saved.error || '本地数据保存失败。')
        }
      }
      let uploaded = false
      if (pending.mode === 'import') await saveLocal()
      else await withClone(async ({ settings, clonePath, env, head }) => {
        if (settings.remoteUrl !== pending.remoteUrl || head !== pending.head) {
          throw new Error('远端已再次更新，请重新同步；本次未覆盖本地或远端数据。')
        }
        await saveLocal()
        let commit = head
        if (pending.mode !== 'pull' && !contentEqual(syncContent(merged), syncContent(pending.remote))) {
          const envelope = await vault.encrypt(merged)
          const branch = await runGit(['-C', clonePath, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { env })
          if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) throw new Error('远端分支名称无效。')
          await fs.writeFile(path.join(clonePath, VAULT_FILE), JSON.stringify(envelope, null, 2), 'utf8')
          await runGit(['-C', clonePath, 'add', '--', VAULT_FILE], { env })
          await runGit(['-C', clonePath, '-c', 'user.name=SafeVault', '-c', 'user.email=safevault@local.invalid', '-c', 'core.hooksPath=NUL', 'commit', '-m', '同步加密密码库', '--', VAULT_FILE], { env })
          // 普通 push 会拒绝并发产生的非快进提交；失败时保留已合并的本地数据和旧基线。
          if (pending.generation !== generation) throw new Error('同步已取消或密码库已锁定，未开始上传。')
          await runGit(['-C', clonePath, 'push', 'origin', `HEAD:refs/heads/${branch}`], { env })
          commit = await runGit(['-C', clonePath, 'rev-parse', 'HEAD'], { env })
          uploaded = true
        }
        if (pending.generation !== generation) throw new Error('密码库已锁定，请解锁后重新检查同步状态。')
        await writeEncryptedFile(baselineFile, { remoteUrl: settings.remoteUrl, commit,
          data: pending.mode === 'pull' ? pending.remote : merged })
        await writeSettings({ ...settings, lastCommit: commit, lastSyncAt: new Date().toISOString() })
      })
      pendingSync = null
      return { success: true, data: merged, stats: result.stats, uploaded, mode: pending.mode }
    } catch (error) {
      pendingSync = null
      // 上传或基线保存失败后，把真正已落盘的数据返还界面，避免旧快照再次自动保存。
      let data
      try { data = await vault.getData() } catch {}
      return { success: false, error: error.message, data }
    }
  }

  // 当前页签和主题留在本机；修改时间和加密随机数不能造成重复上传。
  function syncContent(data) {
    const { theme, activeNotepadId, ...content } = data
    const strip = value => {
      if (Array.isArray(value)) return value.map(strip)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).filter(([key]) => !['createdAt', 'updatedAt', 'deletedAt'].includes(key)).map(([key, item]) => [key, strip(item)]))
    }
    return strip(content)
  }

  async function listSnapshots() {
    try {
      const files = await fs.readdir(snapshotsPath).catch(error => { if (error.code === 'ENOENT') return []; throw error })
      return { success: true, snapshots: files.filter(id => /^\d+-[a-f0-9-]+\.json$/.test(id)).sort().reverse().map(id => ({ id, createdAt: new Date(Number(id.split('-')[0])).toISOString() })) }
    } catch (error) { return { success: false, error: error.message } }
  }

  async function restoreSnapshot(id) {
    const ticket = generation
    try {
      if (typeof id !== 'string' || !/^\d+-[a-f0-9-]+\.json$/.test(id)) throw new Error('备份编号无效。')
      const previous = await vault.decrypt(JSON.parse(await fs.readFile(path.join(snapshotsPath, id), 'utf8')))
      const current = await vault.getData()
      await snapshot(current, '恢复备份前')
      if (ticket !== generation) throw new Error('恢复已取消或密码库已锁定。')
      if (!contentEqual(current, await vault.getData())) throw new Error('本地数据已变化，已停止恢复。')
      const restored = normalizeData(previous.data)
      const result = await vault.saveData(restored)
      if (!result.success) throw new Error(result.error)
      cancelSync()
      return { success: true, data: result.data }
    } catch (error) { return { success: false, error: error.message } }
  }

  return { getSettings, saveSettings, testConnection, pull, confirmPull, push,
    prepareSync, completeSync, cancelSync, listSnapshots, restoreSnapshot, backupData: snapshot }
}

module.exports = { createGitSyncManager, validateRemoteUrl }
