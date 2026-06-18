import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ContentArea from './components/ContentArea'
import NotesPad from './components/NotesPad'
import BottomBar from './components/BottomBar'
import AppDialog from './components/AppDialog'

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)
// 内置主题仍然保留为固定选项，自定义主题会在运行时追加到这个列表后面。
const BUILT_IN_THEME_OPTIONS = [
  { value: 'secure', label: '沉稳深海' },
  { value: 'compact', label: '奶油护眼' },
  { value: 'warm', label: '冷光赛博' },
]
const BUILT_IN_THEME_VALUES = new Set(BUILT_IN_THEME_OPTIONS.map(option => option.value))
const CUSTOM_THEME_PREFIX = 'custom:'

// 业务数据里只保存 custom:<id> 引用，这个工具函数负责从引用中取出本机主题库的 id。
const getCustomThemeId = (theme) => (
  typeof theme === 'string' && theme.startsWith(CUSTOM_THEME_PREFIX)
    ? theme.slice(CUSTOM_THEME_PREFIX.length)
    : ''
)

const createDefaultData = () => ({
  schemaVersion: 2,
  theme: 'secure',
  tabs: [{ id: generateId(), name: '个人账户', accounts: [], urls: [] }],
  notepads: [{ id: generateId(), name: '未命名', content: '', createdAt: '', updatedAt: '' }],
  activeNotepadId: null,
})

