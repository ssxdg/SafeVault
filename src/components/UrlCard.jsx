import React, { useState } from 'react'
import copyIcon from '../images/复制.png'

function UrlCard({ urlItem, onEdit, onDelete, onIncrementUse, showStatus, onConfirm }) {
  const [showToken, setShowToken] = useState(false)

  const copy = (text, label) => {
    if (!text) return
    // 剪贴板写入失败时给出明确提示，避免用户复制 Token 后粘贴到别处才发现失败。
    navigator.clipboard.writeText(text)
      .then(() => {
        showStatus(`已复制${label}到剪贴板`)
        onIncrementUse?.()
      })
      .catch(() => showStatus(`复制${label}失败`))
  }

  const openUrl = async (e) => {
    e.stopPropagation()
    if (!urlItem.url) return
    if (window.electronAPI?.openUrl) {
      const result = await window.electronAPI.openUrl(urlItem.url)
      if (result?.success === false) {
        showStatus(result.error || '无法打开链接')
        return
      }
      onIncrementUse?.()
      return
    }

    // 浏览器调试环境按桌面端同样的协议白名单打开，防止调试和打包行为不一致。
    try {
      const parsed = new URL(urlItem.url.includes('://') ? urlItem.url : `https://${urlItem.url}`)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol')
      window.open(parsed.toString(), '_blank', 'noopener')
      onIncrementUse?.()
    } catch {
      showStatus('仅支持 http/https 链接')
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    onConfirm({
      title: '删除网址',
      message: `确定要删除「${urlItem.name || '此网址'}」吗？`,
      detail: '删除后该网址记录将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, onDelete)
  }

  return (
    <div className="card url-card">
      <div className="card-header">
        <span className="card-title">{urlItem.name || '未命名网址'}</span>
        <div className="card-actions">
          <button className="icon-btn" onClick={onEdit} title="编辑">✏️</button>
          <button className="icon-btn delete-btn" onClick={handleDelete} title="删除">🗑️</button>
        </div>
      </div>
      <div className="card-body">
        {urlItem.url && (
          <div className="card-row">
            <span className="row-label">网址</span>
            <span
              className="row-value url-link"
              onClick={openUrl}
              onDoubleClick={() => copy(urlItem.url, '网址')}
              title={urlItem.url}
            >
              {urlItem.url}
            </span>
            <button className="copy-btn" onClick={openUrl} title="打开网址">🔗</button>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(urlItem.url, '网址') }}
              title="复制网址"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {urlItem.token && (
          <div className="card-row">
            <span className="row-label">Token</span>
            <span
              className="row-value copyable"
              onDoubleClick={() => copy(urlItem.token, 'Token')}
            >
              {showToken ? urlItem.token : '•'.repeat(Math.min(urlItem.token.length, 20))}
            </span>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); setShowToken(v => !v) }}
              title={showToken ? '隐藏' : '显示'}
            >
              {showToken ? '🙈' : '👁'}
            </button>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(urlItem.token, 'Token') }}
              title="复制 Token"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {urlItem.note && (
          <div className="card-row note-row">
            <span className="row-label">备注</span>
            <span className="row-value note-value">{urlItem.note}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default UrlCard
