const crypto = require('crypto')
const { promisify } = require('util')

const scryptAsync = promisify(crypto.scrypt)

const VAULT_FORMAT = 'safe-vault-encrypted'
const ENVELOPE_SCHEMA_VERSION = 1
const KDF_NAME = 'scrypt'
const CIPHER_NAME = 'aes-256-gcm'
const KEY_LENGTH = 32
const SCRYPT_COST = 16384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024
const SALT_LENGTH = 16
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const AAD = Buffer.from(`${VAULT_FORMAT}:${ENVELOPE_SCHEMA_VERSION}`, 'utf8')

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCanonicalBase64(value, expectedLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return false
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false

  const decoded = Buffer.from(value, 'base64')
  return decoded.length === expectedLength && decoded.toString('base64') === value
}

function isVaultEnvelope(value) {
  if (!isPlainObject(value) || !isPlainObject(value.kdf) || !isPlainObject(value.cipher)) return false

  return value.format === VAULT_FORMAT
    && value.schemaVersion === ENVELOPE_SCHEMA_VERSION
    && value.kdf.name === KDF_NAME
    && value.kdf.keyLength === KEY_LENGTH
    && value.kdf.cost === SCRYPT_COST
    && value.kdf.blockSize === SCRYPT_BLOCK_SIZE
    && value.kdf.parallelization === SCRYPT_PARALLELIZATION
    && isCanonicalBase64(value.kdf.salt, SALT_LENGTH)
    && value.cipher.name === CIPHER_NAME
    && isCanonicalBase64(value.cipher.iv, IV_LENGTH)
    && isCanonicalBase64(value.cipher.authTag, AUTH_TAG_LENGTH)
    && isCanonicalBase64(value.ciphertext, Buffer.from(value.ciphertext || '', 'base64').length)
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('主密码不能为空。')
  }
}

function assertVaultData(data) {
  if (!isPlainObject(data)) {
    throw new Error('密码库数据必须是对象。')
  }
}

async function deriveKey(passwordBuffer, salt) {
  return await scryptAsync(passwordBuffer, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  })
}

async function encryptVault(data, password) {
  assertVaultData(data)
  assertPassword(password)

  let serialized
  try {
    serialized = JSON.stringify(data)
  } catch {
    throw new Error('密码库数据无法序列化。')
  }
  if (typeof serialized !== 'string') {
    throw new Error('密码库数据无法序列化。')
  }

  const passwordBuffer = Buffer.from(password, 'utf8')
  const plaintextBuffer = Buffer.from(serialized, 'utf8')
  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  let key

  try {
    key = await deriveKey(passwordBuffer, salt)
    const cipher = crypto.createCipheriv(CIPHER_NAME, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    cipher.setAAD(AAD)
    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()])
    const authTag = cipher.getAuthTag()

    return {
      format: VAULT_FORMAT,
      schemaVersion: ENVELOPE_SCHEMA_VERSION,
      kdf: {
        name: KDF_NAME,
        salt: salt.toString('base64'),
        keyLength: KEY_LENGTH,
        cost: SCRYPT_COST,
        blockSize: SCRYPT_BLOCK_SIZE,
        parallelization: SCRYPT_PARALLELIZATION,
      },
      cipher: {
        name: CIPHER_NAME,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      },
      ciphertext: ciphertext.toString('base64'),
    }
  } finally {
    passwordBuffer.fill(0)
    plaintextBuffer.fill(0)
    key?.fill(0)
  }
}

async function decryptVault(envelope, password) {
  assertPassword(password)
  if (!isVaultEnvelope(envelope)) {
    throw new Error('密码库格式无效。')
  }

  const passwordBuffer = Buffer.from(password, 'utf8')
  const salt = Buffer.from(envelope.kdf.salt, 'base64')
  const iv = Buffer.from(envelope.cipher.iv, 'base64')
  const authTag = Buffer.from(envelope.cipher.authTag, 'base64')
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64')
  let key
  let plaintext

  try {
    key = await deriveKey(passwordBuffer, salt)
    const decipher = crypto.createDecipheriv(CIPHER_NAME, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAAD(AAD)
    decipher.setAuthTag(authTag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])

    const data = JSON.parse(plaintext.toString('utf8'))
    assertVaultData(data)
    return data
  } catch {
    throw new Error('密码库损坏或主密码错误。')
  } finally {
    passwordBuffer.fill(0)
    key?.fill(0)
    plaintext?.fill(0)
  }
}

module.exports = {
  encryptVault,
  decryptVault,
  isVaultEnvelope,
}
