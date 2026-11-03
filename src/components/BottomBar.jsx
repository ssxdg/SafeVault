import React from 'react'

function BottomBar({ statusMsg, onExport, onImport, onPlaintextExport, onBrowserSettings, onGitSettings, onGitPush, onGitPull, gitSyncAction, gitSyncFeedback }) {
  const visibleMessage = statusMsg || gitSyncFeedback?.text
  const messageType = statusMsg ? 'success' : gitSyncFeedback?.type
  return (
    <div className="bottombar">
      <div className="bottombar-actions">
        <button className="btn btn-secondary btn-sm" onClick={onBrowserSettings} title="配置 Chrome 和 Edge 扩展连接">
          扩展设置
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onGitSettings} disabled={Boolean(gitSyncAction)} title="设置独立私有 Git 仓库">Git 设置</button>
        <button className="btn btn-secondary btn-sm git-action-button" onClick={onGitPull} disabled={Boolean(gitSyncAction)} aria-busy={gitSyncAction === 'pull'} title="从 Git 仓库拉取并导入加密密码库">
          {gitSyncAction === 'pull' && <span className="git-loading-spinner" aria-hidden="true" />}
          {gitSyncAction === 'pull' ? '导入中...' : 'Git 导入'}
        </button>
        <button className="btn btn-secondary btn-sm git-action-button" onClick={onGitPush} disabled={Boolean(gitSyncAction)} aria-busy={gitSyncAction === 'push'} title="将本地加密密码库推送到 Git 仓库">
          {gitSyncAction === 'push' && <span className="git-loading-spinner" aria-hidden="true" />}
          {gitSyncAction === 'push' ? '导出中...' : 'Git 导出'}
        </button>
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
