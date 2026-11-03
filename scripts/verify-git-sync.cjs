const assert = require('assert')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { createGitSyncManager, validateRemoteUrl } = require('../electron/gitSyncManager')
const { encryptVault } = require('../electron/vaultCrypto')

async function main() {
  assert.throws(() => validateRemoteUrl('file:///tmp/vault'), /无效|HTTPS|SSH/)
  assert.throws(() => validateRemoteUrl('https://user:secret@example.com/vault.git'), /凭据/)
  assert.equal(validateRemoteUrl('git@example.com:user/vault.git'), 'ssh')

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safevault-git-test-'))
  const remote = path.join(root, 'remote.git')
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  const initial = path.join(root, 'initial')
  execFileSync('git', ['clone', remote, initial], { stdio: 'ignore' })
  await fs.writeFile(path.join(initial, 'README.md'), 'private repository')
  execFileSync('git', ['-C', initial, 'add', 'README.md'])
  execFileSync('git', ['-C', initial, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial'])
  execFileSync('git', ['-C', initial, 'push', 'origin', 'HEAD'], { stdio: 'ignore' })
  const encrypted = await encryptVault({ tabs: [{ name: '测试', accounts: [], urls: [] }] }, 'test-password')
  const storage = {
    encryptString: value => Buffer.from(`cipher:${value}`),
    decryptString: value => value.toString().slice(7),
    isEncryptionAvailable: () => true,
  }
  const manager = createGitSyncManager({
    userDataPath: path.join(root, 'app'),
    safeStorage: storage,
    allowLocalRemote: true,
  })
  try {
    const httpsManager = createGitSyncManager({ userDataPath: path.join(root, 'https-app'), safeStorage: storage })
    assert.equal((await httpsManager.saveSettings({ remoteUrl: 'https://example.com/private.git', authMode: 'https', username: 'tester', credential: 'dummy-token' })).success, true)
    assert.equal((await httpsManager.getSettings()).hasCredential, true)
    assert.equal((await httpsManager.saveSettings({ remoteUrl: 'https://example.com/private.git', authMode: 'https', username: 'tester' })).success, true)
    assert.equal((await httpsManager.saveSettings({ remoteUrl: 'https://example.com/other.git', authMode: 'https', username: 'tester' })).success, false)

    if (process.platform === 'win32') {
      const askpass = path.join(root, 'askpass.cmd')
      await fs.writeFile(askpass, '@echo off\r\n"%SAFEVAULT_ELECTRON_EXE%" "%SAFEVAULT_ASKPASS_SCRIPT%" "%~1"\r\n')
      const auth = spawnSync('git', ['-c', 'credential.helper=', 'credential', 'fill'], {
        input: 'protocol=https\nhost=example.com\n\n',
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: askpass,
          SAFEVAULT_ELECTRON_EXE: process.execPath,
          SAFEVAULT_ASKPASS_SCRIPT: path.join(__dirname, '../electron/gitAskpass.js'),
          SAFEVAULT_GIT_USERNAME: 'tester',
          SAFEVAULT_GIT_SECRET: 'dummy-token',
        },
      })
      assert.equal(auth.status, 0, auth.stderr)
      assert.match(auth.stdout, /username=tester/)
      assert.match(auth.stdout, /password=dummy-token/)
    }

    assert.equal((await manager.saveSettings({ remoteUrl: remote, authMode: 'ssh' })).success, true)
    const emptyConnection = await manager.testConnection()
    assert.equal(emptyConnection.success, true)
    assert.equal(emptyConnection.hasVault, false)
    assert.equal((await manager.push(encrypted)).success, true)
    const vaultConnection = await manager.testConnection()
    assert.equal(vaultConnection.success, true)
    assert.equal(vaultConnection.hasVault, true)
    const missingManager = createGitSyncManager({ userDataPath: path.join(root, 'missing-app'), safeStorage: storage, allowLocalRemote: true })
    assert.equal((await missingManager.saveSettings({ remoteUrl: path.join(root, 'missing.git'), authMode: 'ssh' })).success, true)
    assert.equal((await missingManager.testConnection()).success, false)
    const secondDevice = createGitSyncManager({ userDataPath: path.join(root, 'second-app'), safeStorage: storage, allowLocalRemote: true })
    assert.equal((await secondDevice.saveSettings({ remoteUrl: remote, authMode: 'ssh' })).success, true)
    assert.match((await secondDevice.push(encrypted)).error, /拉取/)
    assert.equal((await secondDevice.pull('wrong-password')).success, false)
    const secondPull = await secondDevice.pull('test-password')
    assert.equal(secondPull.success, true)
    assert.equal(secondPull.data.tabs[0].name, '测试')
    assert.equal((await secondDevice.confirmPull(secondPull.commit)).success, true)
    assert.equal((await secondDevice.push(encrypted)).success, true)
    const pulled = await manager.pull('test-password')
    assert.equal(pulled.success, true)
    assert.equal(pulled.unchanged, true)

    const other = path.join(root, 'other')
    execFileSync('git', ['clone', remote, other], { stdio: 'ignore' })
    await fs.writeFile(path.join(other, 'safe_vault.json'), JSON.stringify(await encryptVault({ tabs: [] }, 'test-password')))
    execFileSync('git', ['-C', other, 'add', 'safe_vault.json'])
    execFileSync('git', ['-C', other, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'other'])
    execFileSync('git', ['-C', other, 'push', 'origin', 'HEAD'], { stdio: 'ignore' })
    const conflict = await manager.push(encrypted)
    assert.equal(conflict.success, false)
    assert.match(conflict.error, /拉取/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
  console.log('Git 同步验证通过')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
