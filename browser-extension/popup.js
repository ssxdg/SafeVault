const statusElement = document.getElementById('status')
const accountsElement = document.getElementById('accounts')
const saveForm = document.getElementById('save-account-form')

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
  if (credentials.length === 0) {
    statusElement.textContent = '当前网站没有匹配的账号。'
    return
  }
  statusElement.textContent = credentials.length === 1 ? '找到 1 个账号。' : `找到 ${credentials.length} 个账号，请选择。`
  credentials.forEach(credential => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = `${credential.accountName || '未命名账号'} · ${credential.username || '无用户名'}${credential.tabName ? `（${credential.tabName}）` : ''}`
    button.addEventListener('click', async () => {
      button.disabled = true
      statusElement.textContent = '正在填充...'
      const response = await sendToActiveTab({ type: 'fillAccount', accountId: credential.id })
      statusElement.textContent = response?.ok ? '已填充，提交前请核对。' : statusText(response?.code)
      button.disabled = false
    })
    accountsElement.appendChild(button)
  })
}

sendToActiveTab({ type: 'requestCredentialList' }).then(response => {
  if (!response?.ok) {
    statusElement.textContent = statusText(response?.code)
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
  statusElement.textContent = '正在保存账号...'
  // 密码只通过当前标签页与本机桥接传递，不写入扩展存储。
  const response = await sendToActiveTab({ type: 'saveCredential', accountName, username, password })
  if (response?.ok) {
    saveForm.reset()
    statusElement.textContent = '已保存到默认标签。'
    const listed = await sendToActiveTab({ type: 'requestCredentialList' })
    if (listed?.ok) renderAccounts(listed.data?.credentials || [])
    statusElement.textContent = '已保存到默认标签。'
  } else {
    statusElement.textContent = statusText(response?.code)
  }
  button.disabled = false
})
