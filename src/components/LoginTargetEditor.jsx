import React, { useState } from 'react'

const createTargetId = () => `target-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function LoginTargetEditor({ value = [], onChange }) {
  const [website, setWebsite] = useState('')
  const [error, setError] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const targets = Array.isArray(value) ? value : []

  const updateTarget = (id, changes) => {
    onChange(targets.map(target => target.id === id ? { ...target, ...changes } : target))
  }

  const removeTarget = id => onChange(targets.filter(target => target.id !== id))

  const addWebsite = async () => {
    setError('')
    const result = await window.electronAPI?.normalizeWebsiteTarget?.(website)
    if (!result?.success) {
      setError(result?.error || '仅 Electron 环境支持添加自动填充规则。')
      return
    }
    if (targets.some(target => target.type === 'website' && target.origin === result.origin)) {
      setError('该网站规则已经存在。')
      return
    }
    onChange([...targets, {
      id: createTargetId(),
      type: 'website',
      origin: result.origin,
      enabled: true,
    }])
    setWebsite('')
  }

  const addExecutable = async () => {
    setError('')
    const result = await window.electronAPI?.selectExecutableTarget?.()
    if (!result?.success) {
      if (!result?.cancelled) setError(result?.error || '无法选择程序。')
      return
    }
    if (targets.some(target => target.type === 'windowsApp' && target.executablePath.toLowerCase() === result.executablePath.toLowerCase())) {
      setError('该程序规则已经存在。')
      return
    }
    onChange([...targets, {
      id: createTargetId(),
      type: 'windowsApp',
      executablePath: result.executablePath,
      enabled: true,
      fillStrategy: 'uia',
    }])
  }

  const captureExecutable = async () => {
    setError('')
    setIsCapturing(true)
    const result = await window.electronAPI?.captureForegroundTarget?.()
    setIsCapturing(false)
    if (!result?.appIdentity?.executablePath) {
      setError(`未能安全识别前台程序（${result?.code || 'unknown'}）。`)
      return
    }
    const executablePath = result.appIdentity.executablePath
    if (targets.some(target => target.type === 'windowsApp' && target.executablePath.toLowerCase() === executablePath.toLowerCase())) {
      setError('该程序规则已经存在。')
      return
    }
    const fields = Array.isArray(result.fields) ? result.fields : []
    const passwordFields = fields.filter(field => field.isPassword && field.isEnabled && field.supportsValue)
    const passwordField = passwordFields.length === 1 ? passwordFields[0] : null
    const usernameField = passwordField
      ? fields.filter(field => !field.isPassword && field.isEnabled && field.supportsValue && field.order < passwordField.order).at(-1)
      : null
    onChange([...targets, {
      id: createTargetId(),
      type: 'windowsApp',
      executablePath,
      windowTitlePattern: result.appIdentity.windowTitle
        ? `^${result.appIdentity.windowTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
        : '',
      enabled: true,
      fillStrategy: 'uia',
      ...(usernameField?.automationId ? { usernameSelector: { automationId: usernameField.automationId } } : {}),
      ...(passwordField?.automationId ? { passwordSelector: { automationId: passwordField.automationId } } : {}),
    }])
    if (!usernameField || !passwordField) setError('已保存程序身份，但字段不唯一；请仅在确认规则后使用 UI Automation。')
  }

  return (
    <div className="login-target-editor">
      <div className="login-target-heading">自动填充目标</div>
      <div className="login-target-add-row">
        <input
          type="url"
          value={website}
          onChange={event => setWebsite(event.target.value)}
          placeholder="https://login.example.com"
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={addWebsite}>添加网站</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={captureExecutable} disabled={isCapturing}>
          {isCapturing ? '请切换到目标窗口…' : '识别当前程序'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addExecutable}>选择程序</button>
      </div>
      {error && <div className="login-target-error">{error}</div>}
      {targets.length === 0 && <div className="login-target-empty">未配置目标时不会对网站或程序提供此凭据。</div>}
      {targets.map(target => (
        <div className="login-target-item" key={target.id}>
          <div className="login-target-summary">
            <label>
              <input
                type="checkbox"
                checked={target.enabled !== false}
                onChange={event => updateTarget(target.id, { enabled: event.target.checked })}
              />
              启用
            </label>
            <span title={target.origin || target.executablePath}>
              {target.type === 'website' ? `网站：${target.origin}` : `程序：${target.executablePath}`}
            </span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTarget(target.id)}>删除</button>
          </div>
          {target.type === 'windowsApp' && (
            <div className="login-target-options">
              <input
                type="text"
                value={target.windowTitlePattern || ''}
                onChange={event => updateTarget(target.id, { windowTitlePattern: event.target.value })}
                placeholder="可选：窗口标题正则"
                maxLength={128}
              />
              <select
                value={target.fillStrategy || 'uia'}
                onChange={event => updateTarget(target.id, { fillStrategy: event.target.value })}
              >
                <option value="uia">UI Automation</option>
                <option value="clipboard">剪贴板兜底</option>
                <option value="keystroke">模拟粘贴兜底</option>
              </select>
              {(target.usernameSelector || target.passwordSelector) && (
                <span className="login-target-field-summary">
                  字段：账号 {target.usernameSelector?.automationId || target.usernameSelector?.name || '自动'}；密码 {target.passwordSelector?.automationId || target.passwordSelector?.name || '自动'}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default LoginTargetEditor
