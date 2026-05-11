import React, { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ContentArea from './components/ContentArea'
import BottomBar from './components/BottomBar'

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

const createDefaultData = () => ({
  tabs: [{ id: generateId(), name: '个人账户', accounts: [], urls: [] }],
})

function App() {
  const [data, setData] = useState(null)
  const [activeTabId, setActiveTabId] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const saveTimerRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      let loaded
      if (window.electronAPI) {
        loaded = await window.electronAPI.readData()
      }
      if (!loaded || !Array.isArray(loaded.tabs) || loaded.tabs.length === 0) {
        loaded = createDefaultData()
      }
      setData(loaded)
      setActiveTabId(loaded.tabs[0]?.id || null)
    }
    load()
  }, [])

  const showStatus = useCallback((msg) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 2000)
  }, [])

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
      window.electronAPI.showMessageBox({
        type: 'info',
        title: '密码保险箱',
        message: '导出成功！',
        buttons: ['确定'],
      })
    } else if (!result.cancelled) {
      window.electronAPI.showMessageBox({
        type: 'error',
        title: '密码保险箱',
        message: '导出失败: ' + result.error,
        buttons: ['确定'],
      })
    }
  }, [data])

  const handleImport = useCallback(async () => {
    if (!window.electronAPI) return showStatus('仅 Electron 环境支持导入')
    const result = await window.electronAPI.importData()
    if (result.success) {
      const existing = [...data.tabs]
      const imported = result.data.tabs || []
      let addedAccounts = 0
      let addedUrls = 0
      let skippedAccounts = 0
      let skippedUrls = 0
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
      updateData({ tabs: existing })
      const parts = [`新增 ${addedAccounts} 个账号，${addedUrls} 个网址`]
      if (skippedAccounts > 0 || skippedUrls > 0) {
        const skipParts = []
        if (skippedAccounts > 0) skipParts.push(`${skippedAccounts} 个账号`)
        if (skippedUrls > 0) skipParts.push(`${skippedUrls} 个网址`)
        parts.push(`跳过 ${skipParts.join('、')}（已存在）`)
      }
      window.electronAPI.showMessageBox({
        type: 'info',
        title: '密码保险箱',
        message: '导入成功！',
        detail: parts.join('\n'),
        buttons: ['确定'],
      })
    } else if (!result.cancelled) {
      window.electronAPI.showMessageBox({
        type: 'error',
        title: '密码保险箱',
        message: '导入失败: ' + result.error,
        buttons: ['确定'],
      })
    }
  }, [data, updateData])

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC', color: '#64748B', fontFamily: '"Microsoft YaHei", sans-serif' }}>
        加载中...
      </div>
    )
  }

  const activeTab = data.tabs.find(t => t.id === activeTabId)

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          tabs={data.tabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabAdd={addTab}
          onTabDelete={deleteTab}
          onTabRename={renameTab}
          onTabReorder={reorderTabs}
        />
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
        />
      </div>
      <BottomBar statusMsg={statusMsg} onExport={handleExport} onImport={handleImport} />
    </div>
  )
}

export default App
