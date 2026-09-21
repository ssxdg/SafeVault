const fs = require('fs').promises
const path = require('path')
const { normalizeData } = require('./dataNormalizer')
const { encryptVault, decryptVault, isVaultEnvelope } = require('./vaultCrypto')

const DATA_FILE_NAME = 'safe_vault.json'
const ENCRYPTED_FORMAT = 'safe-vault-encrypted'

function createFileManager({ dataFile, fsApi = fs, dialogApi } = {}) {
  if (typeof dataFile !== 'string' || !dataFile.trim()) {
    throw new Error('必须提供密码库文件路径。')
  }

  const tempFile = `${dataFile}.tmp`
  const backupFile = `${dataFile}.pre-encryption-backup`
  let activePassword = null

  const getDialog = () => dialogApi || require('electron').dialog

  async function fileExists(filePath) {
    try {
      await fsApi.stat(filePath)
      return true
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }

  async function inspectVault() {
    let raw
    try {
      raw = await fsApi.readFile(dataFile, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          if (await fileExists(tempFile)) {
            return { state: 'corrupt', error: '检测到未完成的密码库临时文件，请先人工恢复或移走该文件。' }
          }
        } catch (tempError) {
          return { state: 'corrupt', error: `无法检查密码库临时文件：${tempError.message}` }
        }
        return { state: 'missing' }
      }
      return { state: 'corrupt', error: `无法读取密码库：${error.message}` }
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      return { state: 'corrupt', error: `密码库 JSON 无法解析：${error.message}` }
    }

    if (isVaultEnvelope(parsed)) return { state: 'locked', envelope: parsed }
    if (parsed?.format === ENCRYPTED_FORMAT) {
      return { state: 'corrupt', error: '加密密码库格式无效。' }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.tabs)) {
      return {
        state: 'plaintext',
        schemaVersion: Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0,
      }
    }
    return { state: 'corrupt', error: '密码库不是有效的业务数据或加密信封。' }
  }

  async function writeVerifiedEnvelope(data, password) {
    const envelope = await encryptVault(data, password)
    await fsApi.writeFile(tempFile, JSON.stringify(envelope, null, 2), 'utf8')

    const writtenRaw = await fsApi.readFile(tempFile, 'utf8')
    const writtenEnvelope = JSON.parse(writtenRaw)
    if (!isVaultEnvelope(writtenEnvelope)) {
      throw new Error('加密密码库临时文件验证失败。')
    }
    const verifiedData = await decryptVault(writtenEnvelope, password)
    if (JSON.stringify(verifiedData) !== JSON.stringify(data)) {
      throw new Error('加密密码库回读数据不一致。')
    }

    await fsApi.rename(tempFile, dataFile)
  }

  async function createVault(password) {
    try {
      const state = await inspectVault()
      if (state.state !== 'missing') {
        return { success: false, error: '密码库文件已经存在或需要恢复，不能创建新密码库。' }
      }

      const data = normalizeData(null)
      await writeVerifiedEnvelope(data, password)
      activePassword = password
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function unlockVault(password) {
    const state = await inspectVault()
    if (state.state !== 'locked') {
      const error = state.state === 'corrupt' ? state.error : '当前密码库不是可解锁的加密文件。'
      return { success: false, error }
    }

    try {
      const data = normalizeData(await decryptVault(state.envelope, password))
      activePassword = password
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  function lockVault() {
    activePassword = null
    return { success: true }
  }

  async function preservePlaintextBackup(raw) {
    try {
      await fsApi.writeFile(backupFile, raw, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const existingBackup = await fsApi.readFile(backupFile, 'utf8')
      if (existingBackup !== raw) {
        throw new Error('迁移备份文件已存在且内容与当前密码库不同。')
      }
    }
  }

  async function migratePlaintextVault(password) {
    try {
      const state = await inspectVault()
      if (state.state !== 'plaintext') {
        const error = state.state === 'corrupt' ? state.error : '当前密码库不是可迁移的明文文件。'
        return { success: false, error }
      }

      const originalRaw = await fsApi.readFile(dataFile, 'utf8')
      const normalized = normalizeData(JSON.parse(originalRaw))
      await preservePlaintextBackup(originalRaw)
      await writeVerifiedEnvelope(normalized, password)
      // 备份只服务于迁移事务；主文件完成加密替换后必须移除，避免磁盘长期残留明文密码。
      await fsApi.unlink(backupFile)
      activePassword = password
      return { success: true, data: normalized }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function writeEncryptedData(data) {
    if (!activePassword) return { success: false, error: '密码库尚未解锁，不能写入数据。' }

    try {
      const state = await inspectVault()
      if (state.state === 'corrupt') {
        return { success: false, error: `密码库已损坏，已禁止写入：${state.error}` }
      }
      if (state.state !== 'locked') {
        return { success: false, error: '密码库当前状态不允许加密写入。' }
      }

      const normalized = normalizeData(data)
      await writeVerifiedEnvelope(normalized, activePassword)
      return { success: true, data: normalized }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function readData() {
    const state = await inspectVault()
    if (state.state === 'missing') return { success: true, data: normalizeData(null), missing: true }
    if (state.state === 'corrupt') return { success: false, error: state.error }
    if (state.state === 'plaintext') {
      try {
        const parsed = JSON.parse(await fsApi.readFile(dataFile, 'utf8'))
        return { success: true, data: normalizeData(parsed), plaintext: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    if (!activePassword) return { success: false, locked: true, error: '密码库尚未解锁。' }
    try {
      return { success: true, data: normalizeData(await decryptVault(state.envelope, activePassword)) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function exportEncryptedVault(mainWindow) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { filePath, canceled } = await getDialog().showSaveDialog(mainWindow, {
      defaultPath: `safe_vault_encrypted_${date}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { success: false, cancelled: true }
    try {
      const state = await inspectVault()
      if (state.state !== 'locked') {
        throw new Error(state.error || '当前密码库不是可导出的加密文件。')
      }
      await fsApi.writeFile(filePath, JSON.stringify(state.envelope, null, 2), 'utf8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function importEncryptedVault(mainWindow, password) {
    const { filePaths, canceled } = await getDialog().showOpenDialog(mainWindow, {
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths || filePaths.length === 0) return { success: false, cancelled: true }
    try {
      const raw = await fsApi.readFile(filePaths[0], 'utf8')
      const envelope = JSON.parse(raw)
      if (!isVaultEnvelope(envelope)) throw new Error('备份不是有效的 SafeVault 加密文件。')
      return { success: true, data: normalizeData(await decryptVault(envelope, password)) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function exportPlaintextVault(mainWindow, password) {
    try {
      const state = await inspectVault()
      if (state.state !== 'locked') {
        throw new Error(state.error || '当前密码库不是可验证的加密文件。')
      }
      const data = normalizeData(await decryptVault(state.envelope, password))
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const { filePath, canceled } = await getDialog().showSaveDialog(mainWindow, {
        defaultPath: `safe_vault_plaintext_${date}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      if (canceled || !filePath) return { success: false, cancelled: true }
      await fsApi.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  return {
    inspectVault,
    createVault,
    unlockVault,
    lockVault,
    migratePlaintextVault,
    writeEncryptedData,
    readData,
    writeData: writeEncryptedData,
    exportEncryptedVault,
    importEncryptedVault,
    exportPlaintextVault,
  }
}

let defaultManager

function getDefaultManager() {
  if (!defaultManager) {
    const { app } = require('electron')
    defaultManager = createFileManager({
      dataFile: path.join(app.getPath('userData'), DATA_FILE_NAME),
    })
  }
  return defaultManager
}

module.exports = {
  createFileManager,
  inspectVault: (...args) => getDefaultManager().inspectVault(...args),
  createVault: (...args) => getDefaultManager().createVault(...args),
  unlockVault: (...args) => getDefaultManager().unlockVault(...args),
  lockVault: (...args) => getDefaultManager().lockVault(...args),
  migratePlaintextVault: (...args) => getDefaultManager().migratePlaintextVault(...args),
  writeEncryptedData: (...args) => getDefaultManager().writeEncryptedData(...args),
  readData: (...args) => getDefaultManager().readData(...args),
  writeData: (...args) => getDefaultManager().writeData(...args),
  exportEncryptedVault: (...args) => getDefaultManager().exportEncryptedVault(...args),
  importEncryptedVault: (...args) => getDefaultManager().importEncryptedVault(...args),
  exportPlaintextVault: (...args) => getDefaultManager().exportPlaintextVault(...args),
}
