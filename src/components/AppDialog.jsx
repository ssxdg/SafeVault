import React from 'react'

function AppDialog({ dialog, onClose, onConfirm }) {
  if (!dialog) return null

  const isConfirm = dialog.kind === 'confirm'
  const iconMap = {
    success: '✓',
    error: '!',
    warning: '!',
    info: 'i',
    confirm: '?',
  }
  const tone = dialog.type || (isConfirm ? 'warning' : 'info')

  return (
    <div className="app-dialog-overlay" onMouseDown={onClose}>
      <div className="app-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`app-dialog-icon ${tone}`}>{iconMap[tone] || 'i'}</div>
        <div className="app-dialog-content">
          <div className="app-dialog-title">{dialog.title || '密码保险箱'}</div>
          {dialog.message && <div className="app-dialog-message">{dialog.message}</div>}
          {dialog.detail && <div className="app-dialog-detail">{dialog.detail}</div>}
          <div className="app-dialog-actions">
            {isConfirm && (
              <button className="btn btn-secondary" onClick={onClose}>
                {dialog.cancelText || '取消'}
              </button>
            )}
            <button className={`btn ${tone === 'error' || tone === 'warning' ? 'btn-danger' : 'btn-primary'}`} onClick={isConfirm ? onConfirm : onClose}>
              {dialog.confirmText || '确定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AppDialog
