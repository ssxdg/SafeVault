import React, { useState } from 'react'
import copyIcon from '../images/复制.png'

function AccountCard({ account, onEdit, onDelete, onIncrementUse, showStatus, onConfirm }) {
  const [showPassword, setShowPassword] = useState(false)

  const copy = (text, label) => {
    if (!text) return
    // 剪贴板写入可能被系统权限拒绝，失败时必须提示，避免用户误判敏感信息已复制。
    navigator.clipboard.writeText(text)
      .then(() => {
        showStatus(`已复制${label}到剪贴板`)
        onIncrementUse?.()
      })
      .catch(() => showStatus(`复制${label}失败`))
  }

  const openLoginUrl = async (e) => {
    e.stopPropagation()
    if (!account.loginUrl) return
    if (window.electronAPI?.openUrl) {
      const result = await window.electronAPI.openUrl(account.loginUrl)
      if (result?.success === false) {
        showStatus(result.error || '无法打开链接')
        return
      }
      onIncrementUse?.()
      return
    }

    // 浏览器调试环境没有 Electron 主进程，按同样的 http/https 白名单进行兜底打开。
    try {
      const parsed = new URL(account.loginUrl.includes('://') ? account.loginUrl : `https://${account.loginUrl}`)
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
      title: '删除账号密码',
      message: `确定要删除「${account.accountName || '此账号'}」吗？`,
      detail: '删除后该账号密码记录将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, onDelete)
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
              onClick={openLoginUrl}
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
