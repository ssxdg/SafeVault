const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { decideSync } = require('../electron/oneDriveSync')
const { createFileManager } = require('../electron/fileManager')
const { encryptVault } = require('../electron/vaultCrypto')

const base = { localHash: 'local', syncedHash: 'local', remoteEtag: 'v1', storedEtag: 'v1', remoteHash: '', hasRemote: true }

// 同步决策必须保留两端修改；云端消失也不能当作首次上传自动覆盖。
assert.equal(decideSync(base), 'synced')
assert.equal(decideSync({ ...base, localHash: 'new-local' }), 'upload')
assert.equal(decideSync({ ...base, remoteEtag: 'v2', remoteHash: 'remote' }), 'remote-newer')
assert.equal(decideSync({ ...base, localHash: 'new-local', remoteEtag: 'v2', remoteHash: 'remote' }), 'conflict')
assert.equal(decideSync({ ...base, remoteEtag: 'v2', remoteHash: 'local' }), 'synced')
assert.equal(decideSync({ ...base, hasRemote: false }), 'conflict')
assert.equal(decideSync({ ...base, hasRemote: false, syncedHash: '' }), 'initial-upload')
assert.equal(decideSync({ ...base, syncedHash: '', remoteHash: 'remote' }), 'conflict')

async function verifyRestore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-vault-cloud-'))
  const dataFile = path.join(directory, 'safe_vault.json')
  try {
    const manager = createFileManager({ dataFile })
    assert.equal((await manager.createVault('local-password')).success, true)
    const original = await fs.readFile(dataFile, 'utf8')
    const remote = await encryptVault({ tabs: [], notepads: [] }, 'cloud-password')
    await assert.rejects(manager.installEncryptedEnvelope(remote, 'wrong-password'))
    assert.equal(await fs.readFile(dataFile, 'utf8'), original)
    await manager.installEncryptedEnvelope(remote, 'cloud-password')
    assert.deepEqual(await manager.readEncryptedEnvelope(), remote)
    const backups = (await fs.readdir(directory)).filter(name => name.endsWith('.bak'))
    assert.equal(backups.length, 1)
    assert.equal(await fs.readFile(path.join(directory, backups[0]), 'utf8'), original)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

verifyRestore().then(() => console.log('OneDrive 同步决策与本地恢复检查通过')).catch(error => {
  console.error(error)
  process.exitCode = 1
})
