import { useCallback, useEffect, useRef, useState } from 'react'

const INITIAL_STATUS = {
  state: 'loading',
  reason: 'startup',
  idleTimeoutMinutes: 15,
  retryAfterMs: 0,
}

function mapInspectionToStatus(result) {
  if (result?.state === 'missing') return { ...INITIAL_STATUS, state: 'create' }
  if (result?.state === 'plaintext') {
    return { ...INITIAL_STATUS, state: 'migrate', schemaVersion: result.schemaVersion }
  }
  if (result?.state === 'locked') return { ...INITIAL_STATUS, state: 'locked' }
  return {
    ...INITIAL_STATUS,
    state: 'error',
    error: result?.error || '无法确认本地密码库状态。',
  }
}

export function useVaultSession() {
  const [status, setStatus] = useState(INITIAL_STATUS)
  const [data, setData] = useState(null)
  const lastTouchRef = useRef(0)

  const inspect = useCallback(async () => {
    if (!window.electronAPI?.inspectVault) {
      setStatus({ ...INITIAL_STATUS, state: 'error', error: '当前环境不支持本地密码库。' })
      return
    }
    try {
      setStatus(previous => ({ ...previous, state: 'loading', error: '' }))
      const result = await window.electronAPI.inspectVault()
      setStatus(mapInspectionToStatus(result))
    } catch (error) {
      setStatus({ ...INITIAL_STATUS, state: 'error', error: error.message })
    }
  }, [])

  useEffect(() => {
    inspect()
    return window.electronAPI?.onVaultStatusChanged?.((nextStatus) => {
      if (nextStatus?.state === 'locked') setData(null)
      setStatus(previous => ({ ...previous, ...nextStatus }))
    })
  }, [inspect])

  const openVault = useCallback(async (method, password) => {
    try {
      const result = await method(password)
      if (result?.success) {
        setData(result.data)
        setStatus(previous => ({
          ...previous,
          state: 'unlocked',
          reason: null,
          error: '',
          failureCount: 0,
          retryAfterMs: 0,
        }))
      } else {
        setData(null)
        setStatus(previous => ({
          ...previous,
          state: previous.state === 'create' || previous.state === 'migrate' ? previous.state : 'locked',
          error: result?.error || '密码库操作失败。',
          retryAfterMs: result?.retryAfterMs || 0,
        }))
      }
      return result
    } catch (error) {
      const result = { success: false, error: error.message }
      setStatus(previous => ({ ...previous, error: error.message }))
      return result
    }
  }, [])

  const unlock = useCallback(password => (
    openVault(window.electronAPI.unlockVault, password)
  ), [openVault])

  const create = useCallback(password => (
    openVault(window.electronAPI.createVault, password)
  ), [openVault])

  const migrate = useCallback(password => (
    openVault(window.electronAPI.migrateVault, password)
  ), [openVault])

  const lock = useCallback(async (reason = 'manual') => {
    const result = await window.electronAPI?.lockVault?.(reason)
    setData(null)
    setStatus(previous => ({ ...previous, state: 'locked', reason, error: '', retryAfterMs: 0 }))
    return result
  }, [])

  const touch = useCallback(() => {
    const now = Date.now()
    if (now - lastTouchRef.current < 1000) return
    lastTouchRef.current = now
    void window.electronAPI?.touchVault?.()
  }, [])

  useEffect(() => {
    if (status.state !== 'unlocked') return undefined
    const events = ['pointerdown', 'keydown']
    events.forEach(eventName => window.addEventListener(eventName, touch, { passive: true }))
    return () => events.forEach(eventName => window.removeEventListener(eventName, touch))
  }, [status.state, touch])

  const setIdleTimeoutMinutes = useCallback(async (minutes) => {
    const result = await window.electronAPI?.setVaultIdleTimeout?.(minutes)
    if (result?.success) setStatus(previous => ({ ...previous, ...result.status }))
    return result
  }, [])

  return {
    status,
    data,
    inspect,
    unlock,
    create,
    migrate,
    lock,
    touch,
    setIdleTimeoutMinutes,
  }
}
