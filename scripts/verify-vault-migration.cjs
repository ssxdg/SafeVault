const assert = require('assert')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { createFileManager } = require('../electron/fileManager')
const { encryptVault, decryptVault, isVaultEnvelope } = require('../electron/vaultCrypto')

const PASSWORD = 'migration-master-password'

function createLegacyData(secret = 'Legacy-Secret-123') {
  return {
    schemaVersion: 2,
    theme: 'secure',
    tabs: [{
      id: 'legacy-tab',
      name: 'Legacy',
      accounts: [{
        id: 'legacy-account',
        accountName: 'Legacy Account',
        username: 'legacy-user',
        password: secret,
        loginUrl: 'https://login.example.com/sign-in',
      }],
      urls: [],
    }],
    notepads: [{ id: 'legacy-note', name: 'Legacy Note', content: 'hello', createdAt: '', updatedAt: '' }],
    activeNotepadId: 'legacy-note',
  }
}

async function withTempVault(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-vault-migration-'))
  const dataFile = path.join(directory, 'safe_vault.json')
  try {
    await run({ directory, dataFile })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

async function verifyFirstInstall() {
  await withTempVault(async ({ dataFile }) => {
    const manager = createFileManager({ dataFile })
    assert.deepStrictEqual(await manager.inspectVault(), { state: 'missing' })

    const created = await manager.createVault(PASSWORD)
    assert.strictEqual(created.success, true)
    assert.strictEqual(created.data.schemaVersion, 3)
    assert.strictEqual(Array.isArray(created.data.tabs), true)

    const raw = await fs.readFile(dataFile, 'utf8')
    const envelope = JSON.parse(raw)
    assert.strictEqual(isVaultEnvelope(envelope), true)
    assert.strictEqual(raw.includes(PASSWORD), false)

    manager.lockVault()
    const lockedWrite = await manager.writeEncryptedData(created.data)
    assert.strictEqual(lockedWrite.success, false)
    assert.match(lockedWrite.error, /密码库尚未解锁/)
  })
}

async function verifyPlaintextMigration() {
  await withTempVault(async ({ dataFile }) => {
    const legacyData = createLegacyData()
    const original = JSON.stringify(legacyData, null, 2)
    await fs.writeFile(dataFile, original, 'utf8')

    const manager = createFileManager({ dataFile })
    assert.deepStrictEqual(await manager.inspectVault(), { state: 'plaintext', schemaVersion: 2 })

    const migrated = await manager.migratePlaintextVault(PASSWORD)
    assert.strictEqual(migrated.success, true)
    assert.strictEqual(migrated.data.schemaVersion, 3)
    assert.strictEqual(migrated.data.tabs[0].accounts[0].loginTargets[0].origin, 'https://login.example.com')

    const encryptedRaw = await fs.readFile(dataFile, 'utf8')
    const envelope = JSON.parse(encryptedRaw)
    assert.strictEqual(isVaultEnvelope(envelope), true)
    assert.strictEqual(encryptedRaw.includes('Legacy-Secret-123'), false)
    const decrypted = await decryptVault(envelope, PASSWORD)
    assert.strictEqual(decrypted.schemaVersion, 3)
    assert.strictEqual(decrypted.tabs[0].accounts[0].password, 'Legacy-Secret-123')
    await assert.rejects(
      () => fs.readFile(`${dataFile}.pre-encryption-backup`, 'utf8'),
      error => error.code === 'ENOENT',
    )
  })
}

async function verifyEncryptedUnlockFailures() {
  await withTempVault(async ({ dataFile }) => {
    const envelope = await encryptVault(createLegacyData('Encrypted-Secret-456'), PASSWORD)
    await fs.writeFile(dataFile, JSON.stringify(envelope, null, 2), 'utf8')

    const manager = createFileManager({ dataFile })
    const inspected = await manager.inspectVault()
    assert.strictEqual(inspected.state, 'locked')
    assert.strictEqual(isVaultEnvelope(inspected.envelope), true)

    const wrongPassword = await manager.unlockVault('wrong-password')
    assert.strictEqual(wrongPassword.success, false)
    assert.match(wrongPassword.error, /密码库损坏或主密码错误/)

    const unlocked = await manager.unlockVault(PASSWORD)
    assert.strictEqual(unlocked.success, true)
    assert.strictEqual(unlocked.data.schemaVersion, 3)
    assert.strictEqual(unlocked.data.tabs[0].accounts[0].password, 'Encrypted-Secret-456')

    const tamperedBytes = Buffer.from(envelope.ciphertext, 'base64')
    tamperedBytes[0] ^= 0xff
    envelope.ciphertext = tamperedBytes.toString('base64')
    await fs.writeFile(dataFile, JSON.stringify(envelope, null, 2), 'utf8')

    const tamperedManager = createFileManager({ dataFile })
    assert.strictEqual((await tamperedManager.inspectVault()).state, 'locked')
    const tampered = await tamperedManager.unlockVault(PASSWORD)
    assert.strictEqual(tampered.success, false)
    assert.match(tampered.error, /密码库损坏或主密码错误/)
  })
}

async function verifyCorruptFilesAreWriteProtected() {
  await withTempVault(async ({ dataFile }) => {
    const invalidJson = '{"schemaVersion": 2, invalid'
    await fs.writeFile(dataFile, invalidJson, 'utf8')

    const manager = createFileManager({ dataFile })
    const inspected = await manager.inspectVault()
    assert.strictEqual(inspected.state, 'corrupt')
    assert.match(inspected.error, /无法解析/)

    const writeResult = await manager.writeEncryptedData(createLegacyData())
    assert.strictEqual(writeResult.success, false)
    assert.strictEqual(await fs.readFile(dataFile, 'utf8'), invalidJson)
  })

  await withTempVault(async ({ dataFile }) => {
    const envelope = await encryptVault(createLegacyData(), PASSWORD)
    await fs.writeFile(dataFile, JSON.stringify(envelope), 'utf8')
    const manager = createFileManager({ dataFile })
    assert.strictEqual((await manager.unlockVault(PASSWORD)).success, true)

    const corruptAfterUnlock = '{broken-after-unlock'
    await fs.writeFile(dataFile, corruptAfterUnlock, 'utf8')
    const writeResult = await manager.writeEncryptedData(createLegacyData('New-Secret'))
    assert.strictEqual(writeResult.success, false)
    assert.match(writeResult.error, /损坏/)
    assert.strictEqual(await fs.readFile(dataFile, 'utf8'), corruptAfterUnlock)
  })
}

async function verifyMigrationWriteFailurePreservesSource() {
  await withTempVault(async ({ dataFile }) => {
    const original = JSON.stringify(createLegacyData(), null, 2)
    await fs.writeFile(dataFile, original, 'utf8')
    const failingFs = {
      ...fs,
      rename: async () => {
        throw new Error('simulated rename failure')
      },
    }
    const manager = createFileManager({ dataFile, fsApi: failingFs })

    const result = await manager.migratePlaintextVault(PASSWORD)
    assert.strictEqual(result.success, false)
    assert.match(result.error, /simulated rename failure/)
    assert.strictEqual(await fs.readFile(dataFile, 'utf8'), original)
    assert.strictEqual(await fs.readFile(`${dataFile}.pre-encryption-backup`, 'utf8'), original)

    const temporaryEnvelope = JSON.parse(await fs.readFile(`${dataFile}.tmp`, 'utf8'))
    assert.strictEqual(isVaultEnvelope(temporaryEnvelope), true)
  })
}

async function verifyTemporaryFileRecoveryBoundary() {
  await withTempVault(async ({ dataFile }) => {
    await fs.writeFile(`${dataFile}.tmp`, '{unfinished', 'utf8')
    const manager = createFileManager({ dataFile })
    const inspected = await manager.inspectVault()
    assert.strictEqual(inspected.state, 'corrupt')
    assert.match(inspected.error, /临时文件/)
  })

  await withTempVault(async ({ dataFile }) => {
    const original = JSON.stringify(createLegacyData())
    await fs.writeFile(dataFile, original, 'utf8')
    await fs.writeFile(`${dataFile}.tmp`, '{stale', 'utf8')
    const manager = createFileManager({ dataFile })
    assert.deepStrictEqual(await manager.inspectVault(), { state: 'plaintext', schemaVersion: 2 })
    assert.strictEqual(await fs.readFile(dataFile, 'utf8'), original)
  })
}

async function verifyEncryptedBackupAndDangerousPlaintextExport() {
  await withTempVault(async ({ directory, dataFile }) => {
    const encryptedBackup = path.join(directory, 'backup.safevault.json')
    const plaintextBackup = path.join(directory, 'dangerous-plaintext.json')
    let savePath = encryptedBackup
    const dialogApi = {
      showSaveDialog: async () => ({ canceled: false, filePath: savePath }),
      showOpenDialog: async () => ({ canceled: false, filePaths: [encryptedBackup] }),
    }
    const manager = createFileManager({ dataFile, dialogApi })
    const created = await manager.createVault(PASSWORD)
    created.data.tabs[0].accounts.push({
      id: 'backup-account',
      accountName: 'Backup Account',
      username: 'backup-user',
      password: 'Backup-Secret-789',
      loginTargets: [],
    })
    assert.strictEqual((await manager.writeEncryptedData(created.data)).success, true)

    assert.strictEqual((await manager.exportEncryptedVault(null)).success, true)
    const backupRaw = await fs.readFile(encryptedBackup, 'utf8')
    assert.strictEqual(isVaultEnvelope(JSON.parse(backupRaw)), true)
    assert.strictEqual(backupRaw.includes('Backup-Secret-789'), false)

    const wrongImport = await manager.importEncryptedVault(null, 'wrong-password')
    assert.strictEqual(wrongImport.success, false)
    assert.match(wrongImport.error, /密码库损坏或主密码错误/)
    const imported = await manager.importEncryptedVault(null, PASSWORD)
    assert.strictEqual(imported.success, true)
    assert.strictEqual(imported.data.tabs[0].accounts[0].password, 'Backup-Secret-789')

    savePath = plaintextBackup
    const wrongPlaintext = await manager.exportPlaintextVault(null, 'wrong-password')
    assert.strictEqual(wrongPlaintext.success, false)
    await assert.rejects(() => fs.readFile(plaintextBackup, 'utf8'), error => error.code === 'ENOENT')
    assert.strictEqual((await manager.exportPlaintextVault(null, PASSWORD)).success, true)
    const plaintextRaw = await fs.readFile(plaintextBackup, 'utf8')
    assert.strictEqual(plaintextRaw.includes('Backup-Secret-789'), true)
  })
}

async function main() {
  await verifyFirstInstall()
  await verifyPlaintextMigration()
  await verifyEncryptedUnlockFailures()
  await verifyCorruptFilesAreWriteProtected()
  await verifyMigrationWriteFailurePreservesSource()
  await verifyTemporaryFileRecoveryBoundary()
  await verifyEncryptedBackupAndDangerousPlaintextExport()
  console.log('vault migration verification passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
