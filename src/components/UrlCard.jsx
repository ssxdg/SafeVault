import React, { useState } from 'react'
import copyIcon from '../images/复制.png'

function UrlCard({ urlItem, onEdit, onDelete, onIncrementUse, showStatus, onConfirm }) {
  const [showToken, setShowToken] = useState(false)

  const copy = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      showStatus(`已复制${label}到剪贴板`)
      onIncrementUse?.()
    })
  }

  const openUrl = (e) => {
    e.stopPropagation()
    if (!urlItem.url) return
    onIncrementUse?.()
    if (window.electronAPI) {
      window.electronAPI.openUrl(urlItem.url)
    } else {
      window.open(urlItem.url, '_blank', 'noopener')
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
