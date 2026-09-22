const assert = require('assert')
const { VaultSession } = require('../electron/vaultSession')

function createClock() {
  let currentTime = 0
  let nextId = 1
  const timers = new Map()

  return {
    now: () => currentTime,
    setTimeout: (callback, delay) => {
      const id = nextId++
      timers.set(id, { callback, runAt: currentTime + delay })
      return id
    },
    clearTimeout: id => timers.delete(id),
    advanceBy: (milliseconds) => {
      currentTime += milliseconds
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.runAt <= currentTime)
        .sort((left, right) => left[1].runAt - right[1].runAt)
      for (const [id, timer] of due) {
        timers.delete(id)
        timer.callback()
      }
    },
  }
}

async function main() {
  const clock = createClock()
  const lockReasons = []
  const stateChanges = []
  let unlockCalls = 0
  const session = new VaultSession({
    unlock: async password => {
      unlockCalls++
      if (password !== 'correct-password') return { success: false, error: '密码错误' }
      return { success: true, data: { schemaVersion: 3, secret: 'vault-data' } }
    },
    lock: async reason => {
      lockReasons.push(reason)
      return { success: true }
    },
    now: clock.now,
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
    onStateChange: status => stateChanges.push(status),
  })

  assert.deepStrictEqual(session.getStatus(), {
    state: 'locked',
    reason: 'startup',
    failureCount: 0,
    retryAfterMs: 0,
    idleTimeoutMinutes: 15,
  })
  assert.strictEqual(session.getData(), null)

  const firstFailure = await session.unlock('wrong-password')
  assert.strictEqual(firstFailure.success, false)
  assert.strictEqual(session.getStatus().failureCount, 1)
  assert.strictEqual(session.getStatus().retryAfterMs, 1000)
  assert.strictEqual(unlockCalls, 1)

  const throttled = await session.unlock('wrong-password')
  assert.strictEqual(throttled.success, false)
  assert.strictEqual(throttled.throttled, true)
  assert.strictEqual(unlockCalls, 1)

  clock.advanceBy(1000)
  await session.unlock('wrong-password')
  assert.strictEqual(session.getStatus().failureCount, 2)
  assert.strictEqual(session.getStatus().retryAfterMs, 2000)

  clock.advanceBy(2000)
  const unlocked = await session.unlock('correct-password')
  assert.strictEqual(unlocked.success, true)
  assert.strictEqual(session.getStatus().state, 'unlocked')
  assert.strictEqual(session.getStatus().failureCount, 0)
  assert.deepStrictEqual(session.getData(), { schemaVersion: 3, secret: 'vault-data' })

  clock.advanceBy(15 * 60 * 1000 + 1)
  assert.strictEqual(session.getStatus().state, 'locked')
  assert.strictEqual(session.getStatus().reason, 'idle')
  assert.strictEqual(session.getData(), null)
  assert.deepStrictEqual(lockReasons, ['idle'])

  clock.advanceBy(1)
  await session.unlock('correct-password')
  session.setIdleTimeoutMinutes(5)
  clock.advanceBy(4 * 60 * 1000)
  session.touch()
  clock.advanceBy(4 * 60 * 1000)
  assert.strictEqual(session.getStatus().state, 'unlocked')
  clock.advanceBy(60 * 1000 + 1)
  assert.strictEqual(session.getStatus().state, 'locked')

  session.adoptData({ schemaVersion: 3, created: true })
  assert.strictEqual(session.getStatus().state, 'unlocked')
  assert.deepStrictEqual(session.getData(), { schemaVersion: 3, created: true })
  session.replaceData({ schemaVersion: 3, updated: true })
  assert.deepStrictEqual(session.getData(), { schemaVersion: 3, updated: true })
  await session.lock('manual')
  assert.strictEqual(stateChanges.some(status => status.state === 'unlocked'), true)
  assert.strictEqual(stateChanges.at(-1).reason, 'manual')

  await assert.rejects(() => session.requireData(), /密码库尚未解锁/)

  session.dispose()

  const customClock = createClock()
  const customSession = new VaultSession({
    unlock: async () => ({ success: true, data: { schemaVersion: 3 } }),
    lock: async () => ({ success: true }),
    now: customClock.now,
    setTimer: customClock.setTimeout,
    clearTimer: customClock.clearTimeout,
    idleTimeoutMinutes: 10,
  })
  await customSession.unlock('correct-password')
  customClock.advanceBy(10 * 60 * 1000 + 1)
  assert.strictEqual(customSession.getStatus().state, 'locked', 'custom minute value should lock the session')

  const neverLockClock = createClock()
  const neverLockSession = new VaultSession({
    unlock: async () => ({ success: true, data: { schemaVersion: 3 } }),
    lock: async () => ({ success: true }),
    now: neverLockClock.now,
    setTimer: neverLockClock.setTimeout,
    clearTimer: neverLockClock.clearTimeout,
    idleTimeoutMinutes: 0,
  })
  await neverLockSession.unlock('correct-password')
  neverLockClock.advanceBy(365 * 24 * 60 * 60 * 1000)
  assert.strictEqual(neverLockSession.getStatus().state, 'unlocked', 'zero should disable only the idle lock timer')
  assert.throws(() => neverLockSession.setIdleTimeoutMinutes(-1), /1 到 1440 分钟或不自动锁定/)
  assert.throws(() => neverLockSession.setIdleTimeoutMinutes(1441), /1 到 1440 分钟或不自动锁定/)
  assert.throws(() => neverLockSession.setIdleTimeoutMinutes(1.5), /1 到 1440 分钟或不自动锁定/)

  console.log('vault session verification passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
