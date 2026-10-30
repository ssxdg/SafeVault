import React, { useState } from 'react'
import copyIcon from '../images/复制.png'

function SingleAccountCard({ account, compact = false, groupName = '', onEdit, onAddAnother, onDelete, onIncrementUse, showStatus, onConfirm }) {
  const [showPassword, setShowPassword] = useState(false)

  const copy = async (text, label) => {
    if (!text) return
    try {
      const result = window.electronAPI?.copySecret
        ? await window.electronAPI.copySecret(text)
        : await navigator.clipboard.writeText(text).then(() => ({ success: true }))
      if (result?.success === false) throw new Error(result.error)
      showStatus(`已复制${label}，30 秒后自动清理`)
      onIncrementUse?.()
    } catch {
      showStatus(`复制${label}失败`)
    }
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
      message: `确定要删除「${account.accountName || '此账号'}${account.username ? `（${account.username}）` : ''}」吗？`,
      detail: '删除后该账号密码记录将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, onDelete)
  }

  return (
    <div className={compact ? 'account-entry' : 'card account-card'}>
      <div className="card-header">
        <span className="card-title">{compact
          ? `${account.accountName !== groupName ? `${account.accountName || '未命名账号'} · ` : ''}${account.username || '无用户名'}`
          : (account.accountName || '未命名账号')}</span>
        <div className="card-actions">
          {compact && account.username && <button className="icon-btn" onClick={() => copy(account.username, '账号')} title="复制账号" aria-label="复制账号"><img className="account-action-copy-icon" src={copyIcon} alt="" /></button>}
          {!compact && account.loginUrl && <button className="icon-btn" onClick={onAddAnother} title="添加同站账号" aria-label="添加同站账号">＋</button>}
          <button className="icon-btn" onClick={onEdit} title="编辑">✏️</button>
          <button className="icon-btn delete-btn" onClick={handleDelete} title="删除">🗑️</button>
        </div>
      </div>
      <div className="card-body">
        {!compact && account.username && (
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
        {!compact && account.loginUrl && (
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

function AccountCard({ accounts, onEdit, onAddAnother, onDelete, onIncrementUse, showStatus, onConfirm }) {
  const primary = accounts[0]
  const openGroupUrl = async () => {
    if (window.electronAPI?.openUrl) {
      const result = await window.electronAPI.openUrl(primary.loginUrl)
      if (result?.success === false) {
        showStatus(result.error || '无法打开链接')
        return
      }
    } else {
      window.open(primary.loginUrl, '_blank', 'noopener')
    }
    onIncrementUse(primary)
  }
  const copyGroupUrl = async () => {
    try {
      const result = window.electronAPI?.copySecret
        ? await window.electronAPI.copySecret(primary.loginUrl)
        : await navigator.clipboard.writeText(primary.loginUrl).then(() => ({ success: true }))
      if (result?.success === false) throw new Error(result.error)
      showStatus('已复制网址，30 秒后自动清理')
      onIncrementUse(primary)
    } catch {
      showStatus('复制网址失败')
    }
  }
  const renderAccount = (account, compact) => (
    <SingleAccountCard
      key={account.id}
      account={account}
      compact={compact}
      groupName={primary.accountName}
      onEdit={() => onEdit(account)}
      onAddAnother={onAddAnother}
      onDelete={() => onDelete(account)}
      onIncrementUse={() => onIncrementUse(account)}
      showStatus={showStatus}
      onConfirm={onConfirm}
    />
  )

  if (accounts.length === 1) return renderAccount(primary, false)

  return (
    <div className="card account-group-card">
      <div className="card-header">
        <span className="card-title">{primary.accountName || '未命名账号'}</span>
        <div className="card-actions">
          <span className="account-group-count">{accounts.length} 个账号</span>
          <button className="icon-btn" onClick={onAddAnother} title="添加同站账号" aria-label="添加同站账号">＋</button>
        </div>
      </div>
      <div className="account-group-items">
        {accounts.map(account => renderAccount(account, true))}
      </div>
      <div className="account-group-url">
        <span className="row-label">网址</span>
        <button className="account-group-url-link" onClick={openGroupUrl} title={primary.loginUrl}>{primary.loginUrl}</button>
        <button className="copy-btn" onClick={copyGroupUrl} title="复制网址" aria-label="复制网址">
          <img src={copyIcon} alt="" />
        </button>
      </div>
    </div>
  )
}

export default AccountCard