function App() {
  const [data, setData] = useState(null)
  const [customThemes, setCustomThemes] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [activeSection, setActiveSection] = useState('tabs')
  const [statusMsg, setStatusMsg] = useState('')
  const [dialog, setDialog] = useState(null)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      let loaded
      let loadedCustomThemes = []
      if (window.electronAPI) {
        // 数据文件和本机主题库互不依赖，并行读取可以减少启动等待时间。
        const [dataResult, themeResult] = await Promise.all([
          window.electronAPI.readData(),
          window.electronAPI.readCustomThemes?.(),
        ])
        loaded = dataResult
        if (themeResult?.success && Array.isArray(themeResult.themes)) {
          loadedCustomThemes = themeResult.themes
        }
      }
      if (!loaded || !Array.isArray(loaded.tabs) || loaded.tabs.length === 0) {
        loaded = createDefaultData()
      }
      if (!Array.isArray(loaded.notepads) || loaded.notepads.length === 0) {
        loaded.notepads = [{
          id: generateId(),
          name: '未命名',
          content: typeof loaded.notes === 'string' ? loaded.notes : '',
          createdAt: '',
          updatedAt: '',
        }]
      }
      if (!loaded.activeNotepadId || !loaded.notepads.some(n => n.id === loaded.activeNotepadId)) {
        loaded.activeNotepadId = loaded.notepads[0].id
      }
      const customThemeId = getCustomThemeId(loaded.theme)
      const hasCustomTheme = customThemeId && loadedCustomThemes.some(theme => theme.id === customThemeId)
      if (!BUILT_IN_THEME_VALUES.has(loaded.theme) && !hasCustomTheme) {
        loaded.theme = 'secure'
      }
      setCustomThemes(loadedCustomThemes)
      setData(loaded)
      setActiveTabId(loaded.tabs[0]?.id || null)
    }
    load()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        // ESC 必须复用标题栏关闭按钮的同一条 Electron API，保证隐藏到托盘而不是退出应用。
        event.preventDefault()
        window.electronAPI?.close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const showStatus = useCallback((msg) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 2000)
  }, [])

  const showInfo = useCallback((options) => {
    setDialog({ kind: 'info', type: 'info', ...options })
  }, [])

  const showConfirm = useCallback((options, onConfirm) => {
    setDialog({ kind: 'confirm', type: 'warning', confirmText: '确定', cancelText: '取消', ...options, onConfirm })
  }, [])

  const closeDialog = useCallback(() => {
    setDialog(null)
  }, [])

  const confirmDialog = useCallback(() => {
    const action = dialog?.onConfirm
    setDialog(null)
    action?.()
  }, [dialog])

  const scheduleSave = useCallback((newData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (window.electronAPI) {
        window.electronAPI.writeData(newData)
      }
    }, 1000)
  }, [])

  const updateData = useCallback((newData) => {
    setData(newData)
    scheduleSave(newData)
  }, [scheduleSave])

  const selectNotes = useCallback(() => {
    setActiveSection('notes')
  }, [])

  const selectTab = useCallback((tabId) => {
    setActiveSection('tabs')
    setActiveTabId(tabId)
  }, [])

  const addNotepad = useCallback(() => {
    setData(prev => {
      const now = new Date().toISOString()
      const newNote = {
        id: generateId(),
        name: `记事本 ${(prev.notepads || []).length + 1}`,
        content: '',
        createdAt: now,
        updatedAt: now,
      }
      const newData = {
        ...prev,
        notepads: [...(prev.notepads || []), newNote],
        activeNotepadId: newNote.id,
      }
      scheduleSave(newData)
      return newData
    })
    setActiveSection('notes')
  }, [scheduleSave])

  const selectNotepad = useCallback((noteId) => {
    setData(prev => {
      const newData = { ...prev, activeNotepadId: noteId }
      scheduleSave(newData)
      return newData
    })
    setActiveSection('notes')
  }, [scheduleSave])

  const renameNotepad = useCallback((noteId, name) => {
    setData(prev => {
      const now = new Date().toISOString()
      const newData = {
        ...prev,
        notepads: (prev.notepads || []).map(note =>
          note.id === noteId ? { ...note, name, updatedAt: now } : note
        ),
      }
      scheduleSave(newData)
      return newData
    })
  }, [scheduleSave])

  const updateNotepadContent = useCallback((noteId, content) => {
    setData(prev => {
      const now = new Date().toISOString()
      const newData = {
        ...prev,
        notepads: (prev.notepads || []).map(note =>
          note.id === noteId ? { ...note, content, updatedAt: now } : note
        ),
      }
      scheduleSave(newData)
      return newData
    })
  }, [scheduleSave])

  const deleteNotepad = useCallback((noteId) => {
    setData(prev => {
      const currentNotes = prev.notepads || []
      const now = new Date().toISOString()
      let nextNotes = currentNotes.filter(note => note.id !== noteId)
      if (nextNotes.length === 0) {
        nextNotes = [{ id: generateId(), name: '未命名', content: '', createdAt: now, updatedAt: now }]
      }
      const nextActiveId = prev.activeNotepadId === noteId ? nextNotes[0].id : prev.activeNotepadId
      const newData = { ...prev, notepads: nextNotes, activeNotepadId: nextActiveId }
      scheduleSave(newData)
      return newData
    })
  }, [scheduleSave])

  const reorderNotepads = useCallback((newNotepads) => {
    setData(prev => {
      const nextActiveId = newNotepads.some(note => note.id === prev.activeNotepadId)
        ? prev.activeNotepadId
        : newNotepads[0]?.id || null
      const newData = { ...prev, notepads: newNotepads, activeNotepadId: nextActiveId }
      scheduleSave(newData)
      return newData
    })
  }, [scheduleSave])

  // --- Tab operations ---
  const addTab = useCallback((name) => {
    const newTab = { id: generateId(), name, accounts: [], urls: [] }
    const newData = { ...data, tabs: [newTab, ...data.tabs] }
    updateData(newData)
    setActiveTabId(newTab.id)
  }, [data, updateData])

  const deleteTab = useCallback((tabId) => {
    const newTabs = data.tabs.filter(t => t.id !== tabId)
    const newData = { ...data, tabs: newTabs }
    updateData(newData)
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0]?.id || null)
    }
  }, [data, updateData, activeTabId])

  const renameTab = useCallback((tabId, newName) => {
    updateData({
      ...data,
      tabs: data.tabs.map(t => t.id === tabId ? { ...t, name: newName } : t),
    })
  }, [data, updateData])

  const reorderTabs = useCallback((newTabs) => {
    updateData({ ...data, tabs: newTabs })
  }, [data, updateData])

  const setTheme = useCallback((theme) => {
    const customThemeId = getCustomThemeId(theme)
    const isKnownCustomTheme = customThemeId && customThemes.some(item => item.id === customThemeId)
    if (!BUILT_IN_THEME_VALUES.has(theme) && !isKnownCustomTheme) return
    updateData({ ...data, theme })
  }, [customThemes, data, updateData])

  const importTheme = useCallback(async () => {
    if (!window.electronAPI?.importThemeFile) {
      showStatus('仅 Electron 环境支持导入主题')
      return
    }

    const result = await window.electronAPI.importThemeFile()
    if (result.success && result.theme) {
      setCustomThemes(prev => {
        const index = prev.findIndex(theme => theme.id === result.theme.id)
        if (index === -1) return [...prev, result.theme]
        const next = [...prev]
        next[index] = result.theme
        return next
      })
      // 导入成功后立即切换到该主题，让用户能确认主题文件已经生效。
      updateData({ ...data, theme: `${CUSTOM_THEME_PREFIX}${result.theme.id}` })
      showInfo({
        type: 'success',
        title: '导入主题',
        message: result.updated ? '主题已更新并应用。' : '主题已导入并应用。',
        detail: result.theme.name,
      })
    } else if (!result.cancelled) {
      showInfo({
        type: 'error',
        title: '导入主题失败',
        message: result.error || '无法读取主题文件。',
      })
    }
  }, [data, showInfo, showStatus, updateData])

  // --- Account operations ---
  const addAccount = useCallback((tabId, account) => {
    const now = new Date().toISOString()
    const newAcc = { id: generateId(), ...account, useCount: 0, createdAt: now, updatedAt: now }
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId ? { ...t, accounts: [newAcc, ...t.accounts] } : t
      ),
    })
  }, [data, updateData])

  const updateAccount = useCallback((tabId, accId, account) => {
    const now = new Date().toISOString()
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId
          ? { ...t, accounts: t.accounts.map(a => a.id === accId ? { ...a, ...account, updatedAt: now } : a) }
          : t
      ),
    })
  }, [data, updateData])

  const deleteAccount = useCallback((tabId, accId) => {
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId ? { ...t, accounts: t.accounts.filter(a => a.id !== accId) } : t
      ),
    })
  }, [data, updateData])

  // --- URL operations ---
  const addUrl = useCallback((tabId, urlItem) => {
    const now = new Date().toISOString()
    const newUrl = { id: generateId(), ...urlItem, useCount: 0, createdAt: now, updatedAt: now }
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId ? { ...t, urls: [newUrl, ...t.urls] } : t
      ),
    })
  }, [data, updateData])

  const updateUrl = useCallback((tabId, urlId, urlItem) => {
    const now = new Date().toISOString()
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId
          ? { ...t, urls: t.urls.map(u => u.id === urlId ? { ...u, ...urlItem, updatedAt: now } : u) }
          : t
      ),
    })
  }, [data, updateData])

  const deleteUrl = useCallback((tabId, urlId) => {
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId ? { ...t, urls: t.urls.filter(u => u.id !== urlId) } : t
      ),
    })
  }, [data, updateData])

  // --- Use count ---
  const incrementAccountUse = useCallback((tabId, accId) => {
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId
          ? { ...t, accounts: t.accounts.map(a => a.id === accId ? { ...a, useCount: (a.useCount || 0) + 1 } : a) }
          : t
      ),
    })
  }, [data, updateData])

  const incrementUrlUse = useCallback((tabId, urlId) => {
    updateData({
      ...data,
      tabs: data.tabs.map(t =>
        t.id === tabId
          ? { ...t, urls: t.urls.map(u => u.id === urlId ? { ...u, useCount: (u.useCount || 0) + 1 } : u) }
          : t
      ),
    })
  }, [data, updateData])

  // --- Import / Export ---
  const handleExport = useCallback(async () => {
    if (!window.electronAPI) return showStatus('仅 Electron 环境支持导出')
    const result = await window.electronAPI.exportData(data)
    if (result.success) {
      showInfo({
        type: 'success',
        title: '密码保险箱',
        message: '导出成功！',
        detail: '数据已成功导出为 JSON 备份文件。',
      })
    } else if (!result.cancelled) {
      showInfo({
        type: 'error',
        title: '密码保险箱',
        message: '导出失败: ' + result.error,
      })
    }
  }, [data, showInfo, showStatus])

  const handleImport = useCallback(async () => {
    if (!window.electronAPI) return showStatus('仅 Electron 环境支持导入')
    const result = await window.electronAPI.importData()
    if (result.success) {
      const existing = [...data.tabs]
      const imported = result.data.tabs || []
      let addedAccounts = 0
      let addedUrls = 0
      let addedNotepads = 0
      let skippedAccounts = 0
      let skippedUrls = 0
      let skippedNotepads = 0
      for (const tab of imported) {
        const found = existing.find(t => t.name === tab.name)
        if (found) {
          const existingAccountNames = new Set(
            (found.accounts || []).map(a => a.accountName?.trim().toLowerCase())
          )
          const existingUsernames = new Set(
            (found.accounts || []).map(a => a.username?.trim().toLowerCase()).filter(Boolean)
          )
          const existingUrlNames = new Set(
            (found.urls || []).map(u => u.name?.trim().toLowerCase())
          )
          for (const acc of (tab.accounts || [])) {
            const nameKey = acc.accountName?.trim().toLowerCase()
            const userKey = acc.username?.trim().toLowerCase()
            if (existingAccountNames.has(nameKey) || (userKey && existingUsernames.has(userKey))) {
              skippedAccounts++
            } else {
              found.accounts = [...(found.accounts || []), { ...acc, id: generateId() }]
              existingAccountNames.add(nameKey)
              if (userKey) existingUsernames.add(userKey)
              addedAccounts++
            }
          }
          for (const url of (tab.urls || [])) {
            if (existingUrlNames.has(url.name?.trim().toLowerCase())) {
              skippedUrls++
            } else {
              found.urls = [...(found.urls || []), { ...url, id: generateId() }]
              existingUrlNames.add(url.name?.trim().toLowerCase())
              addedUrls++
            }
          }
        } else {
          const newTab = { ...tab, id: generateId() }
          addedAccounts += (tab.accounts || []).length
          addedUrls += (tab.urls || []).length
          existing.push(newTab)
        }
      }
      const serializeContent = (c) => {
        if (!c) return ''
        if (typeof c === 'string') return c
        try { return JSON.stringify(c) } catch { return '' }
      }
      const existingNotepads = [...(data.notepads || [])]
      const existingNotepadKeys = new Set(
        existingNotepads.map(note => `${note.name?.trim().toLowerCase() || ''}\n${serializeContent(note.content)}`)
      )
      for (const note of (result.data.notepads || [])) {
        const name = note.name || `记事本 ${existingNotepads.length + 1}`
        const content = note.content || ''
        const key = `${name.trim().toLowerCase()}\n${serializeContent(content)}`
        if (existingNotepadKeys.has(key)) {
          skippedNotepads++
        } else {
          existingNotepads.push({
            ...note,
            id: generateId(),
            name,
            content,
          })
          existingNotepadKeys.add(key)
          addedNotepads++
        }
      }
      const importedTheme = result.data.theme
      const importedCustomThemeId = getCustomThemeId(importedTheme)
      const canUseImportedTheme = BUILT_IN_THEME_VALUES.has(importedTheme) ||
        (importedCustomThemeId && customThemes.some(theme => theme.id === importedCustomThemeId))
      // 数据备份不包含本机自定义主题定义；如果备份里只有 custom:<id> 引用但本机没有该主题，就保留当前可用主题。
      updateData({
        ...data,
        theme: canUseImportedTheme ? importedTheme : (data.theme || 'secure'),
        tabs: existing,
        notepads: existingNotepads,
        activeNotepadId: data.activeNotepadId || existingNotepads[0]?.id || null,
      })
      const parts = [`新增 ${addedAccounts} 个账号，${addedUrls} 个网址，${addedNotepads} 个记事本`]
      if (skippedAccounts > 0 || skippedUrls > 0 || skippedNotepads > 0) {
        const skipParts = []
        if (skippedAccounts > 0) skipParts.push(`${skippedAccounts} 个账号`)
        if (skippedUrls > 0) skipParts.push(`${skippedUrls} 个网址`)
        if (skippedNotepads > 0) skipParts.push(`${skippedNotepads} 个记事本`)
        parts.push(`跳过 ${skipParts.join('、')}（已存在）`)
      }
      showInfo({
        type: 'success',
        title: '密码保险箱',
        message: '导入成功！',
        detail: parts.join('\n'),
      })
    } else if (!result.cancelled) {
      showInfo({
        type: 'error',
        title: '密码保险箱',
        message: '导入失败: ' + result.error,
      })
    }
  }, [customThemes, data, updateData, showInfo, showStatus])

  const themeOptions = useMemo(() => [
    ...BUILT_IN_THEME_OPTIONS,
    ...customThemes.map(theme => ({
      value: `${CUSTOM_THEME_PREFIX}${theme.id}`,
      label: theme.name,
    })),
  ], [customThemes])

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC', color: '#64748B', fontFamily: '"Microsoft YaHei", sans-serif' }}>
        加载中...
      </div>
    )
  }

  const activeTab = data.tabs.find(t => t.id === activeTabId)
  const activeCustomThemeId = getCustomThemeId(data.theme)
  const activeCustomTheme = customThemes.find(theme => theme.id === activeCustomThemeId)
  // 自定义主题使用 data-theme="custom" 承接通用样式，再把主题变量写到根节点 style 上。
  const rootTheme = activeCustomTheme ? 'custom' : (data.theme || 'secure')
  const customThemeVariables = activeCustomTheme?.variables

  return (
    <div className="app" data-theme={rootTheme} style={customThemeVariables}>
      <TitleBar
        theme={data.theme || 'secure'}
        themeOptions={themeOptions}
        onThemeChange={setTheme}
        onImportTheme={importTheme}
      />
      <div className="app-body">
        <Sidebar
          tabs={data.tabs}
          activeTabId={activeTabId}
          activeSection={activeSection}
          onTabSelect={selectTab}
          onNotesSelect={selectNotes}
          onTabAdd={addTab}
          onTabDelete={deleteTab}
          onTabRename={renameTab}
          onTabReorder={reorderTabs}
          onConfirm={showConfirm}
        />
        {activeSection === 'notes' ? (
          <NotesPad
            notepads={data.notepads || []}
            activeNotepadId={data.activeNotepadId}
            onSelectNotepad={selectNotepad}
            onAddNotepad={addNotepad}
            onRenameNotepad={renameNotepad}
            onUpdateNotepadContent={updateNotepadContent}
            onDeleteNotepad={deleteNotepad}
            onReorderNotepads={reorderNotepads}
            onConfirm={showConfirm}
            onAlert={showInfo}
          />
        ) : (
          <ContentArea
            tab={activeTab}
            onAddAccount={(acc) => addAccount(activeTabId, acc)}
            onUpdateAccount={(id, acc) => updateAccount(activeTabId, id, acc)}
            onDeleteAccount={(id) => deleteAccount(activeTabId, id)}
            onAddUrl={(url) => addUrl(activeTabId, url)}
            onUpdateUrl={(id, url) => updateUrl(activeTabId, id, url)}
            onDeleteUrl={(id) => deleteUrl(activeTabId, id)}
            onIncrementAccountUse={(id) => incrementAccountUse(activeTabId, id)}
            onIncrementUrlUse={(id) => incrementUrlUse(activeTabId, id)}
            showStatus={showStatus}
            onConfirm={showConfirm}
          />
        )}
      </div>
      <BottomBar statusMsg={statusMsg} onExport={handleExport} onImport={handleImport} />
      <AppDialog dialog={dialog} onClose={closeDialog} onConfirm={confirmDialog} />
    </div>
  )
}

export default App
