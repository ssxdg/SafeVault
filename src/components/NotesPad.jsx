import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

const Quill = ReactQuill.Quill
const BlockEmbed = Quill.import('blots/block/embed')

// 分割线作为独立文档块保存，继续沿用现有 Delta 数据格式。
class DividerBlot extends BlockEmbed {}
DividerBlot.blotName = 'divider'
DividerBlot.tagName = 'HR'
Quill.register(DividerBlot)

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
  [{ header: [1, 2, 3, 4, 5, 6, false] }, { size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike', 'code'],
  [{ color: [] }, { background: [] }],
  [{ script: 'super' }, { script: 'sub' }],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ align: [] }, { indent: '-1' }, { indent: '+1' }],
  ['blockquote', 'code-block', 'divider', 'table'],
  ['link'],
  ['clean'],
]

const TOOLBAR_TITLES = [
  ['.ql-header', '段落格式'],
  ['.ql-bold', '粗体（Ctrl+B）'],
  ['.ql-italic', '斜体（Ctrl+I）'],
  ['.ql-underline', '下划线（Ctrl+U）'],
  ['.ql-strike', '删除线（Ctrl+Shift+X）'],
  ['.ql-code', '行内代码（Ctrl+E）'],
  ['.ql-size .ql-picker-label', '字号'],
  ['.ql-color .ql-picker-label', '文字颜色'],
  ['.ql-background .ql-picker-label', '文字高亮'],
  ['.ql-script[value="super"]', '上标'],
  ['.ql-script[value="sub"]', '下标'],
  ['.ql-list[value="ordered"]', '有序列表（Ctrl+Shift+7）'],
  ['.ql-list[value="bullet"]', '无序列表（Ctrl+Shift+8）'],
  ['.ql-list[value="check"]', '任务列表（Alt+Ctrl+T）'],
  ['.ql-align .ql-picker-label', '对齐方式'],
  ['.ql-indent[value="-1"]', '减少缩进（Ctrl+[）'],
  ['.ql-indent[value="+1"]', '增加缩进（Ctrl+]）'],
  ['.ql-blockquote', '引用块（Ctrl+Shift+U）'],
  ['.ql-code-block', '代码块'],
  ['.ql-divider', '插入分割线（Alt+Ctrl+S）'],
  ['.ql-table', '选择表格行数和列数（Ctrl+Shift+T）'],
  ['.ql-link', '插入链接'],
  ['.ql-clean', '清除格式'],
]

const MARKDOWN_CHOICES = [
  ...Array.from({ length: 6 }, (_, index) => ({ syntax: '#'.repeat(index + 1) + ' ', label: (index + 1) + ' 级标题' })),
  { syntax: '- ', label: '无序列表' },
  { syntax: '* ', label: '无序列表' },
  { syntax: '1. ', label: '有序列表' },
  { syntax: '[ ] ', label: '任务列表' },
  { syntax: '> ', label: '引用' },
  { syntax: '\u0060\u0060\u0060', label: '代码块' },
  { syntax: '---', label: '分割线' },
  { syntax: '|列1|列2|', label: '表格（2 列）' },
]

const INLINE_MARKDOWN_CHOICES = {
  code: { syntax: '\u0060代码\u0060', label: '行内代码', mode: 'inline', marker: '\u0060', placeholder: '代码' },
  strike: { syntax: '~~文字~~', label: '删除线', mode: 'inline', marker: '~~', placeholder: '文字' },
}

