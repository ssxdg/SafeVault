const assert = require('assert')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { createNativeHostManager } = require('../electron/nativeHostManager')

const CHROME_ID = 'pddepbogjelikaochehakjhihjjgdmgk'
const EDGE_ID = 'abcdefghijklmnopabcdefghijklmnop'

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safevault-native-host-manager-'))
  const bridgePath = path.join(directory, 'SafeVault.Bridge.exe')
  const manifestDirectory = path.join(directory, 'manifests')
  const commands = []
  await fs.writeFile(bridgePath, 'test bridge')

  const manager = createNativeHostManager({
    bridgePath,
    manifestDirectory,
    execFile: async (command, args) => {
      commands.push({ command, args })
      return { stdout: '', stderr: '' }
    },
  })

  try {
    await fs.mkdir(manifestDirectory, { recursive: true })
    await fs.writeFile(path.join(manifestDirectory, 'chrome.json'), JSON.stringify({
      name: 'com.safevault.bridge',
      path: 'D:\\removed-install\\SafeVault.Bridge.exe',
      type: 'stdio',
      allowed_origins: [`chrome-extension://${CHROME_ID}/`],
    }))
    await fs.writeFile(path.join(manifestDirectory, 'edge.json'), JSON.stringify({
      name: 'com.safevault.bridge',
      path: 'D:\\removed-install\\SafeVault.Bridge.exe',
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EDGE_ID}/`],
    }))

    const repaired = await manager.repairRegistration()
    assert.strictEqual(repaired.repaired, true)
    assert.strictEqual(commands.filter(command => command.args[0] === 'ADD').length, 2)
    assert.strictEqual(JSON.parse(await fs.readFile(path.join(manifestDirectory, 'chrome.json'), 'utf8')).path, bridgePath)
    assert.strictEqual(JSON.parse(await fs.readFile(path.join(manifestDirectory, 'edge.json'), 'utf8')).path, bridgePath)
    commands.length = 0

    assert.throws(
      () => manager.validateExtensionId('invalid-id'),
      /32 位 a-p/,
    )

    const registered = await manager.register({
      chromeExtensionId: CHROME_ID,
      edgeExtensionId: EDGE_ID,
    })
    assert.strictEqual(registered.success, true)
    assert.strictEqual(commands.filter(command => command.args[0] === 'ADD').length, 2)

    const chromeManifest = JSON.parse(await fs.readFile(path.join(manifestDirectory, 'chrome.json'), 'utf8'))
    const edgeManifest = JSON.parse(await fs.readFile(path.join(manifestDirectory, 'edge.json'), 'utf8'))
    assert.deepStrictEqual(chromeManifest.allowed_origins, [`chrome-extension://${CHROME_ID}/`])
    assert.deepStrictEqual(edgeManifest.allowed_origins, [`chrome-extension://${EDGE_ID}/`])
    assert.strictEqual(chromeManifest.path, bridgePath)

    const status = await manager.getStatus()
    assert.deepStrictEqual(status, {
      success: true,
      registered: true,
      bridgePath,
      bridgeExists: true,
      chromeExtensionId: CHROME_ID,
      edgeExtensionId: EDGE_ID,
    })

    await manager.register({ chromeExtensionId: CHROME_ID, edgeExtensionId: CHROME_ID })
    const updatedStatus = await manager.getStatus()
    assert.strictEqual(updatedStatus.edgeExtensionId, CHROME_ID)

    const removed = await manager.unregister()
    assert.strictEqual(removed.success, true)
    assert.strictEqual(commands.filter(command => command.args[0] === 'DELETE').length, 2)
    await assert.rejects(() => fs.readFile(path.join(manifestDirectory, 'chrome.json')), error => error.code === 'ENOENT')
    assert.strictEqual((await manager.getStatus()).registered, false)

    const rollbackCommands = []
    const failingManager = createNativeHostManager({
      bridgePath,
      manifestDirectory,
      execFile: async (command, args) => {
        rollbackCommands.push({ command, args })
        if (args[0] === 'ADD' && args[1].includes('Microsoft\\Edge')) throw new Error('registry failure')
        return { stdout: '', stderr: '' }
      },
    })
    await assert.rejects(() => failingManager.register({
      chromeExtensionId: CHROME_ID,
      edgeExtensionId: EDGE_ID,
    }), /registry failure/)
    assert.strictEqual(rollbackCommands.filter(command => command.args[0] === 'DELETE').length, 2)
    assert.strictEqual((await failingManager.getStatus()).registered, false)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }

  console.log('native host manager verification passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
