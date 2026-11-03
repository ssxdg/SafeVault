import React, { useEffect, useState } from 'react'

function GitSyncSettings({ onClose, onAlert }) {
  // 令牌输入框不回显已保存值，留空时由主进程沿用系统加密存储中的凭据。
  const [remoteUrl, setRemoteUrl] = useState('')
  const [authMode, setAuthMode] = useState('ssh')
  const [username, setUsername] = useState('')
  const [credential, setCredential] = useState('')
  const [hasCredential, setHasCredential] = useState(false)
  const [message, setMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    window.electronAPI.getGitSyncSettings().then(result => {
      if (!active) return
      if (!result.success) return setMessage({ type: 'error', text: result.error })
      setRemoteUrl(result.remoteUrl)
      setAuthMode(result.authMode)
      setUsername(result.username)
      setHasCredential(result.hasCredential)
    })
    return () => { active = false }
  }, [])

  const handleSave = async event => {
    event.preventDefault()
    setIsSaving(true)
    setMessage({ type: 'info', text: '正在保存 Git 设置...' })
    try {
      const result = await window.electronAPI.saveGitSyncSettings({ remoteUrl: remoteUrl.trim(), authMode, username, credential })
      if (!result.success) return setMessage({ type: 'error', text: `保存失败：${result.error}` })
      setCredential('')
      setHasCredential(result.hasCredential)
      setMessage({ type: 'info', text: '设置已保存，正在验证仓库连接...' })
      // 保存设置只完成本地配置；克隆成功才说明当前凭据具备远端读取权限。
      const connection = await window.electronAPI.testGitConnection()
      if (!connection.success) {
        setMessage({ type: 'error', text: `设置已保存，但连接失败：${connection.error}` })
        return
      }
      onClose()
      onAlert?.({
        type: 'success',
        title: 'Git 仓库连接成功',
        message: connection.hasVault ? '已连接，仓库中有加密密码库。' : '已连接，仓库中暂无加密密码库。',
        detail: connection.hasVault ? '可点击“Git 导入”拉取数据。推送权限将在“Git 导出”时验证。' : '可点击“Git 导出”推送本地数据。推送权限将在导出时验证。',
      })
    } catch (error) {
      setMessage({ type: 'error', text: `连接验证失败：${error.message}` })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={() => { if (!isSaving) onClose() }}>
      <div className="modal browser-extension-settings" role="dialog" aria-modal="true" aria-labelledby="git-sync-settings-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" id="git-sync-settings-title">Git 同步设置</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label="关闭 Git 设置" disabled={isSaving}>✕</button>
        </div>
        <form className="modal-form" onSubmit={handleSave}>
          <p className="extension-settings-help">请先创建独立的私有仓库。仅同步加密密码库文件；其他设备导入时输入远端文件的主密码。</p>
          <div className="form-group">
            <label htmlFor="git-remote-url">仓库地址</label>
            <input id="git-remote-url" value={remoteUrl} onChange={event => setRemoteUrl(event.target.value)} placeholder="git@github.com:user/private-vault.git" autoComplete="off" spellCheck={false} required />
          </div>
          <div className="form-group">
            <label htmlFor="git-auth-mode">连接方式</label>
            <select id="git-auth-mode" value={authMode} onChange={event => setAuthMode(event.target.value)}>
              <option value="ssh">SSH 密钥</option>
              <option value="https">HTTPS 用户名与访问令牌</option>
            </select>
          </div>
          {authMode === 'https' ? (
            <>
              <div className="form-group">
                <label htmlFor="git-username">用户名</label>
                <input id="git-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
              </div>
              <div className="form-group">
                <label htmlFor="git-credential">访问令牌或 Git 服务支持的密码</label>
                <input id="git-credential" type="password" value={credential} onChange={event => setCredential(event.target.value)} placeholder={hasCredential ? '同一地址和用户名可留空沿用' : '请输入访问令牌'} autoComplete="new-password" />
              </div>
              <p className="extension-settings-help">GitHub 请使用个人访问令牌，账户登录密码不能用于 Git。凭据只保存在本机系统加密存储中。</p>
            </>
          ) : <p className="extension-settings-help">SSH 使用本机 Git 已配置的密钥或 ssh-agent；首次连接前请确认主机指纹。</p>}
          {message && <div className={`git-sync-message ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite">{message.text}</div>}
          <div className="modal-footer">
            <button className="btn btn-secondary" type="button" onClick={onClose} disabled={isSaving}>关闭</button>
            <button className="btn btn-primary git-settings-submit" type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving && <span className="git-loading-spinner" aria-hidden="true" />}
              {isSaving ? '正在验证连接...' : '保存并验证连接'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GitSyncSettings