const SHORTCUT_GROUPS = [
  { title: '格式', items: [
    { label: '标题 1～6', keys: 'Alt+Ctrl+1～6', markdown: '# ～ ######' },
    { label: '正文', keys: 'Alt+Ctrl+0' },
    { label: '粗体', keys: 'Ctrl+B', markdown: '**文字**' },
    { label: '斜体', keys: 'Ctrl+I', markdown: '*文字*' },
    { label: '下划线', keys: 'Ctrl+U' },
    { label: '删除线', keys: 'Ctrl+Shift+X', markdown: '~~文字~~' },
    { label: '行内代码', keys: 'Ctrl+E', markdown: '\u0060代码\u0060' },
    { label: '清除格式', keys: 'Ctrl+\\' },
    { label: '增加缩进', keys: 'Ctrl+]' },
    { label: '减少缩进', keys: 'Ctrl+[' },
  ] },
  { title: '插入', items: [
    { label: '有序列表', keys: 'Ctrl+Shift+7', markdown: '1. 文字' },
    { label: '无序列表', keys: 'Ctrl+Shift+8', markdown: '- 文字' },
    { label: '任务列表', keys: 'Alt+Ctrl+T', markdown: '[ ] 文字' },
    { label: '引用', keys: 'Ctrl+Shift+U', markdown: '> 文字' },
    { label: '代码块', markdown: '\u0060\u0060\u0060 + Enter' },
    { label: '分割线', keys: 'Alt+Ctrl+S', markdown: '--- + Enter' },
    { label: '插入表格（可选行列）', keys: 'Ctrl+Shift+T', markdown: '|列1|列2| + Enter' },
    { label: '链接', keys: 'Ctrl+K', markdown: '[文字](地址)' },
  ] },
  { title: '编辑', items: [
    { label: '撤销', keys: 'Ctrl+Z' },
    { label: '重做', keys: 'Ctrl+Shift+Z' },
    { label: '语法补全', keys: 'Tab', markdown: '输入 Markdown 标记' },
  ] },
]

function getMarkdownChoices(text) {
  if (!text) return []
  const choices = []
  // 行内语法可出现在一行的任意位置；候选只在尚未闭合的起始标记后显示。
  if (text.endsWith('\u0060') && (text.match(/\u0060/g) || []).length % 2 === 1) {
    choices.push(INLINE_MARKDOWN_CHOICES.code)
  }
  const tildePairs = (text.match(/~~/g) || []).length
  if ((text.endsWith('~~') && tildePairs % 2 === 1) ||
      (text.endsWith('~') && !text.endsWith('~~') && tildePairs % 2 === 0)) {
    choices.push(INLINE_MARKDOWN_CHOICES.strike)
  }
  if (/\s/.test(text)) return choices
  return [...choices, ...MARKDOWN_CHOICES.filter(item => item.syntax.trimEnd().startsWith(text))]
}

function getMarkdownTable(text) {
  if (!/^\|.+\|$/.test(text)) return null
  const headers = text.slice(1, -1).split('|').map(value => value.trim())
  return headers.length >= 2 && headers.length <= 6 && headers.every(Boolean) ? headers : null
}

function getMarkdownBlock(text) {
  const heading = /^(#{1,6}) +(.*)$/.exec(text)
  if (heading) return { markerLength: text.length - heading[2].length, format: 'header', value: heading[1].length }
  const rules = [
    [/^(-|\*) +(.*)$/, 'list', 'bullet'],
    [/^\d+\. +(.*)$/, 'list', 'ordered'],
    [/^\[([ xX])\] +(.*)$/, 'list', 'unchecked'],
    [/^> +(.*)$/, 'blockquote', true],
  ]
  for (const [pattern, format, value] of rules) {
    const match = pattern.exec(text)
    if (match) return {
      markerLength: text.length - match[match.length - 1].length,
      format,
      value: format === 'list' && /^\[[xX]\]/.test(text) ? 'checked' : value,
    }
  }
  return null
}

function getLineContext(quill, range) {
  if (!range || range.length) return null
  const [line, offset] = quill.getLine(range.index)
  if (!line || !Number.isFinite(offset)) return null
  const start = range.index - offset
  return { start, offset, text: quill.getText(start, line.length() - 1) }
}

function convertInlineMarkdown(quill, start, text) {
  const pattern = /(\*\*|__|~~|\u0060|\*)(.+?)\1|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  const matches = [...text.matchAll(pattern)]
  let removed = 0
  // 从行尾向前替换，前面匹配项的位置不会因删除标记而偏移。
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index]
    const content = match[3] || match[2]
    const format = match[3] ? { link: match[4] } : ({
      '**': { bold: true }, '__': { bold: true }, '~~': { strike: true },
      '*': { italic: true }, '\u0060': { code: true },
    })[match[1]]
    if (!format || !content) continue
    quill.deleteText(start + match.index, match[0].length, 'user')
    quill.insertText(start + match.index, content, format, 'user')
    removed += match[0].length - content.length
  }
  return removed
}

