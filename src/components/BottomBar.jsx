import React from 'react'

function BottomBar({ statusMsg, onExport, onImport, onPlaintextExport, onBrowserSettings }) {
  return (
    <div className="bottombar">
      <div className="bottombar-actions">
        <button className="btn btn-secondary btn-sm" onClick={onBrowserSettings} title="配置 Chrome 和 Edge 扩展连接">
          扩展设置
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onImport} title="从 JSON 文件导入数据">
          导入
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onExport} title="导出数据到 JSON 文件">
          加密导出
        </button>
        <button className="btn btn-danger btn-sm" onClick={onPlaintextExport} title="危险：导出未加密数据">
          明文导出
        </button>
      </div>
      <div className={`status-msg${statusMsg ? ' visible' : ''}`}>
        {statusMsg}
      </div>
    </div>
  )
}

export default BottomBar
