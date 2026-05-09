import React, { useState } from 'react'
import copyIcon from '../images/复制.png'

function AccountCard({ account, onEdit, onDelete, showStatus }) {
  const [showPassword, setShowPassword] = useState(false)

  const copy = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => showStatus(`已复制${label}到剪贴板`))
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm(`确定要删除「${account.accountName || '此账号'}」吗？`)) {
      onDelete()
    }
  }

  return (
    <div className="card account-card">
      <div className="card-header">
        <span className="card-title">{account.accountName || '未命名账号'}</span>
        <div className="card-actions">
          <button className="icon-btn" onClick={onEdit} title="编辑">✏️</button>
          <button className="icon-btn delete-btn" onClick={handleDelete} title="删除">🗑️</button>
        </div>
      </div>
      <div className="card-body">
        {account.username && (
          <div className="card-row">
            <span className="row-label">账号</span>
            <span
              className="row-value copyable"
              title={account.username}
              onDoubleClick={() => copy(account.username, '账号')}
            >
              {account.username}
            </span>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(account.username, '账号') }}
              title="复制账号"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {account.password && (
          <div className="card-row">
            <span className="row-label">密码</span>
            <span
              className="row-value copyable"
              onDoubleClick={() => copy(account.password, '密码')}
            >
              {showPassword ? account.password : '••••••••'}
            </span>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); setShowPassword(v => !v) }}
              title={showPassword ? '隐藏' : '显示'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(account.password, '密码') }}
              title="复制密码"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {account.email && (
          <div className="card-row">
            <span className="row-label">邮箱</span>
            <span
              className="row-value copyable"
              title={account.email}
              onDoubleClick={() => copy(account.email, '邮箱')}
            >
              {account.email}
            </span>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(account.email, '邮箱') }}
              title="复制邮箱"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {account.loginUrl && (
          <div className="card-row">
            <span className="row-label">网址</span>
            <span
              className="row-value url-link"
              onClick={(e) => { e.stopPropagation(); if (window.electronAPI) window.electronAPI.openUrl(account.loginUrl); else window.open(account.loginUrl, '_blank', 'noopener') }}
              onDoubleClick={() => copy(account.loginUrl, '网址')}
              title={account.loginUrl}
            >
              {account.loginUrl}
            </span>
            <button
              className="copy-btn"
              onClick={(e) => { e.stopPropagation(); copy(account.loginUrl, '网址') }}
              title="复制网址"
            >
              <img src={copyIcon} alt="复制" />
            </button>
          </div>
        )}
        {account.note && (
          <div className="card-row note-row">
            <span className="row-label">备注</span>
            <span className="row-value note-value">{account.note}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default AccountCard
