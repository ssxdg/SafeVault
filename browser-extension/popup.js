const statusElement = document.getElementById('status')
const accountsElement = document.getElementById('accounts')
const saveForm = document.getElementById('save-account-form')
const siteElement = document.getElementById('current-site')
const accountCountElement = document.getElementById('account-count')

function setStatus(message, tone = 'neutral') {
  statusElement.textContent = message
  statusElement.className = `status-line status-${tone}`
}

function statusText(code) {
  const messages = {
    APP_UNAVAILABLE: 'SafeVault 桥接服务不可用，请重启主程序；若仍失败，请检查主程序与桥接组件版本。',
    NATIVE_HOST_ERROR: '无法启动 SafeVault 桥接组件，请检查扩展 ID、Native Host 注册和安装路径。',
    TIMEOUT: 'SafeVault 服务启动超时，请手动打开主程序后重试。',
    EMPTY_RESPONSE: 'SafeVault 未返回有效响应，请重新加载扩展后重试。',
    LOCKED: '密码库已锁定，请先在主程序中解锁。',
    UNTRUSTED_PAGE: '当前页面不支持填充。',
    FIELDS_NOT_FOUND: '未找到可填充的登录表单。',
    ALREADY_EXISTS: '当前网站已有相同用户名，请在主程序中编辑该账号。',
    INVALID_REQUEST: '账号信息无效，请检查输入。',
    UPDATE_FAILED: '账号保存失败，请稍后重试。',
  }
  return messages[code] || '无法连接 SafeVault。'
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab()
  if (!tab?.id) return { ok: false, code: 'UNTRUSTED_PAGE' }
  try {
    return await chrome.tabs.sendMessage(tab.id, message)
  } catch {
    return { ok: false, code: 'UNTRUSTED_PAGE' }
  }
}

function renderAccounts(credentials) {
  accountsElement.replaceChildren()
  accountCountElement.textContent = `${credentials.length} 个`
  if (credentials.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'accounts-empty'
    empty.textContent = '还没有保存此网站的账号'
    accountsElement.appendChild(empty)
    setStatus('当前网站没有匹配的账号。')
    return
  }
  setStatus(credentials.length === 1 ? '找到 1 个账号，点击即可填充。' : `找到 ${credentials.length} 个账号，请选择。`, 'success')
  credentials.forEach(credential => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'account-item'
    const details = document.createElement('span')
    details.className = 'account-details'
    const name = document.createElement('strong')
    name.textContent = credential.accountName || '未命名账号'
    const subtitle = document.createElement('small')
    subtitle.textContent = `${credential.username || '无用户名'}${credential.tabName ? ` · ${credential.tabName}` : ''}`
    const arrow = document.createElement('span')
    arrow.className = 'account-arrow'
    arrow.textContent = '↗'
    arrow.setAttribute('aria-hidden', 'true')
    details.append(name, subtitle)
    button.append(details, arrow)
    button.addEventListener('click', async () => {
      button.disabled = true
      setStatus('正在填充...')
      const response = await sendToActiveTab({ type: 'fillAccount', accountId: credential.id })
      setStatus(response?.ok ? '已填充，提交前请核对。' : statusText(response?.code), response?.ok ? 'success' : 'error')
      button.disabled = false
    })
    accountsElement.appendChild(button)
  })
}

getActiveTab().then(tab => {
  try {
    siteElement.textContent = new URL(tab?.url).host
  } catch {
    siteElement.textContent = '当前页面'
  }
})

sendToActiveTab({ type: 'requestCredentialList' }).then(response => {
  if (!response?.ok) {
    setStatus(statusText(response?.code), 'error')
    return
  }
  renderAccounts(response.data?.credentials || [])
})

saveForm.addEventListener('submit', async event => {
  event.preventDefault()
  const accountName = document.getElementById('account-name').value.trim()
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value
  if (!accountName || !username || !password) return
  const button = saveForm.querySelector('button[type="submit"]')
  button.disabled = true
  setStatus('正在保存账号...')
  // 手动添加的密码直接传给本机桥接，不进入扩展会话暂存。
  const response = await sendToActiveTab({ type: 'saveCredential', accountName, username, password })
  if (response?.ok) {
    saveForm.reset()
    setStatus('已保存到默认标签。', 'success')
    const listed = await sendToActiveTab({ type: 'requestCredentialList' })
    if (listed?.ok) renderAccounts(listed.data?.credentials || [])
    setStatus('已保存到默认标签。', 'success')
  } else {
    setStatus(statusText(response?.code), 'error')
  }
  button.disabled = false
})