function NotesPad({
  notepads,
  activeNotepadId,
  onSelectNotepad,
  onAddNotepad,
  onRenameNotepad,
  onUpdateNotepadContent,
  onDeleteNotepad,
  onReorderNotepads,
  onConfirm,
  onAlert,
}) {
  const activeNote = notepads.find(note => note.id === activeNotepadId) || notepads[0]
  const [delta, setDelta] = useState(() => normalizeToDelta(activeNote?.content))
  const [saved, setSaved] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [dragOverId, setDragOverId] = useState(null)
  const [markdownHint, setMarkdownHint] = useState(null)
  const [hintIndex, setHintIndex] = useState(0)
  const [isShortcutOpen, setIsShortcutOpen] = useState(false)
  const [tablePicker, setTablePicker] = useState(null)
  const [tableRows, setTableRows] = useState(2)
  const [tableColumns, setTableColumns] = useState(2)
  const [shortcutQuery, setShortcutQuery] = useState('')
  const timerRef = useRef(null)
  const pendingSaveRef = useRef(null)
  const quillRef = useRef(null)
  const tableRangeRef = useRef(null)
  const renameInputRef = useRef(null)
  const activeNoteIdRef = useRef(activeNote?.id)
  const dragIdRef = useRef(null)
  const editorWrapRef = useRef(null)
  const dismissedHintRef = useRef('')
  const hintKeyRef = useRef('')

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    activeNoteIdRef.current = activeNote?.id
    setDelta(normalizeToDelta(activeNote?.content))
    setSaved(true)
    setMarkdownHint(null)
    dismissedHintRef.current = ''
    hintKeyRef.current = ''
  }, [activeNote?.id])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleSave = useCallback((noteId, value) => {
    setSaved(false)
    pendingSaveRef.current = { noteId, value }
    // 先把最新编辑内容同步到 App 内存快照；磁盘写入仍由 App 层防抖，导出/退出前即可拿到最后一次输入。
    onUpdateNotepadContent(noteId, value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
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

  const refreshMarkdownHint = useCallback(() => {
    const quill = quillRef.current?.getEditor?.()
    const range = quill?.getSelection()
    const context = quill && getLineContext(quill, range)
    if (!context || context.offset !== context.text.length || quill.getFormat(range)['code-block']) {
      setMarkdownHint(null)
      return
    }
    const choices = getMarkdownChoices(context.text)
    const hintKey = context.start + ':' + context.text
    if (!choices.length || dismissedHintRef.current === hintKey) {
      setMarkdownHint(null)
      return
    }
    const bounds = quill.getBounds(range.index)
    const containerRect = quill.container.getBoundingClientRect()
    const wrapRect = editorWrapRef.current?.getBoundingClientRect()
    if (!bounds || !wrapRect) return
    if (hintKeyRef.current !== hintKey) setHintIndex(0)
    hintKeyRef.current = hintKey
    const preferredTop = containerRect.top - wrapRect.top + bounds.bottom + 6
    setMarkdownHint({
      key: hintKey,
      prefix: context.text,
      choices,
      left: Math.max(12, Math.min(containerRect.left - wrapRect.left + bounds.left, wrapRect.width - 250)),
      top: preferredTop + 280 > wrapRect.height
        ? Math.max(6, containerRect.top - wrapRect.top + bounds.top - 286)
        : preferredTop,
    })
  }, [])

  const insertDivider = useCallback((quill, index, deleteLength = 0) => {
    if (deleteLength) quill.deleteText(index, deleteLength, 'user')
    quill.insertEmbed(index, 'divider', true, 'user')
    quill.insertText(index + 1, '\n', 'user')
    quill.setSelection(index + 2, 0, 'silent')
  }, [])

  const insertTable = useCallback((quill, index, deleteLength = 0, headers = [], rows = 2, columns = headers.length || 2) => {
    const table = quill.getModule('table')
    if (!table) return
    if (deleteLength) quill.deleteText(index, deleteLength, 'user')
    quill.setSelection(index, 0, 'silent')
    table.insertTable(rows, columns)
    // 空表格单元格各占一个换行位置；从右向左写入表头可保持前面的索引不变。
    for (let column = headers.length - 1; column >= 0; column--) {
      quill.insertText(index + column, headers[column], 'user')
    }
    quill.setSelection(index + (headers[0]?.length || 0), 0, 'silent')
  }, [])

  const openTablePicker = useCallback((quill) => {
    const range = quill.getSelection(true)
    if (!range) return
    tableRangeRef.current = range
    setTableRows(2)
    setTableColumns(2)
    const wrap = editorWrapRef.current
    const button = wrap?.querySelector('.ql-toolbar .ql-table')
    const wrapRect = wrap?.getBoundingClientRect()
    const buttonRect = button?.getBoundingClientRect()
    setTablePicker({
      left: Math.max(8, Math.min((buttonRect?.left || wrapRect?.left || 0) - (wrapRect?.left || 0), (wrapRect?.width || 240) - 240)),
      top: (buttonRect?.bottom || wrapRect?.top || 0) - (wrapRect?.top || 0) + 5,
    })
    setMarkdownHint(null)
  }, [])

  const handleInsertSizedTable = (event) => {
    event.preventDefault()
    const rows = Number(tableRows)
    const columns = Number(tableColumns)
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 20 || columns < 1 || columns > 20) return
    const quill = quillRef.current?.getEditor?.()
    const range = tableRangeRef.current
    if (!quill || !range) return
    insertTable(quill, range.index, range.length, [], rows, columns)
    setTablePicker(null)
    quill.focus()
  }

  const completeMarkdownChoice = useCallback((choice) => {
    const quill = quillRef.current?.getEditor?.()
    const context = quill && getLineContext(quill, quill.getSelection())
    if (!context || context.offset !== context.text.length) return
    if (choice.mode === 'inline') {
      const typedLength = context.text.endsWith(choice.marker) ? choice.marker.length : 1
      const missingMarker = choice.marker.slice(typedLength)
      const insertion = missingMarker + choice.placeholder + choice.marker
      quill.insertText(context.start + context.offset, insertion, 'user')
      quill.setSelection(context.start + context.offset + missingMarker.length, choice.placeholder.length, 'silent')
      setMarkdownHint(null)
      return
    }
    quill.deleteText(context.start, context.text.length, 'user')
    quill.insertText(context.start, choice.syntax, 'user')
    quill.setSelection(context.start + choice.syntax.length, 0, 'silent')
    setMarkdownHint(null)
  }, [])

  const handleEditorKeyDown = useCallback((event) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    const quill = quillRef.current?.getEditor?.()
    if (!quill || !quill.root.contains(event.target)) return
    const range = quill.getSelection()
    if (!range) return
    const context = getLineContext(quill, range)
    const isCtrl = event.ctrlKey || event.metaKey
    const isAltCtrl = event.altKey && isCtrl && !event.shiftKey
    const stop = () => {
      event.preventDefault()
      event.stopPropagation()
    }
    if (event.key === 'Escape' && markdownHint) {
      dismissedHintRef.current = markdownHint.key
      setMarkdownHint(null)
      stop()
      return
    }
    if (markdownHint && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setHintIndex(index => (index + (event.key === 'ArrowDown' ? 1 : markdownHint.choices.length - 1)) % markdownHint.choices.length)
      stop()
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && !isCtrl && !event.altKey) {
      const choices = context?.offset === context?.text.length ? getMarkdownChoices(context.text) : []
      if (choices.length) {
        const choice = markdownHint?.prefix === context.text ? markdownHint.choices[hintIndex] : choices[0]
        completeMarkdownChoice(choice || choices[0])
      } else {
        // 没有语法候选时保留记事本原有的两个空格缩进习惯。
        quill.deleteText(range.index, range.length, 'user')
        quill.insertText(range.index, '  ', 'user')
        quill.setSelection(range.index + 2, 0, 'silent')
      }
      stop()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !isCtrl && !event.altKey && context?.offset === context.text.length) {
      const headers = getMarkdownTable(context.text)
      if (headers) {
        insertTable(quill, context.start, context.text.length, headers)
        setMarkdownHint(null)
        stop()
        return
      }
      if (context.text === '---') {
        insertDivider(quill, context.start, context.text.length)
        setMarkdownHint(null)
        stop()
        return
      }
      if (context.text === '\u0060\u0060\u0060') {
        quill.deleteText(context.start, context.text.length, 'user')
        quill.formatLine(context.start, 1, 'code-block', true, 'user')
        quill.setSelection(context.start, 0, 'silent')
        setMarkdownHint(null)
        stop()
        return
      }
      // 回车时移除 Markdown 标记并写入 Quill 格式；有正文则交给 Quill 继续创建下一行。
      const block = getMarkdownBlock(context.text)
      if (block) {
        quill.deleteText(context.start, block.markerLength, 'user')
        quill.formatLine(context.start, 1, block.format, block.value, 'user')
      }
      const plainText = block ? context.text.slice(block.markerLength) : context.text
      const removed = convertInlineMarkdown(quill, context.start, plainText)
      if (block || removed) {
        quill.setSelection(context.start + plainText.length - removed, 0, 'silent')
        setMarkdownHint(null)
        if (block && !plainText) {
          stop()
          return
        }
      }
      return
    }
    if (isAltCtrl && /^Digit[0-6]$/.test(event.code)) {
      const level = Number(event.code.slice(-1))
      quill.format('header', level || false, 'user')
      stop()
      return
    }
    if (isAltCtrl && event.code === 'KeyT') {
      quill.format('list', 'unchecked', 'user')
      stop()
      return
    }
    if (isAltCtrl && event.code === 'KeyS') {
      insertDivider(quill, range.index, range.length)
      stop()
      return
    }
    if (!isCtrl || event.altKey) return
    if (event.shiftKey && event.code === 'KeyX') {
      quill.format('strike', !quill.getFormat(range).strike, 'user')
    } else if (!event.shiftKey && event.code === 'KeyE') {
      quill.format('code', !quill.getFormat(range).code, 'user')
    } else if (event.shiftKey && event.code === 'Digit7') {
      quill.format('list', 'ordered', 'user')
    } else if (event.shiftKey && event.code === 'Digit8') {
      quill.format('list', 'bullet', 'user')
    } else if (event.shiftKey && event.code === 'KeyT') {
      openTablePicker(quill)
    } else if (event.shiftKey && event.code === 'KeyU') {
      quill.format('blockquote', !quill.getFormat(range).blockquote, 'user')
    } else if (!event.shiftKey && event.code === 'BracketRight') {
      const nextIndent = Math.min(8, Number(quill.getFormat(range).indent || 0) + 1)
      quill.format('indent', nextIndent, 'user')
    } else if (!event.shiftKey && event.code === 'BracketLeft') {
      const nextIndent = Math.max(0, Number(quill.getFormat(range).indent || 0) - 1)
      quill.format('indent', nextIndent || false, 'user')
    } else if (!event.shiftKey && event.code === 'Backslash') {
      const lineLength = quill.getLine(range.index)[0]?.length() || 1
      quill.removeFormat(range.length ? range.index : context.start, range.length || lineLength, 'user')
    } else {
      return
    }
    stop()
  }, [completeMarkdownChoice, hintIndex, insertDivider, insertTable, markdownHint, openTablePicker])

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

  const handleDragStart = (e, noteId) => {
    if (editingId === noteId) return
    dragIdRef.current = noteId
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, noteId) => {
    e.preventDefault()
    if (dragIdRef.current && dragIdRef.current !== noteId) {
      setDragOverId(noteId)
    }
  }

  const handleDrop = (e, targetId) => {
    e.preventDefault()
    const sourceId = dragIdRef.current
    dragIdRef.current = null
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return

    flushPendingSave()
    const nextNotepads = [...notepads]
    const fromIndex = nextNotepads.findIndex(note => note.id === sourceId)
    const toIndex = nextNotepads.findIndex(note => note.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const [moved] = nextNotepads.splice(fromIndex, 1)
    nextNotepads.splice(toIndex, 0, moved)
    onReorderNotepads?.(nextNotepads)
  }

  const handleDragEnd = () => {
    dragIdRef.current = null
    setDragOverId(null)
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
    table: true,
    toolbar: {
      container: TOOLBAR_OPTIONS,
      handlers: {
        divider() {
          const range = this.quill.getSelection(true)
          if (range) insertDivider(this.quill, range.index, range.length)
        },
        table() {
          openTablePicker(this.quill)
        },
      },
    },
  }), [insertDivider, openTablePicker])

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
      quill.on('text-change', () => requestAnimationFrame(refreshMarkdownHint))
      quill.on('selection-change', () => requestAnimationFrame(refreshMarkdownHint))
      quill.root.addEventListener('scroll', refreshMarkdownHint, { passive: true })
      quill.root.addEventListener('compositionstart', () => setMarkdownHint(null))
    }, 0)
  }, [refreshMarkdownHint])

  return (
    <div className="notepad">
      <div className="notepad-tabbar">
        <div className="notepad-tabs">
          {notepads.map(note => (
            <div
              key={note.id}
              className={`notepad-tab${activeNote?.id === note.id ? ' active' : ''}${dragOverId === note.id ? ' drag-over' : ''}`}
              onClick={() => handleSelectNote(note.id)}
              onDoubleClick={(e) => startRename(e, note)}
              draggable={editingId !== note.id}
              onDragStart={(e) => handleDragStart(e, note.id)}
              onDragOver={(e) => handleDragOver(e, note.id)}
              onDrop={(e) => handleDrop(e, note.id)}
              onDragEnd={handleDragEnd}
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
        <button
          className="notepad-shortcut-trigger"
          type="button"
          onClick={() => { setShortcutQuery(''); setIsShortcutOpen(true); setMarkdownHint(null) }}
          title="查看格式快捷键与 Markdown 语法"
        >
          快捷键
        </button>
        <span className={`notepad-status${saved ? ' saved' : ''}`}>
          {saved ? '已保存' : '未保存'}
        </span>
      </div>
      <div
        className="notepad-editor-wrap"
        ref={editorWrapRef}
        onKeyDownCapture={handleEditorKeyDown}
      >
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
        {tablePicker && (
          <form className="notepad-table-picker" style={tablePicker} onSubmit={handleInsertSizedTable} onKeyDown={event => {
            if (event.key === 'Escape') setTablePicker(null)
          }} aria-label="插入表格">
            <strong>插入表格</strong>
            <label>行数 <input type="number" min="1" max="20" value={tableRows} onChange={event => setTableRows(event.target.value)} autoFocus /></label>
            <label>列数 <input type="number" min="1" max="20" value={tableColumns} onChange={event => setTableColumns(event.target.value)} /></label>
            <button type="submit" disabled={!Number.isInteger(Number(tableRows)) || !Number.isInteger(Number(tableColumns)) || tableRows < 1 || tableRows > 20 || tableColumns < 1 || tableColumns > 20}>插入</button>
          </form>
        )}
        {markdownHint && !isShortcutOpen && (
          <div className="notepad-markdown-hint" style={{ left: markdownHint.left, top: markdownHint.top }} role="listbox" aria-label="Markdown 语法候选">
            {markdownHint.choices.map((choice, index) => (
              <button
                key={choice.syntax}
                type="button"
                className={index === hintIndex ? 'active' : ''}
                role="option"
                aria-selected={index === hintIndex}
                onMouseDown={event => event.preventDefault()}
                onClick={() => completeMarkdownChoice(choice)}
              >
                <span>{choice.label}</span>
                <code>{choice.syntax}</code>
              </button>
            ))}
            <div className="notepad-markdown-hint-tip">↑↓ 选择 · Tab 补全 · Enter 转换</div>
          </div>
        )}
      </div>
      {isShortcutOpen && (
        <div className="notepad-shortcut-overlay" onMouseDown={() => setIsShortcutOpen(false)}>
          <div
            className="notepad-shortcut-panel"
            role="dialog"
            aria-modal="true"
            aria-label="编辑快捷键"
            onMouseDown={event => event.stopPropagation()}
            onKeyDownCapture={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setIsShortcutOpen(false)
              }
            }}
          >
            <div className="notepad-shortcut-header">
              <strong>快捷键与 Markdown 语法</strong>
              <button type="button" onClick={() => setIsShortcutOpen(false)} aria-label="关闭快捷键面板">×</button>
            </div>
            <input
              autoFocus
              type="search"
              value={shortcutQuery}
              onChange={event => setShortcutQuery(event.target.value)}
              placeholder="搜索格式、快捷键或 Markdown 语法"
              aria-label="搜索快捷键"
            />
            <div className="notepad-shortcut-list">
              {SHORTCUT_GROUPS.map(group => {
                const items = group.items.filter(item => [item.label, item.keys, item.markdown]
                  .filter(Boolean).join(' ').toLowerCase().includes(shortcutQuery.trim().toLowerCase()))
                if (!items.length) return null
                return (
                  <section key={group.title}>
                    <h3>{group.title}</h3>
                    {items.map(item => (
                      <div className="notepad-shortcut-row" key={item.label}>
                        <span>{item.label}</span>
                        <kbd>{item.keys || '—'}</kbd>
                        <code>{item.markdown || '—'}</code>
                      </div>
                    ))}
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotesPad
