const ALLOWED_IDLE_TIMEOUTS = new Set([5, 15, 30, 60])
const MAX_RETRY_DELAY_MS = 30_000

class VaultSession {
  constructor({
    unlock,
    lock,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    idleTimeoutMinutes = 15,
    onStateChange = () => {},
  }) {
    if (typeof unlock !== 'function' || typeof lock !== 'function') {
      throw new Error('VaultSession 需要 unlock 和 lock 函数。')
    }
    if (!ALLOWED_IDLE_TIMEOUTS.has(idleTimeoutMinutes)) {
      throw new Error('自动锁定只支持 5、15、30 或 60 分钟。')
    }

    this.unlockHandler = unlock
    this.lockHandler = lock
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.idleTimeoutMinutes = idleTimeoutMinutes
    this.onStateChange = onStateChange
    this.state = 'locked'
    this.reason = 'startup'
    this.data = null
    this.failureCount = 0
    this.retryAt = 0
    this.idleTimer = null
  }

  getStatus() {
    return {
      state: this.state,
      reason: this.reason,
      failureCount: this.failureCount,
      retryAfterMs: Math.max(0, this.retryAt - this.now()),
      idleTimeoutMinutes: this.idleTimeoutMinutes,
    }
  }

  getData() {
    return this.state === 'unlocked' ? this.data : null
  }

  async requireData() {
    const data = this.getData()
    if (!data) throw new Error('密码库尚未解锁。')
    return data
  }

  async unlock(password) {
    const retryAfterMs = Math.max(0, this.retryAt - this.now())
    if (retryAfterMs > 0) {
      return {
        success: false,
        throttled: true,
        retryAfterMs,
        error: `请等待 ${Math.ceil(retryAfterMs / 1000)} 秒后重试。`,
      }
    }

    let result
    try {
      result = await this.unlockHandler(password)
    } catch (error) {
      result = { success: false, error: error.message }
    }

    if (!result?.success || !result.data) {
      this.state = 'locked'
      this.reason = 'failed'
      this.data = null
      this.failureCount += 1
      const retryDelay = Math.min(this.failureCount * 1000, MAX_RETRY_DELAY_MS)
      this.retryAt = this.now() + retryDelay
      this.notifyStateChange()
      return {
        success: false,
        error: result?.error || '无法解锁密码库。',
        retryAfterMs: retryDelay,
      }
    }

    this.adoptData(result.data)
    return { success: true, data: this.data }
  }

  adoptData(data) {
    if (!data || typeof data !== 'object') throw new Error('不能用空数据解锁密码库会话。')
    this.state = 'unlocked'
    this.reason = null
    this.data = data
    this.failureCount = 0
    this.retryAt = 0
    this.scheduleIdleLock()
    this.notifyStateChange()
  }

  replaceData(data) {
    if (this.state !== 'unlocked') throw new Error('密码库尚未解锁。')
    if (!data || typeof data !== 'object') throw new Error('不能用空数据更新密码库会话。')
    this.data = data
  }

  async lock(reason = 'manual') {
    this.clearIdleTimer()
    this.state = 'locked'
    this.reason = reason
    this.data = null
    this.notifyStateChange()
    return await this.lockHandler(reason)
  }

  touch() {
    if (this.state === 'unlocked') this.scheduleIdleLock()
  }

  setIdleTimeoutMinutes(minutes) {
    if (!ALLOWED_IDLE_TIMEOUTS.has(minutes)) {
      throw new Error('自动锁定只支持 5、15、30 或 60 分钟。')
    }
    this.idleTimeoutMinutes = minutes
    if (this.state === 'unlocked') this.scheduleIdleLock()
  }

  clearIdleTimer() {
    if (this.idleTimer !== null) {
      this.clearTimer(this.idleTimer)
      this.idleTimer = null
    }
  }

  scheduleIdleLock() {
    this.clearIdleTimer()
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null
      void this.lock('idle')
    }, this.idleTimeoutMinutes * 60 * 1000)
  }

  notifyStateChange() {
    this.onStateChange(this.getStatus())
  }

  dispose() {
    this.clearIdleTimer()
    this.data = null
  }
}

module.exports = { VaultSession }
