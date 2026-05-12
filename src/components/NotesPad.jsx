import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

function normalizeToDelta(content) {
  if (!content) return { ops: [{ insert: '\n' }] }
  if (typeof content === 'object' && Array.isArray(content.ops)) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.ops)) return parsed
    } catch {}
    return { ops: [{ insert: content + '\n' }] }
  }
  return { ops: [{ insert: '\n' }] }
}

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link'],
  ['clean'],
]

const TOOLBAR_TITLES = [
  ['.ql-header', '段落格式'],
  ['.ql-bold', '粗体（Ctrl+B）'],
  ['.ql-italic', '斜体（Ctrl+I）'],
  ['.ql-underline', '下划线（Ctrl+U）'],
  ['.ql-color .ql-picker-label', '文字颜色'],
  ['.ql-background .ql-picker-label', '文字高亮'],
  ['.ql-list[value="ordered"]', '有序列表'],
  ['.ql-list[value="bullet"]', '无序列表'],
  ['.ql-blockquote', '引用块'],
  ['.ql-code-block', '代码块'],
  ['.ql-link', '插入链接'],
  ['.ql-clean', '清除格式'],
]

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
  const [delta, setDelta] = useState(() => normalizeToDelta(activeNote?.content))
  const [saved, setSaved] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const timerRef = useRef(null)
  const pendingSaveRef = useRef(null)
  const quillRef = useRef(null)
  const renameInputRef = useRef(null)
  const activeNoteIdRef = useRef(activeNote?.id)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    activeNoteIdRef.current = activeNote?.id
    setDelta(normalizeToDelta(activeNote?.content))
    setSaved(true)
  }, [activeNote?.id])

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

  const handleChange = useCallback((content, delta, source, editor) => {
    if (!activeNoteIdRef.current) return
    const currentDelta = editor.getContents()
    setDelta(currentDelta)
    scheduleSave(activeNoteIdRef.current, currentDelta)
  }, [scheduleSave])

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

  const modules = useMemo(() => ({
    toolbar: TOOLBAR_OPTIONS,
  }), [])

  const handleQuillRef = useCallback((el) => {
    quillRef.current = el
    if (!el) return
    setTimeout(() => {
      const quill = el.getEditor?.()
      if (!quill) return
      if (quill.root) {
        quill.root.setAttribute('spellcheck', 'false')
        quill.root.spellcheck = false
      }
      const toolbar = quill.getModule('toolbar')
      if (toolbar?.container) {
        TOOLBAR_TITLES.forEach(([selector, title]) => {
          const el = toolbar.container.querySelector(selector)
          if (el) el.setAttribute('title', title)
        })
      }
    }, 0)
  }, [])

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
      <div className="notepad-editor-wrap">
        <ReactQuill
          key={activeNote?.id}
          ref={handleQuillRef}
          theme="snow"
          value={delta}
          onChange={handleChange}
          modules={modules}
          placeholder="在此输入笔记内容..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}

export default NotesPad