const assert = require('assert')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { createGitSyncManager, validateRemoteUrl } = require('../electron/gitSyncManager')
const { encryptVault } = require('../electron/vaultCrypto')
const { mergeVaultData, mergeVaultWriteData, getWriteSnapshots, contentEqual } = require('../electron/vaultMerge')
const { createFileManager } = require('../electron/fileManager')
const { normalizeData } = require('../electron/dataNormalizer')

// 覆盖真实丢数据场景：同名不同正文、独立修改、删除后旧设备上线及冲突取消。
function verifyMerge() {
  const note = (id, text, name = '待办') => ({ id, name, content: { ops: [{ insert: `${text}\n` }] } })
  const vault = notes => ({ schemaVersion: 3, theme: 'secure', tabs: [{ id: 'default-tab', name: '默认', accounts: [], urls: [] }], notepads: notes, activeNotepadId: notes[0]?.id })
  const base = vault([note('n1', '原文')])
  assert(contentEqual({ b: 2, a: 1 }, { a: 1, b: 2 }))
  const same = mergeVaultData(base, vault([{ ...note('n1', '原文'), updatedAt: 'different' }]), base)
  assert.equal(same.conflicts.length, 0)
  assert.equal(same.stats.skipped, 2)
  const changed = vault([note('n1', '本地新增内容')])
  const conflict = mergeVaultData(changed, base, base)
  assert.equal(conflict.conflicts.length, 1)
  assert.equal(conflict.data.notepads[0].content.ops[0].insert, '本地新增内容\n')
  const key = conflict.conflicts[0].key
  const both = mergeVaultData(changed, base, base, { [key]: { choice: 'both' } })
  assert.equal(both.conflicts.length, 0)
  assert.equal(both.data.notepads.length, 2)
  assert.notEqual(both.data.notepads[0].id, both.data.notepads[1].id)
  assert.equal(mergeVaultData(changed, base, base, { [key]: { choice: 'remote' } }).data.notepads[0].content.ops[0].insert, '原文\n')
  assert.equal(mergeVaultData(vault([note('old', '相同')]), vault([note('new', '相同')])).data.notepads.length, 1)
  assert.equal(mergeVaultData(vault([note('old', '甲')]), vault([note('new', '乙')])).conflicts.length, 1)
  const legacyIds = mergeVaultData(vault([note('legacy-local', '新内容')]), base, base)
  assert.equal(legacyIds.conflicts.length, 1)
  assert.equal(legacyIds.data.notepads[0].id, 'n1')
  assert.equal(mergeVaultData(vault([note('a', '甲', '同名'), note('b', '乙', '同名')]), vault([note('c', '丙', '同名')])).data.notepads.length, 3)
  const deleted = mergeVaultData(vault([]), base, base)
  assert.equal(deleted.data.notepads.length, 0)
  assert(deleted.data.syncTombstones.some(item => item.id === 'n1'))
  assert.equal(mergeVaultData(deleted.data, base).data.notepads.length, 0)
  assert.equal(mergeVaultData(vault([]), changed, base).conflicts.length, 1)
  const local = structuredClone(base)
  const remote = structuredClone(base)
  base.tabs[0].accounts = [{ id: 'a1', accountName: '网站', username: '用户', password: '原密码', note: '原备注' }]
  local.tabs[0].accounts = [{ ...base.tabs[0].accounts[0], password: '新密码' }]
  remote.tabs[0].accounts = [{ ...base.tabs[0].accounts[0], note: '新备注' }]
  const merged = mergeVaultData(local, remote, base)
  assert.equal(merged.conflicts.length, 0)
  assert.equal(merged.data.tabs[0].accounts[0].password, '新密码')
  assert.equal(merged.data.tabs[0].accounts[0].note, '新备注')
  assert.equal(local.tabs[0].accounts[0].note, '原备注')
  remote.tabs[0].accounts[0].password = '另一密码'
  assert.equal(mergeVaultData(local, remote, base).conflicts.length, 1)
  assert.equal(contentEqual(note('n', '正文').content, { ops: [{ insert: '正文\n', attributes: { bold: true } }] }), false)
  const changedAccountId = structuredClone(remote)
  changedAccountId.tabs[0].accounts[0].id = 'legacy-account-id'
  changedAccountId.tabs[0].accounts[0].username = '新用户名'
  assert.equal(mergeVaultData(local, changedAccountId).conflicts.length, 1)
  // 插件先改密码，随后到达的旧界面快照只能修改用户真正编辑过的备注。
  const queuedBase = structuredClone(base)
  const pluginData = structuredClone(base)
  pluginData.tabs[0].accounts[0].password = '插件新密码'
  const queuedEditor = structuredClone(base)
  queuedEditor.tabs[0].accounts[0].note = '编辑器新备注'
  queuedEditor.notepads[0].content = { ops: [{ insert: '同时编辑的笔记\n' }] }
  const queued = mergeVaultWriteData(queuedEditor, pluginData, queuedBase)
  const legacyPreload = data => getWriteSnapshots(data)
  const legacyRequest = legacyPreload({ ...queuedEditor, __saveBase: queuedBase }, queuedBase)
  assert(contentEqual(legacyRequest.base, queuedBase))
  assert(contentEqual(legacyRequest.data, queuedEditor))
  assert.equal(Object.hasOwn(legacyRequest.data, '__saveBase'), false)
  assert.equal(queued.conflicts.length, 0)
  assert.equal(queued.data.tabs[0].accounts[0].password, '插件新密码')
  assert.equal(queued.data.tabs[0].accounts[0].note, '编辑器新备注')
  assert.equal(queued.data.notepads[0].content.ops[0].insert, '同时编辑的笔记\n')
  queuedEditor.tabs[0].accounts[0].password = '编辑器新密码'
  assert.equal(mergeVaultWriteData(queuedEditor, pluginData, queuedBase).conflicts.length, 1)
  const duplicateNotes = vault([note('duplicate', '甲', '笔记甲'), note('duplicate', '乙', '笔记乙')])
  const duplicateOriginal = JSON.stringify(duplicateNotes)
  const duplicateMerge = mergeVaultData(duplicateNotes, structuredClone(duplicateNotes))
  assert.equal(duplicateMerge.conflicts.length, 0)
  assert.equal(duplicateMerge.data.notepads.length, 2)
  assert.equal(new Set(duplicateMerge.data.notepads.map(item => item.id)).size, 2)
  assert.equal(JSON.stringify(duplicateNotes), duplicateOriginal)
  const repeatedDuplicateMerge = mergeVaultData(duplicateMerge.data, duplicateNotes, duplicateMerge.data)
  assert.equal(repeatedDuplicateMerge.conflicts.length, 0)
  assert.equal(repeatedDuplicateMerge.data.notepads.length, 2)
  assert(contentEqual(repeatedDuplicateMerge.data.notepads, duplicateMerge.data.notepads))
  const changedDuplicate = structuredClone(duplicateNotes)
  changedDuplicate.notepads[1].content = { ops: [{ insert: '新增内容\n' }] }
  assert.equal(mergeVaultData(duplicateMerge.data, changedDuplicate, duplicateMerge.data).conflicts.length, 1)
}

