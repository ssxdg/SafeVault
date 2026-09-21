const assert = require('assert')
const {
  encryptVault,
  decryptVault,
  isVaultEnvelope,
} = require('../electron/vaultCrypto')

function tamperBase64(value) {
  const bytes = Buffer.from(value, 'base64')
  bytes[0] ^= 0xff
  return bytes.toString('base64')
}

async function main() {
  const password = 'master-password'
  const data = {
    schemaVersion: 3,
    tabs: [{
      id: 'personal',
      accounts: [{ id: 'account-1', username: 'safe-user', password: 'Known-Secret-123' }],
    }],
  }

  const first = await encryptVault(data, password)
  const second = await encryptVault(data, password)

  assert.strictEqual(isVaultEnvelope(first), true)
  assert.notStrictEqual(first.kdf.salt, second.kdf.salt)
  assert.notStrictEqual(first.cipher.iv, second.cipher.iv)
  assert.notStrictEqual(first.ciphertext, second.ciphertext)
  assert.deepStrictEqual(await decryptVault(first, password), data)
  assert.strictEqual(JSON.stringify(first).includes('Known-Secret-123'), false)

  await assert.rejects(
    () => decryptVault(first, 'wrong-password'),
    /密码库损坏或主密码错误/,
  )
  await assert.rejects(
    () => decryptVault({ ...first, ciphertext: tamperBase64(first.ciphertext) }, password),
    /密码库损坏或主密码错误/,
  )
  await assert.rejects(
    () => decryptVault({
      ...first,
      kdf: { ...first.kdf, cost: 1073741824 },
    }, password),
    /密码库格式无效/,
  )

  assert.strictEqual(isVaultEnvelope(null), false)
  assert.strictEqual(isVaultEnvelope({}), false)
  await assert.rejects(() => encryptVault(null, password), /密码库数据必须是对象/)
  await assert.rejects(() => encryptVault([], password), /密码库数据必须是对象/)
  await assert.rejects(() => encryptVault(data, ''), /主密码不能为空/)
  await assert.rejects(() => decryptVault({}, password), /密码库格式无效/)
  await assert.rejects(() => decryptVault(first, ''), /主密码不能为空/)

  const circular = {}
  circular.self = circular
  await assert.rejects(() => encryptVault(circular, password), /密码库数据无法序列化/)

  console.log('vault crypto verification passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
