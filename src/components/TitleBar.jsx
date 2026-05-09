import React, { useState } from 'react'
import appIcon from '../images/icon.png'
import fullscreenIcon from '../images/全屏.png'

function TitleBar() {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(false)

  const handleMinimize = () => window.electronAPI?.minimize()

  const handleToggleMax = () => {
    window.electronAPI?.toggleMaximize()
    setIsFullScreen(prev => !prev)
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
        <span className="titlebar-title">密码保险箱</span>
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
        <button className="titlebar-btn" onClick={handleToggleMax} title={isFullScreen ? '还原' : '全屏'}>
          <img src={fullscreenIcon} className="titlebar-btn-icon" alt="fullscreen" />
        </button>
        <button className="titlebar-btn close-btn" onClick={handleClose} title="关闭">
          ✕
        </button>
      </div>
    </div>
  )
}

export default TitleBar
