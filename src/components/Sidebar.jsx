import React, { useState, useRef } from 'react'

function Sidebar({ tabs, activeTabId, activeSection, onTabSelect, onNotesSelect, onTabAdd, onTabDelete, onTabRename, onTabReorder, onConfirm }) {
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const dragIndexRef = useRef(null)
  const renameInputRef = useRef(null)
  const newTabInputRef = useRef(null)

  const handleDoubleClick = (e, tab) => {
    e.stopPropagation()
    setEditingId(tab.id)
    setEditingName(tab.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingName.trim()) onTabRename(editingId, editingName.trim())
    setEditingId(null)
  }

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setEditingId(null)
  }

  const handleAddClick = () => {
    setShowNewInput(true)
    setNewTabName('')
    setTimeout(() => newTabInputRef.current?.focus(), 0)
  }

  const commitNewTab = () => {
    if (newTabName.trim()) onTabAdd(newTabName.trim())
    setShowNewInput(false)
    setNewTabName('')
  }

  const handleNewTabKeyDown = (e) => {
    if (e.key === 'Enter') commitNewTab()
    if (e.key === 'Escape') { setShowNewInput(false); setNewTabName('') }
  }

  const handleDelete = (e, tabId) => {
    e.stopPropagation()
    const tab = tabs.find(t => t.id === tabId)
    onConfirm({
      title: '删除标签',
      message: `确定要删除「${tab?.name || '此标签'}」吗？`,
      detail: '该标签下的账号密码和网址数据也会一起删除，此操作无法撤销。',
      confirmText: '删除',
      type: 'warning',
    }, () => onTabDelete(tabId))
  }

  // Drag & Drop for reorder
  const handleDragStart = (e, index) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (dragIndexRef.current !== index) setDragOverIndex(index)
  }

  const handleDrop = (e, index) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) { setDragOverIndex(null); return }
    const newTabs = [...tabs]
    const [moved] = newTabs.splice(from, 1)
    newTabs.splice(index, 0, moved)
    onTabReorder(newTabs)
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <div
          className={`sidebar-tab sidebar-notes-btn${activeSection === 'notes' ? ' active' : ''}`}
          onClick={onNotesSelect}
        >
          <span className="tab-name">记事本</span>
        </div>
        <div className="sidebar-divider" />
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`sidebar-tab${activeSection === 'tabs' && activeTabId === tab.id ? ' active' : ''}${dragOverIndex === index ? ' drag-over' : ''}`}
            onClick={() => { if (editingId !== tab.id) onTabSelect(tab.id) }}
            onDoubleClick={(e) => handleDoubleClick(e, tab)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {editingId === tab.id ? (
              <input
                ref={renameInputRef}
                className="tab-rename-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="tab-name">{tab.name}</span>
                <button
                  className="tab-delete-btn"
                  onClick={(e) => handleDelete(e, tab.id)}
                  title="删除标签"
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        {showNewInput ? (
          <div className="new-tab-input-wrap">
            <input
              ref={newTabInputRef}
              className="new-tab-input"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onBlur={commitNewTab}
              onKeyDown={handleNewTabKeyDown}
              placeholder="输入标签名称"
            />
          </div>
        ) : (
          <button className="add-tab-btn" onClick={handleAddClick}>
            + 添加标签
          </button>
        )}
      </div>
    </div>
  )
}

export default Sidebar
