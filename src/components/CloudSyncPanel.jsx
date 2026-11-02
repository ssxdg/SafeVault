import React, { useEffect, useState } from 'react'

const statusLabels = {
  disabled: '未连接',
  'auth-required': '需要重新授权',
  connected: '已连接，尚未检查云端',
  syncing: '正在同步',
  synced: '已同步',
  pending: '本地已保存，等待同步',
  'initial-upload': '云端尚无密码库',
  'remote-newer': '云端有更新',
  conflict: '本地与云端存在冲突',
}

function CloudSyncPanel({ status, hasLocalVault = true, onClose, onBeforeRestore = async () => true, onStatusChange }) {
  const [clientId, setClientId] = useState(status.clientId || '')
  const [password, setPassword] = useState('')
  const [deviceCode, setDeviceCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState('')

  useEffect(() => {
    setClientId(status.clientId || '')
  }, [status.clientId])

  useEffect(() => window.electronAPI?.onCloudDeviceCode?.(setDeviceCode), [])

  const run = async action => {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      if (result?.success === false && result.error) setError(result.error)
      if (result?.status) onStatusChange(result.status)
      if (result?.success) {
        setChoice('')
        setDeviceCode(null)
      }
    } catch (caught) {
      setError(caught.message || '操作失败。')
    } finally {
      setBusy(false)
    }
  }

  const restore = () => run(async () => {
    if (!password) return { success: false, error: '请输入云端密码库的主密码。' }
    if (!await onBeforeRestore()) return { success: false, error: '本地保存失败，已取消恢复。' }
    const result = await window.electronAPI.restoreCloudVault(password)
    if (result.success) {
      setPassword('')
      onClose()
    }
    return result
  })

  const canSync = !['disabled', 'auth-required'].includes(status.state)
  const needsChoice = hasLocalVault && ['conflict', 'remote-newer', 'initial-upload'].includes(status.state)

  return (
    <div className="app-dialog-overlay" onMouseDown={onClose}>
      <div className="app-dialog cloud-sync-panel" onMouseDown={event => event.stopPropagation()}>
        <div className="app-dialog-content">
          <div className="app-dialog-title">OneDrive 密文同步</div>
          <p>本地密码库始终可离线使用。网盘只保存加密后的文件，Microsoft 登录密码不交给本程序。</p>
          <p>状态：{statusLabels[status.state] || status.state}{status.account ? ` · ${status.account}` : ''}</p>
          {status.lastSyncedAt && <p>最近同步：{new Date(status.lastSyncedAt).toLocaleString()}</p>}
          {(status.error || error) && <p className="cloud-sync-error">{error || status.error}</p>}
          {deviceCode && <p className="cloud-sync-code">浏览器打开 {deviceCode.verificationUri}，输入代码 <strong>{deviceCode.userCode}</strong></p>}
          {!canSync && (
            <>
              <label htmlFor="onedrive-client-id">Microsoft 应用 Client ID</label>
              <input id="onedrive-client-id" className="app-dialog-input" value={clientId} onChange={event => { setClientId(event.target.value.trim()); setError('') }} placeholder="在 Microsoft Entra 注册的应用 ID" />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => {
                // 未填写应用 ID 时给出明确提示，避免按钮无反馈让用户误以为授权功能失效。
                if (!clientId) {
                  setError('请先在 Microsoft Entra 注册应用，并在上方填写该应用的 Client ID。')
                  return
                }
                run(() => window.electronAPI.connectOneDrive(clientId))
              }}>连接 OneDrive</button>
            </>
          )}
          {canSync && (
            <div className="cloud-sync-actions">
              {hasLocalVault && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => window.electronAPI.syncOneDrive())}>立即检查同步</button>}
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setChoice('disconnect')}>断开连接</button>
            </div>
          )}
          {!hasLocalVault && canSync && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setChoice('restore')}>从 OneDrive 恢复密码库</button>}
          {needsChoice && (
            <div className="cloud-sync-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setChoice('upload')}>以本地版本覆盖云端</button>
              {status.state !== 'initial-upload' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setChoice('restore')}>以云端版本替换本地</button>}
            </div>
          )}
          {choice === 'restore' && (
            <div className="cloud-sync-choice">
              <p>当前本地密文会先备份，再由云端版本替换。请输入云端密码库的主密码。</p>
              <input className="app-dialog-input" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="云端密码库主密码" />
              <button type="button" className="btn btn-danger" disabled={busy || !password} onClick={restore}>确认恢复云端版本</button>
            </div>
          )}
          {choice === 'upload' && (
            <div className="cloud-sync-choice">
              <p>确认后将以当前本地加密密码库替换云端文件。</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => window.electronAPI.uploadLocalVault(status.state !== 'initial-upload'))}>确认上传本地版本</button>
            </div>
          )}
          {choice === 'disconnect' && (
            <div className="cloud-sync-choice">
              <p>断开后保留本地密码库和云端文件，仅清除本机授权。</p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => window.electronAPI.disconnectOneDrive())}>确认断开</button>
            </div>
          )}
          <div className="app-dialog-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>关闭</button></div>
        </div>
      </div>
    </div>
  )
}

export default CloudSyncPanel
