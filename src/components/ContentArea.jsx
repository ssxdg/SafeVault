import React, { useState } from 'react'
import AccountCard from './AccountCard'
import UrlCard from './UrlCard'
import Modal from './Modal'

function ContentArea({
  tab,
  onAddAccount, onUpdateAccount, onDeleteAccount,
  onAddUrl, onUpdateUrl, onDeleteUrl,
  showStatus,
}) {
  const [searchQuery, setSearchQuery] = useState('')
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
  const filteredAccounts = (tab.accounts || []).filter(a =>
    !q ||
    a.accountName?.toLowerCase().includes(q) ||
    a.username?.toLowerCase().includes(q) ||
    a.email?.toLowerCase().includes(q) ||
    a.note?.toLowerCase().includes(q)
  )
  const filteredUrls = (tab.urls || []).filter(u =>
    !q ||
    u.name?.toLowerCase().includes(q) ||
    u.url?.toLowerCase().includes(q) ||
    u.note?.toLowerCase().includes(q)
  )

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
                <div className="card-grid">
                  {filteredAccounts.map(acc => (
                    <AccountCard
                      key={acc.id}
                      account={acc}
                      onEdit={() => setModal({ type: 'account', mode: 'edit', data: acc })}
                      onDelete={() => onDeleteAccount(acc.id)}
                      showStatus={showStatus}
                    />
                  ))}
                </div>
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
