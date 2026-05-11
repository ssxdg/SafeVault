import React, { useState, useEffect } from 'react'
import appIcon from '../images/icon.png'
import fullscreenIcon from '../images/全屏.png'

function TitleBar() {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  // 同步窗口状态
  useEffect(() => {
    const updateWindowState = async () => {
      if (window.electronAPI?.getWindowState) {
        const state = await window.electronAPI.getWindowState()
        setIsAlwaysOnTop(state.isAlwaysOnTop)
        setIsFullScreen(state.isFullScreen)
        setIsMaximized(state.isMaximized)
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

  const handleClose = () => window.electronAPI?.close()

  const handleToggleTop = () => {
    const newVal = !isAlwaysOnTop
    setIsAlwaysOnTop(newVal)
    window.electronAPI?.toggleAlwaysOnTop(newVal)
  }

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img src={appIcon} className="titlebar-icon" alt="icon" />
        <span className="titlebar-title">密码保险箱 v{__APP_VERSION__}</span>
      </div>
      <div className="titlebar-controls">
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
