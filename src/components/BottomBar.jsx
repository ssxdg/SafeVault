import React from 'react'
import { Dropdown } from 'antd'

function BottomBar({ statusMsg, onExport, onImport, onPlaintextExport, onBrowserSettings, onGitSettings, onGitSync, onGitPush, onGitPull, onSyncHistory, gitSyncAction, gitSyncFeedback }) {
  const visibleMessage = statusMsg || gitSyncFeedback?.text
  const messageType = statusMsg ? 'success' : gitSyncFeedback?.type
  return (
    <div className="bottombar">
      <div className="bottombar-actions">
        <button className="btn btn-secondary btn-sm" onClick={onBrowserSettings} title="配置 Chrome 和 Edge 扩展连接">
          扩展设置
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onGitSettings} disabled={Boolean(gitSyncAction)} title="设置独立私有 Git 仓库">Git 设置</button>
        <div className="git-sync-buttons">
          <button className="btn btn-primary btn-sm git-action-button" onClick={onGitSync} disabled={Boolean(gitSyncAction)} aria-busy={Boolean(gitSyncAction)} title="自动拉取、合并差异并上传加密数据">
            {gitSyncAction && <span className="git-loading-spinner" aria-hidden="true" />}
            {gitSyncAction ? '处理中...' : '立即同步'}
          </button>
          <Dropdown trigger={['click']} placement="topLeft" getPopupContainer={trigger => trigger.parentElement} menu={{ items: [
            { key: 'pull', label: '仅拉取合并' }, { key: 'push', label: '仅上传' }, { type: 'divider' }, { key: 'history', label: '同步备份与恢复' },
          ], onClick: ({ key }) => ({ pull: onGitPull, push: onGitPush, history: onSyncHistory })[key]?.() }}>
            <button className="btn btn-secondary btn-sm" aria-label="更多同步操作" disabled={Boolean(gitSyncAction)}>▾</button>
          </Dropdown>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onImport} title="从 JSON 文件导入数据">
          文件导入
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onExport} title="导出数据到 JSON 文件">
          文件导出
        </button>
        <button className="btn btn-danger btn-sm" onClick={onPlaintextExport} title="危险：导出未加密数据">
          明文导出
        </button>
      </div>
      <div className={`status-msg${visibleMessage ? ' visible' : ''}${messageType ? ` ${messageType}` : ''}`} role="status" aria-live="polite">
        {visibleMessage}
      </div>
    </div>
  )
}

export default BottomBar
