import React, { useState, useEffect, useRef } from 'react'
import LoginTargetEditor from './LoginTargetEditor'

const ACCOUNT_DEFAULTS = { accountName: '', username: '', password: '', email: '', loginUrl: '', note: '', loginTargets: [] }
const URL_DEFAULTS = { name: '', url: '', token: '', note: '' }

function Modal({ modal, onSave, onClose }) {
  const { type, mode, data } = modal
  const isEdit = mode === 'edit'
  const isAccount = type === 'account'

  const [form, setForm] = useState(() =>
    isAccount
      ? { ...ACCOUNT_DEFAULTS, ...(isEdit ? data : {}) }
      : { ...URL_DEFAULTS, ...(isEdit ? data : {}) }
  )
  const initialFormRef = useRef(form)
  const autoWebsiteTargetIdRef = useRef('')
  const syncRequestRef = useRef(0)
  const [websiteDraft, setWebsiteDraft] = useState('')
  const [loginUrlError, setLoginUrlError] = useState('')

  const firstInputRef = useRef(null)
  useEffect(() => { firstInputRef.current?.focus() }, [])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const syncLoginTarget = async (currentForm) => {
    const requestId = ++syncRequestRef.current
    const loginUrl = currentForm.loginUrl?.trim()
    let origin = ''
    if (loginUrl) {
      const result = await window.electronAPI?.normalizeWebsiteTarget?.(loginUrl)
      if (requestId !== syncRequestRef.current) return currentForm
      origin = result?.success ? result.origin : ''
      setLoginUrlError(origin ? '' : (result?.error || '请输入完整的 HTTP 或 HTTPS 网站地址。'))
    } else {
      setLoginUrlError('')
    }

    // 只替换由登录网址自动生成的规则，保留用户手动配置的其他网站和程序目标。
    const previousTargetId = autoWebsiteTargetIdRef.current
    const id = `target-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const withTarget = (value) => {
      const targets = (Array.isArray(value.loginTargets) ? value.loginTargets : [])
        .filter(target => target.id !== previousTargetId || target.origin === origin)
      if (origin && !targets.some(target => target.type === 'website' && target.origin === origin)) {
        targets.push({ id, type: 'website', origin, enabled: true })
      }
      return { ...value, loginTargets: targets }
    }
    const nextForm = withTarget(currentForm)
    if (nextForm.loginTargets.some(target => target.id === id)) autoWebsiteTargetIdRef.current = id
    setForm(previous => previous.loginUrl === currentForm.loginUrl ? withTarget(previous) : previous)
    return nextForm
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    onSave(isAccount ? await syncLoginTarget(form) : form)
  }

  const handleEscape = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    // 有未保存的表单内容或网站草稿时，只允许通过可见按钮手动关闭。
    if (JSON.stringify(form) === JSON.stringify(initialFormRef.current) && !websiteDraft) onClose()
  }

  
  const title = isAccount
    ? (isEdit ? '编辑账号密码' : '添加账号密码')
    : (isEdit ? '编辑网址' : '添加网址')

  return (
    <div className="modal-overlay" onKeyDownCapture={handleEscape}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {isAccount ? (
            <>
              <div className="form-group">
                <label>账户名称 *</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.accountName}
                  onChange={(e) => set('accountName', e.target.value)}
                  placeholder="如：Gmail、微信、支付宝"
                  required
                />
              </div>
              <div className="form-group">
                <label>账号 / 用户名</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  placeholder="用户名 / 手机号"
                />
              </div>
              <div className="form-group">
                <label>密码</label>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="密码"
                />
              </div>
              <div className="form-group">
                <label>邮箱</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="邮箱地址"
                />
              </div>
              <div className="form-group">
                <label>登录网址</label>
                <input
                  type="text"
                  value={form.loginUrl}
                  onChange={(e) => { syncRequestRef.current += 1; set('loginUrl', e.target.value); setLoginUrlError('') }}
                  onBlur={() => { void syncLoginTarget(form) }}
                  placeholder="此账号登录的网址，如：https://gmail.com"
                />
                {loginUrlError && <div className="login-target-error">{loginUrlError}</div>}
              </div>
              <div className="form-group">
                <label>备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="备注信息"
                  rows={3}
                />
              </div>
              <LoginTargetEditor
                value={form.loginTargets}
                onChange={loginTargets => set('loginTargets', loginTargets)}
                onDraftChange={setWebsiteDraft}
              />
            </>
          ) : (
            <>
              <div className="form-group">
                <label>网站名称 *</label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="如：GitHub、淘宝"
                  required
                />
              </div>
              <div className="form-group">
                <label>网址</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group">
                <label>Token / Key</label>
                <input
                  type="text"
                  value={form.token}
                  onChange={(e) => set('token', e.target.value)}
                  placeholder="API Token 或 Access Key"
                />
              </div>
              <div className="form-group">
                <label>备注</label>
                <textarea
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="备注信息"
                  rows={3}
                />
              </div>
            </>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Modal
