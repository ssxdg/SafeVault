import React, { useMemo, useState } from 'react'
import appIcon from '../images/icon.png'

function VaultUnlock({ status, onUnlock, onCreate, onMigrate, onRetry }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [localError, setLocalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mode = status.state
  const needsConfirmation = mode === 'create' || mode === 'migrate'
  const copy = useMemo(() => {
    if (mode === 'create') return { title: '创建本地加密密码库', action: '创建并进入' }
    if (mode === 'migrate') return { title: '加密现有密码库', action: '加密并进入' }
    return { title: '解锁密码保险箱', action: '解锁' }
  }, [mode])

  if (mode === 'loading') {
    return <div className="vault-gate"><div className="vault-loading">正在检查本地密码库...</div></div>
  }

  if (mode === 'error') {
    return (
      <div className="vault-gate">
        <div className="vault-unlock-card">
          <img src={appIcon} className="vault-unlock-icon" alt="" />
          <h1>密码库无法打开</h1>
          <p className="vault-error">{status.error}</p>
          <button className="btn btn-primary" type="button" onClick={onRetry}>重新检查</button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')
    if (!password) {
      setLocalError('请输入主密码。')
      return
    }
    if (needsConfirmation && password.length < 12) {
      setLocalError('主密码至少需要 12 个字符。')
      return
    }
    if (needsConfirmation && password !== confirmation) {
      setLocalError('两次输入的主密码不一致。')
      return
    }

    setIsSubmitting(true)
    const action = mode === 'create' ? onCreate : mode === 'migrate' ? onMigrate : onUnlock
    const result = await action(password)
    if (!result?.success) setLocalError(result?.error || '操作失败，请重试。')
    setIsSubmitting(false)
  }

  return (
    <div className="vault-gate">
      <div className="vault-window-actions">
        <button type="button" onClick={() => window.electronAPI?.minimize()} title="最小化">─</button>
        <button type="button" onClick={() => window.electronAPI?.close()} title="关闭">✕</button>
      </div>
      <form className="vault-unlock-card" onSubmit={handleSubmit}>
        <img src={appIcon} className="vault-unlock-icon" alt="" />
        <h1>{copy.title}</h1>
        {mode === 'migrate' && <p>检测到现有明文数据。加密成功后，程序将不再以明文保存密码。</p>}
        {needsConfirmation && <p className="vault-warning">请妥善保存主密码。忘记后无法恢复密码库内容。</p>}
        <label htmlFor="vault-password">主密码</label>
        <input
          id="vault-password"
          type="password"
          autoFocus
          autoComplete={mode === 'locked' ? 'current-password' : 'new-password'}
          value={password}
          onChange={event => setPassword(event.target.value)}
          disabled={isSubmitting}
        />
        {needsConfirmation && (
          <>
            <label htmlFor="vault-password-confirmation">再次输入主密码</label>
            <input
              id="vault-password-confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              disabled={isSubmitting}
            />
          </>
        )}
        {(localError || status.error) && <p className="vault-error">{localError || status.error}</p>}
        {status.retryAfterMs > 0 && <p className="vault-retry">操作过于频繁，请稍后重试。</p>}
        <button className="btn btn-primary vault-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '处理中...' : copy.action}
        </button>
      </form>
    </div>
  )
}

export default VaultUnlock
