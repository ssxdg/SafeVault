import React, { useState, useRef } from 'react'
import { Table, Button, Space, Popconfirm } from 'antd'
import AccountCard from './AccountCard'
import UrlCard from './UrlCard'
import Modal from './Modal'

function ContentArea({
  tab,
  onAddAccount, onUpdateAccount, onDeleteAccount,
  onAddUrl, onUpdateUrl, onDeleteUrl,
  onIncrementAccountUse, onIncrementUrlUse,
  showStatus,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('card') // 'card' | 'list'
  const [modal, setModal] = useState(null)
  // modal shape: { type: 'account'|'url', mode: 'add'|'edit', data: {} }

  if (!tab) {
    return (
      <div className="content-area content-empty-state">
        <p>请选择或创建一个标签</p>
      </div>
    )
  }

  const q = searchQuery.toLowerCase()

  // Stable sort order: only recompute when tab or search changes, not on every useCount increment
  const sortOrderRef = useRef({ accountIds: [], urlIds: [] })
  const prevTabIdRef = useRef(tab?.id)
  const prevSearchRef = useRef(searchQuery)

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

  const copy = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => showStatus(`已复制${label}到剪贴板`))
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
      render: (text) => text ? (
        <a 
          href="#" 
          onClick={(e) => {
            e.preventDefault()
            if (window.electronAPI) window.electronAPI.openUrl(text)
            else window.open(text, '_blank', 'noopener')
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
            onClick={() => copy(record.username, '账号')}
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
            onClick={() => copy(record.password, '密码')}
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
          <Popconfirm
            title="确定要删除这个账号吗？"
            onConfirm={() => onDeleteAccount(record.id)}
            okText="确定"
            cancelText="取消"
            placement="topRight"
          >
            <Button 
              type="link"
              size="small"
              danger
              icon={<span>🗑️</span>}
              title="删除"
              style={{ padding: '0 4px', height: '24px', fontSize: '12px' }}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
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
                <div className="card-grid">
                  {filteredUrls.map(url => (
                    <UrlCard
                      key={url.id}
                      urlItem={url}
                      onEdit={() => setModal({ type: 'url', mode: 'edit', data: url })}
                      onDelete={() => onDeleteUrl(url.id)}
                      onIncrementUse={() => onIncrementUrlUse(url.id)}
                      showStatus={showStatus}
                    />
                  ))}
                </div>
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
