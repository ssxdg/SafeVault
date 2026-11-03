const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { decryptVault, isVaultEnvelope } = require('./vaultCrypto')
const { normalizeData } = require('./dataNormalizer')

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

function createGitSyncManager({ userDataPath, safeStorage, allowLocalRemote = false } = {}) {
  const settingsFile = path.join(userDataPath, 'git_sync_settings.json')
  // 远端提交必须在界面完成合并、写盘后才可成为新的同步基线。
  let pendingPull = null

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
      await runGit(['-c', 'credential.helper=', 'clone', '--no-tags', '--', settings.remoteUrl, clonePath], { env })
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

  return { getSettings, saveSettings, testConnection, pull, confirmPull, push }
}

module.exports = { createGitSyncManager, validateRemoteUrl }
