import React, { useState, useEffect } from 'react'
import appIcon from '../images/icon.png'
import fullscreenIcon from '../images/全屏.png'

function TitleBar({
  theme = 'secure',
  themeOptions = [],
  onThemeChange,
  onImportTheme,
  onDeleteTheme,
  canDeleteTheme = false,
  onWindowClose,
}) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  // 同步窗口状态
  useEffect(() => {
    const updateWindowState = async () => {
      if (window.electronAPI?.getWindowState) {
        try {
          const state = await window.electronAPI.getWindowState()
          setIsAlwaysOnTop(Boolean(state.isAlwaysOnTop))
          setIsFullScreen(Boolean(state.isFullScreen))
          setIsMaximized(Boolean(state.isMaximized))
        } catch {
          // 窗口状态同步失败时保留当前按钮状态，避免偶发 IPC 异常让置顶按钮闪回未选中。
        }
      }
    }

    updateWindowState()
    // 定期同步状态
    const interval = setInterval(updateWindowState, 500)
    return () => clearInterval(interval)
  }, [])

  const handleMinimize = () => window.electronAPI?.minimize()

  const handleToggleMax = () => {
    window.electronAPI?.toggleMaximize()
    // 状态会通过定期同步更新
  }

  const handleClose = () => {
    // 关闭前优先交给 App flush 数据；兜底保留 Electron 原始关闭入口，避免非主界面环境按钮失效。
    if (onWindowClose) onWindowClose()
    else window.electronAPI?.close()
  }

  const handleToggleTop = async () => {
    const newVal = !isAlwaysOnTop
    if (!window.electronAPI?.toggleAlwaysOnTop) {
      setIsAlwaysOnTop(newVal)
      return
    }

    try {
      // 置顶状态以主进程返回值为准，确保按钮选中态和真实窗口控制逻辑保持一致。
      const state = await window.electronAPI.toggleAlwaysOnTop(newVal)
      setIsAlwaysOnTop(Boolean(state?.isAlwaysOnTop))
      setIsFullScreen(Boolean(state?.isFullScreen))
      setIsMaximized(Boolean(state?.isMaximized))
    } catch {
      // 如果主进程暂时没有响应，主动刷新一次状态，而不是让本地推测状态长期停留。
      try {
        const state = await window.electronAPI.getWindowState?.()
        if (state) setIsAlwaysOnTop(Boolean(state.isAlwaysOnTop))
      } catch {
        // 刷新失败时不再改动本地状态，等待下一轮定时同步恢复。
      }
    }
  }

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img src={appIcon} className="titlebar-icon" alt="icon" />
        <span className="titlebar-title">密码保险箱 v{__APP_VERSION__}</span>
      </div>
      <div className="titlebar-controls">
        <select
          className="theme-select"
          value={theme}
          onChange={(event) => onThemeChange?.(event.target.value)}
          title="主题"
        >
          {themeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="titlebar-btn"
          onClick={onImportTheme}
          title="导入主题文件"
        >
          🎨
        </button>
        {/* 只允许删除当前选中的导入主题，避免用户误删内置主题或不知道删除目标。 */}
        {canDeleteTheme && (
          <button
            className="titlebar-btn theme-delete-btn"
            onClick={onDeleteTheme}
            title="删除当前导入主题"
          >
            🗑️
          </button>
        )}
        <button
          className={`titlebar-btn${isAlwaysOnTop ? ' active' : ''}`}
          onClick={handleToggleTop}
          title={isAlwaysOnTop ? '取消置顶' : '置顶'}
        >
         📌
        </button>
        <button className="titlebar-btn" onClick={handleMinimize} title="最小化">
          ─
        </button>
        <button 
          className="titlebar-btn" 
          onClick={handleToggleMax} 
          title={
            isFullScreen ? '退出全屏' : 
            isMaximized ? '还原' : '最大化'
          }
        >
          {isFullScreen ? '🗖' : isMaximized ? '🗗' : '🗖'}
        </button>
        <button className="titlebar-btn close-btn" onClick={handleClose} title="关闭">
          ✕
        </button>
      </div>
    </div>
  )
}

export default TitleBar
