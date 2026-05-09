import React from 'react'

function BottomBar({ statusMsg, onExport, onImport }) {
  return (
    <div className="bottombar">
      <div className="bottombar-actions">
        <button className="btn btn-secondary btn-sm" onClick={onImport} title="从 JSON 文件导入数据">
          导入
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onExport} title="导出数据到 JSON 文件">
          导出
        </button>
      </div>
      <div className={`status-msg${statusMsg ? ' visible' : ''}`}>
        {statusMsg}
      </div>
    </div>
  )
}

export default BottomBar
