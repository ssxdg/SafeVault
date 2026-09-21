const DEFAULT_SECRET_TTL_MS = 30_000

function createClipboardManager({
  readText,
  writeText,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof readText !== 'function' || typeof writeText !== 'function') {
    throw new Error('ClipboardManager 需要 readText 和 writeText 函数。')
  }

  let ownedSecret = null
  let clearTimerId = null

  function cancelTimer() {
    if (clearTimerId !== null) {
      clearTimer(clearTimerId)
      clearTimerId = null
    }
  }

  function clearOwnedSecret() {
    cancelTimer()
    if (ownedSecret === null) return false

    const secret = ownedSecret
    ownedSecret = null
    if (readText() !== secret) return false
    writeText('')
    return true
  }

  function copySecret(value, ttlMs = DEFAULT_SECRET_TTL_MS) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('复制内容不能为空。')
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('剪贴板有效期必须大于 0。')
    }

    cancelTimer()
    writeText(value)
    ownedSecret = value
    clearTimerId = setTimer(() => {
      clearTimerId = null
      clearOwnedSecret()
    }, ttlMs)
    return { success: true, expiresInMs: ttlMs }
  }

  function dispose() {
    clearOwnedSecret()
  }

  return { copySecret, clearOwnedSecret, dispose }
}

module.exports = { createClipboardManager, DEFAULT_SECRET_TTL_MS }
