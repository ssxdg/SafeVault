const statusElement = document.getElementById('status')
const accountsElement = document.getElementById('accounts')

function statusText(code) {
  const messages = {
    APP_UNAVAILABLE: 'SafeVault 主程序未运行。',
    LOCKED: '密码库已锁定，请先在主程序中解锁。',
    UNTRUSTED_PAGE: '当前页面不支持填充。',
    FIELDS_NOT_FOUND: '未找到可填充的登录表单。',
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
    button.textContent = credential.accountName || credential.username || '未命名账号'
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
