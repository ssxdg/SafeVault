const statusElement = document.getElementById('status')
const accountsElement = document.getElementById('accounts')
const saveForm = document.getElementById('save-account-form')
const siteElement = document.getElementById('current-site')
const accountCountElement = document.getElementById('account-count')
const tabSelect = document.getElementById('account-tab')
const tabStatus = document.getElementById('tab-status')
const tabList = document.getElementById('tab-list')
let availableTabs = []

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
    UPDATE_FAILED: '操作失败，请稍后重试。',
    NOT_FOUND: '标签已不存在，请刷新插件后重试。',
  }
  return messages[code] || '无法连接 SafeVault。'
}

function renderTabs(tabs, selectedId = tabSelect.value) {
  availableTabs = tabs
  tabSelect.disabled = tabs.length === 0
  tabStatus.textContent = tabs.length ? '' : '密码库没有可用标签，请先在主程序中创建标签。'
  tabSelect.replaceChildren()
  tabList.replaceChildren()
  if (tabs.length === 0) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = '没有可用标签'
    tabSelect.appendChild(option)
  }
  tabs.forEach(tab => {
    const option = document.createElement('option')
    option.value = tab.id
    option.textContent = tab.name
    tabSelect.appendChild(option)
    const tag = document.createElement('button')
    tag.type = 'button'
    tag.className = 'tab-item'
    tag.textContent = tab.name
    tag.title = tab.id === 'default-tab' ? '默认标签不能改名' : '双击改名'
    tag.addEventListener('click', () => {
      tabSelect.value = tab.id
      Array.from(tabList.children).forEach((item, index) => item.setAttribute('aria-current', String(tabs[index].id === tab.id)))
    })
    const beginRename = () => {
      const input = document.createElement('input')
      input.className = 'tab-rename-input'
      input.maxLength = 100
      input.value = tab.name
      tag.replaceWith(input)
      input.focus()
      input.select()
      let finished = false
      const finish = async (save) => {
        if (finished) return
        finished = true
        const name = input.value.trim()
        if (save && name && name !== tab.name) {
          const response = await sendToActiveTab({ type: 'renameTab', tabId: tab.id, tabName: name })
          if (response?.ok) {
            renderTabs(availableTabs.map(item => item.id === tab.id ? { ...item, name } : item), tabSelect.value)
            setStatus('标签已改名。', 'success')
            return
          }
          setStatus(statusText(response?.code), 'error')
        }
        renderTabs(availableTabs, tabSelect.value)
      }
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); void finish(true) }
        if (event.key === 'Escape') { event.preventDefault(); void finish(false) }
      })
      input.addEventListener('blur', () => { void finish(true) })
    }
    if (tab.id !== 'default-tab') {
      tag.addEventListener('dblclick', beginRename)
      tag.addEventListener('keydown', event => {
        if (event.key === 'F2') { event.preventDefault(); beginRename() }
      })
    }
    tabList.appendChild(tag)
  })
  tabSelect.value = tabs.some(tab => tab.id === selectedId) ? selectedId : (tabs.find(tab => tab.id === 'default-tab')?.id || tabs[0]?.id || '')
  Array.from(tabList.children).forEach((tag, index) => tag.setAttribute('aria-current', String(tabs[index].id === tabSelect.value)))
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

sendToActiveTab({ type: 'requestTabs' }).then(response => {
  if (!response?.ok) {
    // 旧版主程序不支持读取标签；在选择框旁提示，避免账号列表的状态覆盖错误信息。
    const isVersionMismatch = ['NATIVE_HOST_ERROR', 'UNKNOWN_ACTION', 'EMPTY_RESPONSE'].includes(response?.code)
    tabStatus.textContent = isVersionMismatch
      ? '标签读取失败：请安装 SafeVault 5.0.0，重新启动主程序，并在扩展管理页重新加载插件。'
      : statusText(response?.code)
    tabSelect.replaceChildren()
    const option = document.createElement('option')
    option.value = ''
    option.textContent = '无法加载标签'
    tabSelect.appendChild(option)
    tabSelect.disabled = true
    return
  }
  renderTabs(response.data?.tabs || [])
})

tabSelect.addEventListener('change', () => renderTabs(availableTabs, tabSelect.value))

saveForm.addEventListener('submit', async event => {
  event.preventDefault()
  const accountName = document.getElementById('account-name').value.trim()
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value
  const tabId = tabSelect.value
  if (!accountName || !username || !password || !tabId) return
  const button = saveForm.querySelector('button[type="submit"]')
  button.disabled = true
  setStatus('正在保存账号...')
  // 手动添加的密码直接传给本机桥接，不进入扩展会话暂存。
  const response = await sendToActiveTab({ type: 'saveCredential', accountName, username, password, tabId })
  if (response?.ok) {
    saveForm.reset()
    tabSelect.value = tabId
    const tabName = availableTabs.find(tab => tab.id === tabId)?.name || '所选标签'
    setStatus(`已保存到「${tabName}」。`, 'success')
    const listed = await sendToActiveTab({ type: 'requestCredentialList' })
    if (listed?.ok) renderAccounts(listed.data?.credentials || [])
    setStatus(`已保存到「${tabName}」。`, 'success')
  } else {
    setStatus(statusText(response?.code), 'error')
  }
  button.disabled = false
})
