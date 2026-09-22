const fs = require('fs').promises
const path = require('path')
const { execFile: execFileCallback } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFileCallback)
const HOST_NAME = 'com.safevault.bridge'
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const REGISTRY_PATHS = {
  chrome: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
  edge: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
}

function createNativeHostManager({
  bridgePath,
  manifestDirectory,
  fsApi = fs,
  execFile = (command, args) => execFileAsync(command, args, { windowsHide: true }),
} = {}) {
  if (!path.win32.isAbsolute(bridgePath || '') || path.win32.extname(bridgePath).toLowerCase() !== '.exe') {
    throw new Error('Bridge 路径必须是 .exe 绝对路径。')
  }
  if (typeof manifestDirectory !== 'string' || !manifestDirectory) {
    throw new Error('必须提供 Native Host 清单目录。')
  }

  const manifestPaths = {
    chrome: path.join(manifestDirectory, 'chrome.json'),
    edge: path.join(manifestDirectory, 'edge.json'),
  }

  function validateExtensionId(value) {
    const extensionId = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (!EXTENSION_ID_PATTERN.test(extensionId)) {
      throw new Error('扩展 ID 必须是 32 位 a-p 字符，不能包含空格或通配符。')
    }
    return extensionId
  }

  function createManifest(extensionId) {
    return {
      name: HOST_NAME,
      description: 'SafeVault local credential bridge',
      path: bridgePath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${extensionId}/`],
    }
  }

  async function writeManifest(browser, extensionId) {
    const targetPath = manifestPaths[browser]
    const temporaryPath = `${targetPath}.tmp`
    await fsApi.writeFile(temporaryPath, JSON.stringify(createManifest(extensionId), null, 2), 'utf8')
    await fsApi.rename(temporaryPath, targetPath)
    return targetPath
  }

  async function register({ chromeExtensionId, edgeExtensionId }) {
    const chromeId = validateExtensionId(chromeExtensionId)
    const edgeId = validateExtensionId(edgeExtensionId)
    await fsApi.access(bridgePath)
    await fsApi.mkdir(manifestDirectory, { recursive: true })

    const chromeManifestPath = await writeManifest('chrome', chromeId)
    const edgeManifestPath = await writeManifest('edge', edgeId)
    try {
      await execFile('reg.exe', ['ADD', REGISTRY_PATHS.chrome, '/ve', '/t', 'REG_SZ', '/d', chromeManifestPath, '/f'])
      await execFile('reg.exe', ['ADD', REGISTRY_PATHS.edge, '/ve', '/t', 'REG_SZ', '/d', edgeManifestPath, '/f'])
    } catch (error) {
      await unregister()
      throw error
    }
    return await getStatus()
  }

  async function readManifestExtensionId(manifestPath, requireCurrentBridgePath = true) {
    try {
      const manifest = JSON.parse(await fsApi.readFile(manifestPath, 'utf8'))
      const origin = Array.isArray(manifest.allowed_origins) ? manifest.allowed_origins[0] : ''
      const match = /^chrome-extension:\/\/([a-p]{32})\/$/.exec(origin)
      if (manifest.name !== HOST_NAME || (requireCurrentBridgePath && manifest.path !== bridgePath) || !match) return ''
      return match[1]
    } catch {
      return ''
    }
  }

  async function repairRegistration() {
    const [chromeExtensionId, edgeExtensionId] = await Promise.all([
      readManifestExtensionId(manifestPaths.chrome, false),
      readManifestExtensionId(manifestPaths.edge, false),
    ])
    if (!chromeExtensionId || !edgeExtensionId) return { success: true, repaired: false }
    return { ...await register({ chromeExtensionId, edgeExtensionId }), repaired: true }
  }

  async function getStatus() {
    const [chromeExtensionId, edgeExtensionId, bridgeExists] = await Promise.all([
      readManifestExtensionId(manifestPaths.chrome),
      readManifestExtensionId(manifestPaths.edge),
      fsApi.access(bridgePath).then(() => true, () => false),
    ])
    return {
      success: true,
      registered: Boolean(chromeExtensionId && edgeExtensionId && bridgeExists),
      bridgePath,
      bridgeExists,
      chromeExtensionId,
      edgeExtensionId,
    }
  }

  async function unregister() {
    for (const registryPath of Object.values(REGISTRY_PATHS)) {
      try {
        await execFile('reg.exe', ['DELETE', registryPath, '/f'])
      } catch {
        // 幂等卸载：注册项原本不存在时仍继续清理本应用自己的清单。
      }
    }
    for (const manifestPath of Object.values(manifestPaths)) {
      try {
        await fsApi.unlink(manifestPath)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return { success: true }
  }

  return { validateExtensionId, register, repairRegistration, unregister, getStatus }
}

module.exports = { createNativeHostManager, HOST_NAME, EXTENSION_ID_PATTERN }
