import React, { useState, useRef } from 'react'
import { Table, Button, Space } from 'antd'
import AccountCard from './AccountCard'
import UrlCard from './UrlCard'
import Modal from './Modal'

function ContentArea({
  tab,
  onAddAccount, onUpdateAccount, onDeleteAccount,
  onAddUrl, onUpdateUrl, onDeleteUrl,
  onIncrementAccountUse, onIncrementUrlUse,
  showStatus,
  onConfirm,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('card') // 'card' | 'list'
  const [modal, setModal] = useState(null)
  // modal shape: { type: 'account'|'url', mode: 'add'|'edit', data: {} }
  // 排序快照必须在任何条件返回前创建，保证标签被删除到空状态时 React hook 顺序仍保持稳定。
  const sortOrderRef = useRef({ accountIds: [], urlIds: [] })
  const prevTabIdRef = useRef(tab?.id)
  const prevSearchRef = useRef(searchQuery)

  if (!tab) {
    return (
      <div className="content-area content-empty-state">
        <p>请选择或创建一个标签</p>
      </div>
    )
  }

  const q = searchQuery.toLowerCase()

  // Stable sort order: only recompute when tab or search changes, not on every useCount increment
  if (prevTabIdRef.current !== tab?.id || prevSearchRef.current !== searchQuery) {
    prevTabIdRef.current = tab?.id
    prevSearchRef.current = searchQuery
    sortOrderRef.current.accountIds = [...(tab.accounts || [])]
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .map(a => a.id)
    sortOrderRef.current.urlIds = [...(tab.urls || [])]
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .map(u => u.id)
  }

  const sortByStableOrder = (orderIds) => (a, b) => {
    const idxA = orderIds.indexOf(a.id)
    const idxB = orderIds.indexOf(b.id)
    if (idxA === -1 && idxB === -1) return 0
    if (idxA === -1) return -1
    if (idxB === -1) return 1
    return idxA - idxB
  }

  const filteredAccounts = (tab.accounts || [])
    .filter(a =>
      !q ||
      a.accountName?.toLowerCase().includes(q) ||
      a.username?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.note?.toLowerCase().includes(q)
    )
    .sort(sortByStableOrder(sortOrderRef.current.accountIds))

  const filteredUrls = (tab.urls || [])
    .filter(u =>
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.url?.toLowerCase().includes(q) ||
      u.note?.toLowerCase().includes(q)
    )
    .sort(sortByStableOrder(sortOrderRef.current.urlIds))

  const handleModalSave = (formData) => {
    if (modal.type === 'account') {
      if (modal.mode === 'add') onAddAccount(formData)
      else onUpdateAccount(modal.data.id, formData)
    } else {
      if (modal.mode === 'add') onAddUrl(formData)
      else onUpdateUrl(modal.data.id, formData)
    }
    setModal(null)
  }

  const copy = (text, label, onCopied) => {
    if (!text) return
    // 剪贴板 API 可能因系统权限失败，失败时给出状态提示，避免用户误以为已经复制成功。
    navigator.clipboard.writeText(text)
      .then(() => {
        showStatus(`已复制${label}到剪贴板`)
        onCopied?.()
      })
      .catch(() => showStatus(`复制${label}失败`))
  }

  const openExternalUrl = async (url, onOpened) => {
    if (!url) return
    if (window.electronAPI?.openUrl) {
      const result = await window.electronAPI.openUrl(url)
      if (result?.success === false) {
        showStatus(result.error || '无法打开链接')
        return
      }
      onOpened?.()
      return
    }

    // 浏览器调试环境没有 Electron 主进程，仍按 http/https 白名单打开，保持和桌面端行为接近。
    try {
      const parsed = new URL(url.includes('://') ? url : `https://${url}`)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol')
      window.open(parsed.toString(), '_blank', 'noopener')
      onOpened?.()
    } catch {
      showStatus('仅支持 http/https 链接')
    }
  }

  const confirmDeleteAccount = (account, onDelete) => {
    onConfirm({
      title: '删除账号密码',
      message: `确定要删除「${account.accountName || '此账号'}」吗？`,
      detail: '删除后该账号密码记录将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, onDelete)
  }

  const confirmDeleteUrl = (urlItem, onDelete) => {
    onConfirm({
      title: '删除网址',
      message: `确定要删除「${urlItem.name || '此网址'}」吗？`,
      detail: '删除后该网址记录将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, onDelete)
  }

  const accountColumns = [
    {
      title: '账户名称',
      dataIndex: 'accountName',
      key: 'accountName',
      width: 120,
      ellipsis: true,
      render: (text) => text || '未命名账号'
    },
    {
      title: '账号',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '密码',
      dataIndex: 'password',
      key: 'password',
      width: 100,
      ellipsis: true,
      render: (text) => text ? '••••••••' : '-'
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 160,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '登录网址',
      dataIndex: 'loginUrl',
      key: 'loginUrl',
      width: 200,
      ellipsis: true,
      render: (text, record) => text ? (
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault()
            openExternalUrl(text, () => onIncrementAccountUse(record.id))
          }}
          style={{ color: '#2563EB', textDecoration: 'none' }}
          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
        >
          {text}
        </a>
      ) : '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button 
            type="link"
            size="small"
            icon={<span>📋</span>}
            onClick={() => copy(record.username, '账号', () => onIncrementAccountUse(record.id))}
            disabled={!record.username}
            title="复制账号"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            账号
          </Button>
          <Button 
            type="link"
            size="small"
            icon={<span>🔑</span>}
            onClick={() => copy(record.password, '密码', () => onIncrementAccountUse(record.id))}
            disabled={!record.password}
            title="复制密码"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            密码
          </Button>
          <Button 
            type="link"
            size="small"
            icon={<span>✏️</span>}
            onClick={() => setModal({ type: 'account', mode: 'edit', data: record })}
            title="编辑"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<span>🗑️</span>}
            title="删除"
            onClick={() => confirmDeleteAccount(record, () => onDeleteAccount(record.id))}
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  // 网址列表视图与账号列表视图保持同一套交互能力：打开、复制、编辑、删除和使用次数统计都可用。
  const urlColumns = [
    {
      title: '网站名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      ellipsis: true,
      render: (text) => text || '未命名网址',
    },
    {
      title: '网址',
      dataIndex: 'url',
      key: 'url',
      width: 260,
      ellipsis: true,
      render: (text, record) => text ? (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            openExternalUrl(text, () => onIncrementUrlUse(record.id))
          }}
          style={{ color: '#2563EB', textDecoration: 'none' }}
          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
        >
          {text}
        </a>
      ) : '-',
    },
    {
      title: 'Token / Key',
      dataIndex: 'token',
      key: 'token',
      width: 160,
      ellipsis: true,
      render: (text) => text ? '••••••••' : '-',
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      width: 180,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<span>🔗</span>}
            onClick={() => openExternalUrl(record.url, () => onIncrementUrlUse(record.id))}
            disabled={!record.url}
            title="打开网址"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            打开
          </Button>
          <Button
            type="link"
            size="small"
            icon={<span>📋</span>}
            onClick={() => copy(record.url, '网址', () => onIncrementUrlUse(record.id))}
            disabled={!record.url}
            title="复制网址"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            网址
          </Button>
          <Button
            type="link"
            size="small"
            icon={<span>🔑</span>}
            onClick={() => copy(record.token, 'Token', () => onIncrementUrlUse(record.id))}
            disabled={!record.token}
            title="复制 Token"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            Token
          </Button>
          <Button
            type="link"
            size="small"
            icon={<span>✏️</span>}
            onClick={() => setModal({ type: 'url', mode: 'edit', data: record })}
            title="编辑"
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<span>🗑️</span>}
            title="删除"
            onClick={() => confirmDeleteUrl(record, () => onDeleteUrl(record.id))}
            style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const hasContent = filteredAccounts.length > 0 || filteredUrls.length > 0

  return (
    <div className="content-area">
      <div className="content-header">
        <input
          className="search-input"
          type="text"
          placeholder="搜索账号、网址..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'card' ? 'active' : ''}`}
            onClick={() => setViewMode('card')}
            title="卡片视图"
          >
            📇
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="列表视图"
          >
            📋
          </button>
        </div>
        <div className="content-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ type: 'account', mode: 'add', data: {} })}
          >
            + 账号密码
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setModal({ type: 'url', mode: 'add', data: {} })}
          >
            + 网址
          </button>
        </div>
      </div>

      <div className="content-scroll">
        {!hasContent ? (
          <div className="content-no-results">
            {searchQuery ? '没有找到匹配的内容' : '暂无数据，点击右上角按钮添加'}
          </div>
        ) : (
          <>
            {filteredAccounts.length > 0 && (
              <div className="card-section">
                <div className="section-title">账号密码</div>
                {viewMode === 'card' ? (
                  <div className="card-grid">
                    {filteredAccounts.map(acc => (
                      <AccountCard
                        key={acc.id}
                        account={acc}
                        viewMode={viewMode}
                        onEdit={() => setModal({ type: 'account', mode: 'edit', data: acc })}
                        onDelete={() => onDeleteAccount(acc.id)}
                        onIncrementUse={() => onIncrementAccountUse(acc.id)}
                        showStatus={showStatus}
                        onConfirm={onConfirm}
                      />
                    ))}
                  </div>
                ) : (
                  <Table
                    columns={accountColumns}
                    dataSource={filteredAccounts}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 1000 }}
                    style={{ fontSize: '13px' }}
                  />
                )}
              </div>
            )}
            {filteredUrls.length > 0 && (
              <div className="card-section">
                <div className="section-title">网址</div>
                {viewMode === 'card' ? (
                  <div className="card-grid">
                    {filteredUrls.map(url => (
                      <UrlCard
                        key={url.id}
                        urlItem={url}
                        onEdit={() => setModal({ type: 'url', mode: 'edit', data: url })}
                        onDelete={() => onDeleteUrl(url.id)}
                        onIncrementUse={() => onIncrementUrlUse(url.id)}
                        showStatus={showStatus}
                        onConfirm={onConfirm}
                      />
                    ))}
                  </div>
                ) : (
                  <Table
                    columns={urlColumns}
                    dataSource={filteredUrls}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 1100 }}
                    style={{ fontSize: '13px' }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {modal && (
        <Modal modal={modal} onSave={handleModalSave} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

export default ContentArea