async function verifySafeSync(root, storage) {
  const remote = path.join(root, 'safe-sync.git')
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  const seed = normalizeData({ tabs: [], notepads: [{ id: 'n1', name: '待办', content: '原文' }] })
  async function device(name, data, password = 'test-password') {
    const userDataPath = path.join(root, name)
    await fs.mkdir(userDataPath)
    const files = createFileManager({ dataFile: path.join(userDataPath, 'safe_vault.json') })
    assert.equal((await files.createVault(password)).success, true)
    let current = (await files.writeEncryptedData(data)).data
    const vault = {
      getData: async () => structuredClone(current),
      saveData: async value => { const result = await files.writeEncryptedData(value); if (result.success) current = result.data; return result },
      encrypt: files.encryptSessionData, decrypt: files.decryptSessionData,
    }
    const manager = createGitSyncManager({ userDataPath, safeStorage: storage, allowLocalRemote: true, vault })
    await manager.saveSettings({ remoteUrl: remote, authMode: 'ssh' })
    return { manager, vault, files, userDataPath }
  }
  const a = await device('safe-a', seed)
  const first = await a.manager.prepareSync()
  assert.equal(first.success, true, first.error)
  assert.equal((await a.manager.completeSync(first.token)).success, true)
  const head = execFileSync('git', ['--git-dir', remote, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const same = await a.manager.prepareSync()
  assert.equal(same.conflicts.length, 0)
  const unchanged = await a.manager.completeSync(same.token)
  assert.equal(unchanged.success, true, unchanged.error)
  assert.equal(unchanged.uploaded, false)
  assert.equal(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), head)
  const b = await device('safe-b', seed)
  const baseline = await b.manager.prepareSync()
  assert.equal((await b.manager.completeSync(baseline.token)).success, true)
  const changed = await a.vault.getData()
  changed.notepads[0].content = { ops: [{ insert: '本地新内容\n', attributes: { bold: true } }] }
  await a.vault.saveData(changed)
  const preview = await a.manager.prepareSync()
  assert.equal(preview.conflicts.length, 1)
  a.manager.cancelSync()
  assert.equal((await a.manager.completeSync(preview.token)).success, false)
  assert.equal(contentEqual(await a.vault.getData(), normalizeData(changed)), true)
  const ready = await a.manager.prepareSync()
  const uploaded = await a.manager.completeSync(ready.token, { [ready.conflicts[0].key]: { choice: 'local' } })
  assert.equal(uploaded.success, true, uploaded.error)
  const pull = await b.manager.prepareSync({ mode: 'pull' })
  assert.equal(pull.conflicts.length, 1)
  const pulled = await b.manager.completeSync(pull.token, { [pull.conflicts[0].key]: { choice: 'remote' } })
  assert.equal(pulled.success, true, pulled.error)
  assert.equal(pulled.data.notepads[0].content.ops[0].insert, '本地新内容\n')
  const history = await b.manager.listSnapshots()
  assert(history.snapshots.length > 0)
  const raw = await fs.readFile(path.join(b.userDataPath, 'sync-snapshots', history.snapshots[0].id), 'utf8')
  assert.equal(raw.includes('原文'), false)
  const restored = await b.manager.restoreSnapshot(history.snapshots[0].id)
  assert.equal(restored.success, true, restored.error)
  assert.equal(restored.data.notepads[0].content.ops[0].insert, '原文\n')
  assert.equal((await b.manager.restoreSnapshot('../safe_vault.json')).success, false)
  const c = await device('safe-c', seed, 'different-password')
  assert.equal((await c.manager.prepareSync()).needsPassword, true)
  assert.equal((await c.manager.prepareSync({ password: 'wrong' })).success, false)
  const passwordPreview = await c.manager.prepareSync({ password: 'test-password' })
  assert.equal(passwordPreview.success, true, passwordPreview.error)
  c.manager.cancelSync()
  // 远端在预览之后变化，必须拒绝旧确认，不能覆盖任意一端。
  const stale = await b.manager.prepareSync()
  const newData = await a.vault.getData()
  newData.notepads.push({ id: 'n2', name: '新增', content: { ops: [{ insert: '新笔记\n' }] } })
  await a.vault.saveData(newData)
  const latest = await a.manager.prepareSync()
  const latestResult = await a.manager.completeSync(latest.token)
  assert.equal(latestResult.success, true, latestResult.error)
  const staleResult = await b.manager.completeSync(stale.token, Object.fromEntries(stale.conflicts.map(item => [item.key, { choice: 'local' }])))
  assert.equal(staleResult.success, false)
  assert.match(staleResult.error, /远端已再次更新/)
  const beforeImport = await b.vault.getData()
  const baselineRaw = await fs.readFile(path.join(b.userDataPath, 'git_sync_baseline.json'), 'utf8')
  const imported = await b.manager.prepareSync({ mode: 'import', importData: newData })
  const importedResult = await b.manager.completeSync(imported.token, Object.fromEntries(imported.conflicts.map(item => [item.key, { choice: 'both' }])))
  assert.equal(importedResult.success, true, importedResult.error)
  assert.equal(await fs.readFile(path.join(b.userDataPath, 'git_sync_baseline.json'), 'utf8'), baselineRaw)
  assert.equal(beforeImport.notepads.length, 1)
  const beforeCancel = await b.vault.getData()
  const cancelPreview = await b.manager.prepareSync({ mode: 'import', importData: { ...seed,
    notepads: [...seed.notepads, { id: 'cancel-test', name: '取消测试', content: { ops: [{ insert: '禁止写入\n' }] } }] } })
  const encrypt = b.vault.encrypt
  b.vault.encrypt = async data => { b.manager.cancelSync(); return await encrypt(data) }
  const cancelled = await b.manager.completeSync(cancelPreview.token, Object.fromEntries(cancelPreview.conflicts.map(item => [item.key, { choice: 'remote' }])))
  assert.equal(cancelled.success, false)
  assert(contentEqual(beforeCancel, await b.vault.getData()))
  const cancelRestore = await b.manager.restoreSnapshot(history.snapshots[0].id)
  assert.equal(cancelRestore.success, false)
  assert(contentEqual(beforeCancel, await b.vault.getData()))
  b.vault.encrypt = encrypt
  const uploadOnlyData = await a.vault.getData()
  uploadOnlyData.notepads[0].content = { ops: [{ insert: '仅上传的本地修改\n' }] }
  await a.vault.saveData(uploadOnlyData)
  const uploadOnly = await a.manager.prepareSync({ mode: 'push' })
  assert.equal(uploadOnly.success, true, uploadOnly.error)
  assert.equal(uploadOnly.conflicts.length, 0)
  assert.equal((await a.manager.completeSync(uploadOnly.token)).success, true)
  const beforeFailure = await b.vault.getData()
  const failurePreview = await b.manager.prepareSync({ mode: 'import', importData: { ...seed,
    notepads: [{ id: 'disk-failure', name: '写盘失败测试', content: { ops: [{ insert: '不可丢失\n' }] } }] } })
  const saveData = b.vault.saveData
  b.vault.saveData = async () => ({ success: false, error: '模拟磁盘写入失败' })
  const failed = await b.manager.completeSync(failurePreview.token)
  assert.equal(failed.success, false)
  assert.match(failed.error, /磁盘/)
  assert(contentEqual(beforeFailure, await b.vault.getData()))
  b.vault.saveData = saveData
  const lockWrite = a.files.writeEncryptedData({ ...uploadOnlyData, notepads: [] })
  a.files.lockVault()
  assert.equal((await a.files.unlockVault('test-password')).success, true)
  assert.equal((await lockWrite).success, false)
}

async function main() {
  verifyMerge()
  if (process.argv.includes('--merge-only')) {
    console.log('数据合并验证通过')
    return
  }
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
  // 远端保留未经新归一化处理的旧版重复 ID，用真实加密文件验证读取兼容。
  const encrypted = await encryptVault({ schemaVersion: 3, tabs: [
    { id: 'legacy-tab-a', name: '测试', accounts: [{ id: 'shared-account', accountName: '账号甲', password: '甲' }], urls: [] },
    { id: 'legacy-tab-b', name: '其他分类', accounts: [{ id: 'shared-account', accountName: '账号乙', password: '乙' }], urls: [] },
  ], notepads: [
    { id: 'shared-note', name: '笔记甲', content: '内容甲' }, { id: 'shared-note', name: '笔记乙', content: '内容乙' },
  ] }, 'test-password')
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
    await verifySafeSync(root, storage)
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
    assert.equal(new Set(secondPull.data.tabs.flatMap(tab => tab.accounts).map(item => item.id)).size, 2)
    assert.equal(new Set(secondPull.data.notepads.map(item => item.id)).size, 2)
    assert.deepEqual(secondPull.data.notepads.map(item => item.content.ops[0].insert), ['内容甲\n', '内容乙\n'])
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
