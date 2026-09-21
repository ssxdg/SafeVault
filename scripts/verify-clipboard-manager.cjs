const assert = require('assert')
const { createClipboardManager } = require('../electron/clipboardManager')

function createClock() {
  let nextId = 1
  const timers = new Map()
  return {
    setTimeout: (callback, delay) => {
      const id = nextId++
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: id => timers.delete(id),
    runNext: async () => {
      const entry = [...timers.entries()].sort((left, right) => left[1].delay - right[1].delay)[0]
      if (!entry) return
      timers.delete(entry[0])
      await entry[1].callback()
    },
  }
}

async function main() {
  let clipboardText = ''
  const clock = createClock()
  const manager = createClipboardManager({
    readText: () => clipboardText,
    writeText: value => { clipboardText = value },
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  })

  manager.copySecret('first-secret', 30_000)
  assert.strictEqual(clipboardText, 'first-secret')
  await clock.runNext()
  assert.strictEqual(clipboardText, '')

  manager.copySecret('owned-secret', 30_000)
  clipboardText = 'user-copied-later'
  await clock.runNext()
  assert.strictEqual(clipboardText, 'user-copied-later')

  manager.copySecret('lock-secret', 30_000)
  assert.strictEqual(manager.clearOwnedSecret(), true)
  assert.strictEqual(clipboardText, '')

  manager.copySecret('old-secret', 30_000)
  manager.copySecret('new-secret', 30_000)
  assert.strictEqual(clipboardText, 'new-secret')
  manager.dispose()
  assert.strictEqual(clipboardText, '')

  assert.throws(() => manager.copySecret('', 30_000), /不能为空/)
  assert.throws(() => manager.copySecret('secret', 0), /有效期/)
  console.log('clipboard manager verification passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
