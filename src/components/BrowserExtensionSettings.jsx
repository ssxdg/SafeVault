import React, { useEffect, useState } from 'react'

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/

function BrowserExtensionSettings({ onClose, onAlert }) {
  const [chromeExtensionId, setChromeExtensionId] = useState('')
  const [edgeExtensionId, setEdgeExtensionId] = useState('')
  const [useSameId, setUseSameId] = useState(true)
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingUnregister, setIsConfirmingUnregister] = useState(false)

  const loadStatus = async () => {
    const result = await window.electronAPI?.getNativeHostStatus?.()
    if (!result?.success) {
      setMessage(result?.error || '无法读取扩展注册状态。')
      return
    }
    setStatus(result)
    setChromeExtensionId(result.chromeExtensionId || '')
    setEdgeExtensionId(result.edgeExtensionId || '')
    setUseSameId(!result.edgeExtensionId || result.chromeExtensionId === result.edgeExtensionId)
  }

  useEffect(() => { void loadStatus() }, [])

  const handleChromeIdChange = (value) => {
    const normalized = value.trim().toLowerCase()
    setChromeExtensionId(normalized)
    if (useSameId) setEdgeExtensionId(normalized)
  }

  const handleSameIdChange = (checked) => {
    setUseSameId(checked)
    if (checked) setEdgeExtensionId(chromeExtensionId)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    const effectiveEdgeId = useSameId ? chromeExtensionId : edgeExtensionId
    if (!EXTENSION_ID_PATTERN.test(chromeExtensionId) || !EXTENSION_ID_PATTERN.test(effectiveEdgeId)) {
      setMessage('扩展 ID 必须是 32 位 a-p 字符。')
      return
    }

    setIsSaving(true)
    const result = await window.electronAPI?.registerNativeHost?.({
      chromeExtensionId,
      edgeExtensionId: effectiveEdgeId,
    })
    setIsSaving(false)
    if (!result?.success) {
      setMessage(result?.error || '注册失败。')
      return
    }
    setStatus(result)
    setMessage('注册成功。请在浏览器扩展页面重新加载 SafeVault 扩展。')
    onAlert?.({
      type: 'success',
      title: '扩展配置完成',
      message: 'Chrome 和 Edge Native Host 配置已保存。',
      detail: '请在浏览器扩展页面重新加载 SafeVault 扩展。',
    })
  }

  const handleUnregister = async () => {
    if (!isConfirmingUnregister) {
      setIsConfirmingUnregister(true)
      setMessage('再次点击“确认取消注册”完成操作；密码库数据不会被删除。')
      return
    }
    setIsSaving(true)
    const result = await window.electronAPI?.unregisterNativeHost?.()
    setIsSaving(false)
    setIsConfirmingUnregister(false)
    if (!result?.success) {
      setMessage(result?.error || '取消注册失败。')
      return
    }
    setStatus(previous => ({ ...previous, registered: false }))
    setMessage('Native Host 注册已移除，密码库数据未修改。')
    onAlert?.({
      type: 'success',
      title: '扩展配置已移除',
      message: 'Native Host 注册已取消。',
      detail: '加密密码库数据未被修改。',
    })
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <div className="modal browser-extension-settings" role="dialog" aria-modal="true" aria-labelledby="browser-extension-settings-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title" id="browser-extension-settings-title">浏览器扩展设置</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label="关闭扩展设置">✕</button>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <p className="extension-settings-help">
            在 <code>chrome://extensions</code> 和 <code>edge://extensions</code> 开启开发者模式，复制 SafeVault 扩展卡片上的 ID。
          </p>
          <div className="form-group">
            <label htmlFor="chrome-extension-id">Chrome 扩展 ID</label>
            <input
              id="chrome-extension-id"
              value={chromeExtensionId}
              onChange={event => handleChromeIdChange(event.target.value)}
              placeholder="32 位 a-p 字符"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <label className="extension-same-id">
            <input type="checkbox" checked={useSameId} onChange={event => handleSameIdChange(event.target.checked)} />
            Chrome 和 Edge 使用同一个扩展 ID
          </label>
          {!useSameId && (
            <div className="form-group">
              <label htmlFor="edge-extension-id">Edge 扩展 ID</label>
              <input
                id="edge-extension-id"
                value={edgeExtensionId}
                onChange={event => setEdgeExtensionId(event.target.value.trim().toLowerCase())}
                placeholder="32 位 a-p 字符"
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
          <div className={`extension-registration-state ${status?.registered ? 'registered' : ''}`}>
            {status?.registered ? '当前状态：已注册' : '当前状态：未注册或配置不完整'}
          </div>
          {message && <div className="extension-settings-message" role="status" aria-live="polite">{message}</div>}
          <div className="modal-footer extension-settings-actions">
            <button type="button" className="btn btn-danger" onClick={handleUnregister} disabled={isSaving}>
              {isConfirmingUnregister ? '确认取消注册' : '取消注册'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>关闭</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? '处理中...' : '保存并注册'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BrowserExtensionSettings
