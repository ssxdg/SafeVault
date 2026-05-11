import React, { useState, useEffect, useRef, useCallback } from 'react'

function NotesPad({
  notepads,
  activeNotepadId,
  onSelectNotepad,
  onAddNotepad,
  onRenameNotepad,
  onUpdateNotepadContent,
  onDeleteNotepad,
  onConfirm,
  onAlert,
}) {
  const activeNote = notepads.find(note => note.id === activeNotepadId) || notepads[0]
  const [text, setText] = useState(activeNote?.content || '')
  const [saved, setSaved] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const timerRef = useRef(null)
  const pendingSaveRef = useRef(null)
  const textareaRef = useRef(null)
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setText(activeNote?.content || '')
    setSaved(true)
  }, [activeNote?.id, activeNote?.content])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleSave = useCallback((noteId, value) => {
    setSaved(false)
    pendingSaveRef.current = { noteId, value }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onUpdateNotepadContent(noteId, value)
      pendingSaveRef.current = null
      timerRef.current = null
      setSaved(true)
    }, 800)
  }, [onUpdateNotepadContent])

  const flushPendingSave = useCallback(() => {
    if (!pendingSaveRef.current) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const { noteId, value } = pendingSaveRef.current
    pendingSaveRef.current = null
    onUpdateNotepadContent(noteId, value)
    setSaved(true)
  }, [onUpdateNotepadContent])

  useEffect(() => {
    return () => flushPendingSave()
  }, [flushPendingSave])

  const handleChange = (e) => {
    if (!activeNote) return
    const value = e.target.value
    setText(value)
    scheduleSave(activeNote.id, value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea || !activeNote) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newText = text.substring(0, start) + '  ' + text.substring(end)
      setText(newText)
      scheduleSave(activeNote.id, newText)
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      }, 0)
    }
  }

  const startRename = (e, note) => {
    e.stopPropagation()
    setEditingId(note.id)
    setEditingName(note.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      onRenameNotepad(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') {
      setEditingId(null)
      setEditingName('')
    }
  }

  const handleSelectNote = (noteId) => {
    if (noteId !== activeNote?.id) flushPendingSave()
    onSelectNotepad(noteId)
  }

  const handleAddNote = () => {
    flushPendingSave()
    onAddNotepad()
  }

  const handleDelete = (e, noteId) => {
    e.stopPropagation()
    if (notepads.length <= 1) {
      onAlert({
        type: 'info',
        title: '无法删除',
        message: '至少需要保留一个记事本。',
        detail: '你可以清空当前内容，或重命名为新的记事本。',
      })
      return
    }
    onConfirm({
      title: '删除记事本',
      message: '确定要删除此记事本吗？',
      detail: '删除后该记事本中的内容将无法恢复。',
      confirmText: '删除',
      type: 'warning',
    }, () => {
      flushPendingSave()
      onDeleteNotepad(noteId)
    })
  }

  return (
    <div className="notepad">
      <div className="notepad-tabbar">
        <div className="notepad-tabs">
          {notepads.map(note => (
            <div
              key={note.id}
              className={`notepad-tab${activeNote?.id === note.id ? ' active' : ''}`}
              onClick={() => handleSelectNote(note.id)}
              onDoubleClick={(e) => startRename(e, note)}
              title="双击重命名"
            >
              {editingId === note.id ? (
                <input
                  ref={renameInputRef}
                  className="notepad-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="notepad-tab-name">{note.name}</span>
                  <button
                    className="notepad-tab-close"
                    onClick={(e) => handleDelete(e, note.id)}
                    title="删除记事本"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
          <button className="notepad-add-tab" onClick={handleAddNote} title="新建记事本">
            +
          </button>
        </div>
        <span className={`notepad-status${saved ? ' saved' : ''}`}>
          {saved ? '已保存' : '未保存'}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        className="notepad-textarea"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="在此输入笔记内容..."
        spellCheck={false}
      />
    </div>
  )
}

export default NotesPad