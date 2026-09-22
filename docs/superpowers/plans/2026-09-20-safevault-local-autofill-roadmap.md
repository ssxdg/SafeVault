# SafeVault Local Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 SafeVault 中实现本地加密密码库、Chrome/Edge 网站凭据填充，以及 Windows 常见桌面程序的快捷填充，全程不上传用户数据。

**Architecture:** Electron 主程序继续负责界面、密码库生命周期和加密数据文件；浏览器扩展只负责识别当前页面及填充表单，通过 Native Messaging 请求当前站点所需的最小凭据；独立 Windows Bridge 负责 Native Messaging、命名管道通信和 UI Automation。整个密码库使用 Node.js 内置 `crypto.scrypt` 与 `AES-256-GCM` 加密后封装在 JSON 中。

**Tech Stack:** Electron 30、React 18、Vite 5、Node.js `crypto`、Chrome/Edge Manifest V3、Native Messaging、.NET 8/C#、Windows UI Automation、Node `assert` 验证脚本、xUnit。

**Spec:** `docs/superpowers/plans/2026-09-20-safevault-local-autofill-roadmap.md` 中的“范围与验收边界”章节（本计划自包含规格）。

## Global Constraints

- 仅支持 Windows 10/11，继续使用现有 `npm` 和 `package-lock.json`。
- 账号、密码、Token、网址、程序路径和备注只允许写入加密载荷，不上传服务器。
- 不实现全局键盘记录，不自动绕过验证码、MFA、Passkey、UAC 或系统安全桌面。
- 网站凭据必须按标准化后的精确 Origin/域名规则匹配，不允许根据页面标题模糊匹配。
- 桌面程序优先按可执行文件规范路径匹配，窗口标题只作为辅助条件。
- 浏览器扩展和 Windows Bridge 每次只能获得完成当前填充所需的最小字段。
- 保留现有临时文件写入后替换主文件的原子保存策略；迁移失败不得覆盖原始明文文件。
- 不进行无关重构，不改变现有主题、记事本、排序和窗口行为。
- 不执行生产构建，除非进入发布验收阶段或用户明确要求。
- 未经用户明确允许，不执行 `git commit`、`git push`、`git merge` 或 `git rebase`。

## Review Focus

- 错误主密码、损坏密文或篡改认证标签必须返回明确错误，不能创建空密码库覆盖原文件。
- `login.example.com`、`example.com`、`example.com.evil.test` 必须得到不同的匹配结果，禁止钓鱼域名误填。
- 密码库锁定、主程序未运行或管道握手失败时，扩展与 Bridge 必须拒绝返回凭据。
- 多账号、动态表单、跨域 iframe 和分步登录必须可选择账号并避免填错字段。
- 管理员窗口、UAC、自绘控件或 UI Automation 不可用时必须安全失败，并提供用户主动触发的复制/粘贴兜底。

---

## 范围与验收边界

### 包含范围

- 明文 `safe_vault.json` 到加密 JSON 的安全迁移。
- 主密码创建、解锁、手动锁定、空闲自动锁定和失败提示。
- 加密导入、导出和恢复；明文导出必须单独确认。
- Chrome/Edge 普通 HTTP/HTTPS 网站的用户主动触发填充。
- 多账号选择、动态 DOM、常见 iframe 和分步登录。
- Windows 标准控件程序的快捷键触发填充。
- 不兼容桌面程序的剪贴板/模拟粘贴兜底。
- 网站和程序匹配规则的新增、编辑、禁用与删除。

### 不包含范围

- 云同步、账号注册、远程服务或遥测上报。
- UAC 安全桌面、Windows 登录界面、远程桌面内部窗口。
- 验证码、短信验证码、动态令牌、Passkey 和硬件密钥代填。
- 承诺覆盖所有网站或全部 Windows 程序。
- 第一版不控制管理员权限程序，不申请 `UIAccess`。

### 完成定义

- 新安装可以创建加密密码库，磁盘文件中搜索不到任一已知明文密码。
- 原有明文数据可以无损迁移，失败时原文件和备份均保留。
- 密码库锁定时所有外部填充请求均被拒绝。
- Chrome 和 Edge 可以在至少 20 个代表性登录页面完成手动触发填充。
- Windows 标准 Win32、Windows Forms、WPF 和常见 Electron 登录窗口完成代表性验证。
- 所有自动化失败均安全退出，不向错误域名或错误程序泄露凭据。
- README 更新安装、解锁、扩展安装、支持边界和恢复说明。

## 进度总览

状态约定：`[x] 已完成`、`[-] 进行中`、`[ ] 未开始`、`[!] 阻塞`。

| 阶段 | 状态 | 交付结果 |
|---|---|---|
| 0. 现状审计与范围确认 | [x] | 已确认现有 Electron、IPC、JSON 数据和打包结构 |
| 1. 加密信封与数据契约 | [x] | 加密信封、业务数据 v3 与网站/程序精确匹配已完成 |
| 2. 明文迁移与安全文件读写 | [x] | 无损迁移、原子保存、失败写保护已完成 |
| 3. 主密码与密码库会话 | [x] | 创建、解锁、锁定、自动锁定 UI 已完成 |
| 4. 目标匹配与安全导入导出 | [x] | 网站/程序规则、加密备份、剪贴板保护已完成 |
| 5. 本机 Bridge 与安全通信 | [x] | .NET Bridge、Native Messaging、命名管道握手已完成 |
| 6. Chrome/Edge 基础扩展 | [-] | 注册、打包和 Edge 真机已通过，Chrome 真机待人工验收 |
| 7. 网站兼容性完善 | [-] | 动态表单、iframe、分步登录和密码更新已实现，20 站待人工验收 |
| 8. Windows 桌面自动填充 | [-] | UI Automation 与安全拒绝已实现，代表性程序待人工验收 |
| 9. 桌面规则与兜底策略 | [x] | 程序捕获、剪贴板和显式模拟粘贴兜底已完成 |
| 10. 安全加固与发布验收 | [-] | 自动验证、安装包和文档已完成，安装/卸载与手工安全验收待执行 |

每完成一个任务，应同时更新该任务步骤、上方阶段状态和文档末尾的进度记录。

---

## 文件结构规划

### 现有文件修改

- `electron/main.js`：注册密码库 IPC、命名管道服务、全局快捷键和应用生命周期清理。
- `electron/preload.js`：只暴露参数固定、返回结构明确的密码库接口。
- `electron/fileManager.js`：改为读写加密信封、明文迁移和加密备份。
- `electron/dataNormalizer.js`：升级业务数据版本并规范网站/程序匹配规则。
- `src/App.jsx`：仅协调已解锁数据；锁定逻辑逐步下沉到专用 Hook。
- `src/components/AccountCard.jsx`：展示和编辑填充目标。
- `src/components/Modal.jsx`：承载目标规则编辑表单时复用现有弹窗体系。
- `src/styles/global.css`：增加解锁页、目标规则和扩展状态样式。
- `package.json`：增加验证命令、Bridge 构建和扩展打包入口。
- `README.md`：更新安全模型、安装步骤、支持范围与恢复流程。

### 新增文件

- `electron/vaultCrypto.js`：加密信封、KDF、AES-GCM 和格式校验。
- `electron/vaultSession.js`：内存解锁状态、空闲超时和最小凭据查询。
- `electron/credentialMatcher.js`：网站 Origin 和 Windows 程序规则匹配。
- `electron/bridgeServer.js`：用户级命名管道、握手和请求路由。
- `src/hooks/useVaultSession.js`：渲染层解锁状态和 IPC 协调。
- `src/components/VaultUnlock.jsx`：首次创建、普通解锁和迁移确认界面。
- `src/components/LoginTargetEditor.jsx`：网站/程序匹配规则编辑器。
- `browser-extension/manifest.json`：Manifest V3 权限和入口。
- `browser-extension/service-worker.js`：可信页面来源校验、Native Messaging 请求协调。
- `browser-extension/content-script.js`：识别登录字段和执行最小填充。
- `browser-extension/popup.html`、`browser-extension/popup.js`、`browser-extension/popup.css`：账号选择和状态提示。
- `browser-extension/shared/fieldDetector.js`：可独立测试的登录字段识别。
- `native-bridge/SafeVault.Bridge.csproj`：.NET 8 Bridge 项目。
- `native-bridge/Program.cs`：Native Messaging/桌面填充运行模式入口。
- `native-bridge/Protocol/*`：长度前缀协议、请求类型和响应类型。
- `native-bridge/Transport/*`：命名管道客户端和本机握手。
- `native-bridge/Automation/*`：前台窗口识别和 UI Automation 填充。
- `native-bridge/SafeVault.Bridge.Tests/*`：xUnit 协议、匹配与自动化边界测试。
- `scripts/verify-vault-crypto.cjs`：加密信封验证。
- `scripts/verify-vault-migration.cjs`：明文迁移和损坏恢复验证。
- `scripts/verify-credential-matcher.cjs`：域名和程序匹配验证。
- `scripts/verify-extension.cjs`：扩展清单、消息边界和纯函数验证。

---

### Task 0: 基线审计与计划建立

**状态：** [x] 已完成

**Files:**
- Create: `docs/superpowers/plans/2026-09-20-safevault-local-autofill-roadmap.md`

**Interfaces:**
- Consumes: 现有 `electron/main.js`、`electron/preload.js`、`electron/fileManager.js`、`electron/dataNormalizer.js`、`src/App.jsx` 和 `package.json`。
- Produces: 后续任务共享的范围、安全约束、文件边界和验收顺序。

- [x] **Step 1: 确认技术栈和包管理器**

结果：Electron 30 + React 18 + Vite 5，存在 `package-lock.json`，继续使用 npm。

- [x] **Step 2: 确认现有数据和 IPC 路径**

结果：`App.jsx -> preload.js -> main.js -> fileManager.js -> safe_vault.json`。

- [x] **Step 3: 确认复用边界**

结果：复用现有账号管理、托盘、窗口、导入导出和原子写入；新增加密、扩展、Bridge 和 UI Automation 子系统。

- [x] **Step 4: 建立进度文档**

验收：本文包含阶段表、任务复选框、文件职责、测试命令和完成定义。

---

### Task 1: 加密信封与格式验证

**状态：** [x] 已完成

**Files:**
- Create: `electron/vaultCrypto.js`
- Create: `scripts/verify-vault-crypto.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node.js `crypto.scrypt`, `crypto.randomBytes`, `crypto.createCipheriv`, `crypto.createDecipheriv`。
- Produces: `encryptVault(data, password) -> Promise<VaultEnvelope>`、`decryptVault(envelope, password) -> Promise<object>`、`isVaultEnvelope(value) -> boolean`。

- [x] **Step 1: 编写失败验证脚本**

验证脚本固定检查：同一明文两次加密得到不同密文、正确密码可解密、错误密码失败、密文篡改失败、无效参数失败、磁盘 JSON 不包含明文密码。

```js
const assert = require('assert')
const { encryptVault, decryptVault, isVaultEnvelope } = require('../electron/vaultCrypto')

async function main() {
  const data = { schemaVersion: 3, tabs: [{ accounts: [{ password: 'Known-Secret-123' }] }] }
  const first = await encryptVault(data, 'master-password')
  const second = await encryptVault(data, 'master-password')

  assert.strictEqual(isVaultEnvelope(first), true)
  assert.notStrictEqual(first.ciphertext, second.ciphertext)
  assert.deepStrictEqual(await decryptVault(first, 'master-password'), data)
  assert.strictEqual(JSON.stringify(first).includes('Known-Secret-123'), false)
  await assert.rejects(() => decryptVault(first, 'wrong-password'), /无法解锁密码库/)
  await assert.rejects(
    () => decryptVault({ ...first, ciphertext: `${first.ciphertext.slice(0, -2)}AA` }, 'master-password'),
    /密码库损坏或主密码错误/,
  )
}

main().then(() => console.log('vault crypto verification passed'))
```

- [x] **Step 2: 运行脚本并确认失败**

Run: `node scripts/verify-vault-crypto.cjs`

Expected: `Cannot find module '../electron/vaultCrypto'`。

- [x] **Step 3: 实现最小加密信封**

信封固定包含：

```js
{
  format: 'safe-vault-encrypted',
  schemaVersion: 1,
  kdf: { name: 'scrypt', salt, keyLength: 32, cost: 16384, blockSize: 8, parallelization: 1 },
  cipher: { name: 'aes-256-gcm', iv, authTag },
  ciphertext,
}
```

所有二进制字段使用 Base64；`scrypt` 参数由读取端白名单校验，禁止文件自行指定过高成本造成资源耗尽。

- [x] **Step 4: 运行加密验证**

Run: `node scripts/verify-vault-crypto.cjs`

Expected: `vault crypto verification passed`。

- [x] **Step 5: 增加 npm 验证入口**

在 `package.json` 增加：

```json
"verify:vault-crypto": "node scripts/verify-vault-crypto.cjs"
```

- [x] **Step 6: 更新进度**

Task 1 已完成；阶段 1 保持进行中，待 Task 2 的业务数据 v3 与匹配规则完成后再标记完成。

---

### Task 2: 业务数据 v3 与凭据匹配规则

**状态：** [x] 已完成

**Files:**
- Create: `electron/credentialMatcher.js`
- Create: `scripts/verify-credential-matcher.cjs`
- Modify: `electron/dataNormalizer.js`
- Modify: `scripts/verify-normalize-data.cjs`

**Interfaces:**
- Consumes: 现有 `normalizeData(data)` 和账号记录。
- Produces: `normalizeWebsiteOrigin(value) -> string | null`、`normalizeExecutablePath(value) -> string | null`、`findCredentialsForOrigin(data, origin) -> CredentialSummary[]`、`findCredentialsForApp(data, appIdentity) -> CredentialSummary[]`。

- [x] **Step 1: 添加域名隔离失败测试**

```js
assert.deepStrictEqual(findCredentialsForOrigin(data, 'https://login.example.com/sign-in').map(x => x.id), ['account-subdomain'])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'https://example.com.evil.test/'), [])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'chrome://settings/'), [])
assert.deepStrictEqual(findCredentialsForOrigin(data, 'file:///C:/login.html'), [])
```

- [x] **Step 2: 添加程序路径匹配失败测试**

```js
assert.deepStrictEqual(
  findCredentialsForApp(data, { executablePath: 'C:\\Program Files\\Example\\example.exe', windowTitle: 'Example Login' }).map(x => x.id),
  ['account-desktop'],
)
assert.deepStrictEqual(findCredentialsForApp(data, { executablePath: 'C:\\Temp\\example.exe', windowTitle: 'Example Login' }), [])
```

- [x] **Step 3: 运行验证并确认失败**

Run: `node scripts/verify-credential-matcher.cjs`

Expected: `Cannot find module '../electron/credentialMatcher'`。

- [x] **Step 4: 将业务数据升级到 schemaVersion 3**

账号记录新增可选字段：

```js
loginTargets: [
  { id: 'target-id', type: 'website', origin: 'https://example.com', enabled: true },
  { id: 'target-id-2', type: 'windowsApp', executablePath: 'C:\\Program Files\\Example\\example.exe', windowTitlePattern: 'Example Login', enabled: true, fillStrategy: 'uia' },
]
```

旧账号的 `loginUrl` 只在能解析为 HTTP/HTTPS Origin 时自动生成网站目标；无效地址保留原字段但不生成填充权限。

- [x] **Step 5: 实现精确匹配**

网站使用 `new URL(value).origin`；程序路径使用 Windows 不区分大小写的规范化绝对路径；窗口标题正则只允许在可执行文件已匹配后继续收窄。

- [x] **Step 6: 运行相关验证**

Run: `node scripts/verify-normalize-data.cjs; node scripts/verify-credential-matcher.cjs`

Expected: 两个脚本均输出 `passed`。

- [x] **Step 7: 更新进度**

Task 2 完成后，阶段 1 才允许整体标记为已完成。

---

### Task 3: 明文数据安全迁移与加密文件读写

**状态：** [x] 已完成

**Files:**
- Create: `scripts/verify-vault-migration.cjs`
- Modify: `electron/fileManager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

**Interfaces:**
- Consumes: `encryptVault`、`decryptVault`、`isVaultEnvelope`、`normalizeData`。
- Produces: `inspectVault() -> VaultState`、`unlockVault(password) -> result`、`writeEncryptedData(data) -> result`、`migratePlaintextVault(password) -> result`。

- [x] **Step 1: 编写迁移场景验证**

覆盖首次安装、合法明文 v2、合法加密文件、错误密码、损坏 JSON、损坏密文、迁移过程中写入失败以及 `.tmp` 残留。

- [x] **Step 2: 运行验证并确认失败**

Run: `node scripts/verify-vault-migration.cjs`

Expected: 缺少迁移接口或断言失败。

- [x] **Step 3: 重构 fileManager 的状态识别**

固定状态：

```js
{ state: 'missing' }
{ state: 'plaintext', schemaVersion: 2 }
{ state: 'locked', envelope }
{ state: 'corrupt', error }
```

`corrupt` 状态禁止自动创建默认数据并禁止写盘。

- [x] **Step 4: 实现两阶段明文迁移**

顺序必须是：读取并规范化明文 → 写入 `safe_vault.json.pre-encryption-backup` → 写入加密 `.tmp` → 解密回读验证 → 原子替换主文件。任一步失败均保留原主文件。

- [x] **Step 5: 收窄 IPC**

预加载层新增：

```js
inspectVault: () => ipcRenderer.invoke('vault-inspect')
unlockVault: (password) => ipcRenderer.invoke('vault-unlock', password)
createVault: (password) => ipcRenderer.invoke('vault-create', password)
migrateVault: (password) => ipcRenderer.invoke('vault-migrate', password)
lockVault: () => ipcRenderer.invoke('vault-lock')
```

不得向渲染层暴露数据文件绝对路径或任意文件读写接口。

- [x] **Step 6: 运行迁移与现有回归验证**

Run: `node scripts/verify-vault-migration.cjs; node scripts/verify-normalize-data.cjs; node scripts/verify-theme-wiring.cjs`

Expected: 全部通过。

- [x] **Step 7: 更新进度**

Task 3 完成后将阶段 2 标记为已完成。

---

### Task 4: 主密码界面和密码库会话

**状态：** [x] 已完成

**Files:**
- Create: `electron/vaultSession.js`
- Create: `src/hooks/useVaultSession.js`
- Create: `src/components/VaultUnlock.jsx`
- Create: `scripts/verify-vault-session.cjs`
- Modify: `electron/main.js`
- Modify: `src/App.jsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: Task 3 的密码库 IPC。
- Produces: `VaultSession.unlock(password)`、`VaultSession.lock(reason)`、`VaultSession.touch()`、`VaultSession.getStatus()`、`useVaultSession()`。

- [x] **Step 1: 编写会话失败测试**

```js
assert.strictEqual(session.getStatus().state, 'locked')
await session.unlock('correct-password')
assert.strictEqual(session.getStatus().state, 'unlocked')
clock.advanceBy(15 * 60 * 1000 + 1)
assert.strictEqual(session.getStatus().state, 'locked')
assert.strictEqual(session.getData(), null)
```

同时验证连续失败产生递增延迟，成功解锁后清零失败计数，锁定后凭据查询被拒绝。

- [x] **Step 2: 实现纯会话模块并运行测试**

Run: `node scripts/verify-vault-session.cjs`

Expected: `vault session verification passed`。

- [x] **Step 3: 实现首次创建和普通解锁界面**

首次创建要求两次输入一致且不少于 12 个字符；不添加复杂度字符规则；明确提示忘记主密码无法恢复。

- [x] **Step 4: 接入手动锁定和空闲锁定**

默认 15 分钟；设置允许 `1–1440` 分钟自定义或不自动锁定；窗口隐藏不立即锁定，Windows 会话锁定、手动锁定和应用退出必须立即锁定。

- [x] **Step 5: 从 App.jsx 清除未解锁数据路径**

只有 `state === 'unlocked'` 时渲染原有主界面；锁定时卸载账号、网址和记事本组件并清空引用。

- [x] **Step 6: 执行静态与手工检查**

Run: `node scripts/verify-vault-session.cjs; node scripts/verify-theme-wiring.cjs`

手工检查：首次创建、错误密码、正确解锁、手动锁定、超时锁定、锁定后托盘恢复。

- [x] **Step 7: 更新进度**

Task 4 完成后将阶段 3 标记为已完成。

---

### Task 5: 目标规则编辑、加密备份和剪贴板保护

**状态：** [x] 已完成

**Files:**
- Create: `src/components/LoginTargetEditor.jsx`
- Create: `electron/clipboardManager.js`
- Create: `scripts/verify-clipboard-manager.cjs`
- Modify: `src/components/AccountCard.jsx`
- Modify: `src/components/Modal.jsx`
- Modify: `electron/fileManager.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `loginTargets`、现有账号编辑弹窗、加密信封。
- Produces: 目标规则 CRUD、`exportEncryptedVault()`、`importEncryptedVault()`、`copySecret(value, ttlMs)`。

- [x] **Step 1: 编写剪贴板所有权验证**

验证 30 秒后只在剪贴板仍等于原秘密时清除；用户后来复制其他内容时不得清除新内容；应用锁定立即尝试清理仍由 SafeVault 持有的秘密。

- [x] **Step 2: 实现剪贴板管理并运行验证**

Run: `node scripts/verify-clipboard-manager.cjs`

Expected: `clipboard manager verification passed`。

- [x] **Step 3: 实现网站和程序规则编辑器**

网站输入保存为 Origin；程序通过文件选择器选择 `.exe`，禁止渲染层自由提交未经主进程规范化的路径。

- [x] **Step 4: 改造导入导出**

默认只导出加密信封；导入前先验证格式和口令；明文导出放入独立危险操作入口并要求重新输入主密码。

- [x] **Step 5: 执行验证**

Run: `node scripts/verify-credential-matcher.cjs; node scripts/verify-clipboard-manager.cjs; node scripts/verify-vault-migration.cjs`

手工检查：规则增删改、加密导出、错误口令导入、明文导出二次确认。

- [x] **Step 6: 更新进度**

Task 5 完成后将阶段 4 标记为已完成。

---

### Task 6: .NET Bridge 协议和命名管道握手

**状态：** [x] 已完成

**Files:**
- Create: `native-bridge/SafeVault.Bridge.csproj`
- Create: `native-bridge/Program.cs`
- Create: `native-bridge/Protocol/NativeMessageCodec.cs`
- Create: `native-bridge/Protocol/BridgeRequest.cs`
- Create: `native-bridge/Protocol/BridgeResponse.cs`
- Create: `native-bridge/Transport/VaultPipeClient.cs`
- Create: `native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj`
- Create: `native-bridge/SafeVault.Bridge.Tests/NativeMessageCodecTests.cs`
- Create: `electron/bridgeServer.js`
- Create: `scripts/verify-bridge-server.cjs`
- Modify: `electron/main.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Chrome/Edge Native Messaging 四字节小端长度前缀协议。
- Produces: `BridgeRequest { requestId, action, origin, accountId? }`、`BridgeResponse { requestId, ok, code, data? }`、用户级命名管道客户端/服务端。

- [x] **Step 1: 创建 .NET 8 项目和协议测试**

测试必须覆盖零长度、超限消息、截断消息、非法 JSON、未知 action 和正常往返。单条消息限制为 1 MiB。

- [x] **Step 2: 运行测试并确认失败**

Run: `dotnet test native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj`

Expected: 缺少协议实现导致编译失败。

- [x] **Step 3: 实现 NativeMessageCodec**

只从 stdin 读取长度前缀 JSON，只向 stdout 输出协议消息；所有日志写 stderr，防止破坏 Native Messaging 数据流。

- [x] **Step 4: 编写命名管道服务失败验证**

验证随机会话令牌、错误令牌拒绝、锁定状态拒绝、未知 action 拒绝和请求超时。

- [x] **Step 5: 实现 Electron 命名管道服务**

管道名包含当前 Windows 用户 SID 的不可逆摘要；启动时生成随机会话令牌，令牌通过当前用户 DPAPI 保护的本机配置交给 Bridge；每次请求同时校验令牌、action 和参数结构。

- [x] **Step 6: 实现 Bridge 管道客户端**

浏览器消息不得直接包含密码库路径或主密码；Bridge 只转发当前 Origin、账号选择和填充结果。

- [x] **Step 7: 运行协议验证**

Run: `dotnet test native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj; node scripts/verify-bridge-server.cjs`

Expected: 全部通过。

- [x] **Step 8: 更新进度**

Task 6 完成后将阶段 5 标记为已完成。

---

### Task 7: Chrome/Edge 扩展骨架和最小凭据请求

**状态：** [x] 已完成

**Files:**
- Create: `browser-extension/manifest.json`
- Create: `browser-extension/service-worker.js`
- Create: `browser-extension/content-script.js`
- Create: `browser-extension/popup.html`
- Create: `browser-extension/popup.js`
- Create: `browser-extension/popup.css`
- Create: `browser-extension/shared/fieldDetector.js`
- Create: `scripts/verify-extension.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 6 的 `listCredentials`、`getCredential` 和 `reportFillResult` 请求。
- Produces: 当前页面状态、账号摘要列表和用户主动触发的单次填充。

- [x] **Step 1: 编写扩展清单和安全边界验证**

验证 Manifest V3、`nativeMessaging`、HTTP/HTTPS host 权限、不包含远程脚本、不包含 `eval`、content script 不保存密码、service worker 不接受内容脚本自报 Origin 作为唯一可信来源。

- [x] **Step 2: 编写字段识别测试**

至少覆盖：标准 `autocomplete=username/current-password`、email + password、隐藏字段、disabled 字段、搜索框误判和两个登录表单并存。

- [x] **Step 3: 运行验证并确认失败**

Run: `node scripts/verify-extension.cjs`

Expected: 扩展文件不存在或断言失败。

- [x] **Step 4: 实现 service worker 请求链**

service worker 从 `sender.tab.url` 获取真实页面 Origin；内容脚本消息中的 URL 只能作为诊断信息；凭据详情只在用户点击具体账号后请求。

- [x] **Step 5: 实现 popup 和单次填充**

popup 展示锁定、主程序未运行、无匹配账号、单账号和多账号状态；不自动点击提交按钮。

- [x] **Step 6: 运行自动验证和浏览器手工验证**

Run: `node scripts/verify-extension.cjs`

手工检查：Chrome/Edge 开发者模式加载、普通登录页填充、错误域名无结果、锁定状态无密码。

- [x] **Step 7: 更新进度**

Task 7 完成后将阶段 6 标记为已完成。

---

### Task 8: Native Messaging 安装注册和双浏览器打包

**状态：** [-] 进行中

**Files:**
- Create: `native-bridge/manifests/chrome.template.json`
- Create: `native-bridge/manifests/edge.template.json`
- Create: `scripts/register-native-host.ps1`
- Create: `scripts/unregister-native-host.ps1`
- Create: `scripts/package-browser-extension.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Chrome 和 Edge 发布/开发扩展 ID、Bridge 可执行文件绝对路径。
- Produces: 当前用户级 Native Messaging 注册项和两个可加载扩展包。

- [x] **Step 1: 实现清单模板校验**

清单只允许 `allowed_origins` 中明确列出的扩展 ID，禁止通配符；Bridge 路径必须为安装目录内的绝对路径。

- [x] **Step 2: 实现幂等注册脚本**

脚本写入当前用户注册表范围；安装失败回滚本次创建的键；卸载脚本只删除 SafeVault 自己的键和清单文件。

- [x] **Step 3: 接入 electron-builder extraResources**

打包内容包含已发布的 Bridge 和扩展静态文件；开发环境与安装环境分别生成清单路径。

- [ ] **Step 4: 验证双浏览器通信**

Chrome 和 Edge 分别执行：扩展加载 → Native Host 建连 → 获取锁定状态 → 解锁后获取摘要 → 选择账号填充。

- [x] **Step 5: 验证卸载清理**

卸载后 Native Messaging 注册项和清单被清除，用户的加密密码库保留。

- [ ] **Step 6: 更新进度**

Task 8 完成后阶段 6 才允许整体标记为已完成。

---

### Task 9: 动态表单、iframe、分步登录和密码更新

**状态：** [-] 进行中（自动化开发完成，真实网站矩阵待人工验收）

**Files:**
- Modify: `browser-extension/content-script.js`
- Modify: `browser-extension/service-worker.js`
- Modify: `browser-extension/shared/fieldDetector.js`
- Modify: `browser-extension/popup.js`
- Modify: `scripts/verify-extension.cjs`
- Modify: `electron/vaultSession.js`
- Modify: `electron/bridgeServer.js`

**Interfaces:**
- Consumes: 基础填充协议。
- Produces: DOM 变化检测、frame 标识、分步登录上下文、用户确认后的密码更新请求。

- [x] **Step 1: 扩展字段识别测试矩阵**

增加动态插入表单、同源 iframe、跨域 iframe、用户名和密码分两页、密码修改三字段、一次性验证码字段和隐藏诱饵字段。

- [x] **Step 2: 使用受限 MutationObserver 处理动态表单**

只观察新增节点并防抖扫描；页面卸载时释放观察器；禁止持续轮询整个 DOM。

- [x] **Step 3: 实现 frame 级请求**

每个 frame 使用浏览器提供的 `frameId` 和真实 URL；跨域 frame 必须拥有对应 host 权限并单独匹配 Origin。

- [x] **Step 4: 实现分步登录短期上下文**

只在同一 tab、同一站点和 2 分钟内保留已选择账号 ID，不在扩展存储中保存密码。

- [x] **Step 5: 实现密码更新确认**

检测到用户提交新密码时只显示“是否更新”提示；用户确认后发送账号 ID 和新密码，主程序仍需处于解锁状态。

- [-] **Step 6: 完成 20 个代表性网站测试矩阵**

每个网站记录：Origin、表单类型、Chrome 结果、Edge 结果、已知限制；不把真实账号密码写入测试文档。

矩阵已建立于 `docs/superpowers/plans/safevault-browser-compatibility-matrix.md`，20 个站点的 Chrome/Edge 真实账号验收保持“待人工”，未写入任何真实凭据。

- [ ] **Step 7: 更新进度**

Task 9 完成后将阶段 7 标记为已完成。

---

### Task 10: Windows 前台程序识别与 UI Automation 填充

**状态：** [-] 进行中（实现与自动测试完成，代表性程序待人工验收）

**Files:**
- Create: `native-bridge/Automation/ForegroundWindowInspector.cs`
- Create: `native-bridge/Automation/LoginFieldLocator.cs`
- Create: `native-bridge/Automation/CredentialFiller.cs`
- Create: `native-bridge/Automation/AutomationResult.cs`
- Create: `native-bridge/SafeVault.Bridge.Tests/LoginFieldLocatorTests.cs`
- Modify: `native-bridge/Program.cs`
- Modify: `electron/main.js`
- Modify: `electron/bridgeServer.js`

**Interfaces:**
- Consumes: `AppIdentity { executablePath, processId, windowTitle, integrityLevel }` 和最小凭据。
- Produces: `AutomationResult { success, code, filledFields, message }`。

- [x] **Step 1: 编写可测试的字段排序规则**

优先级：显式 AutomationId/Name 规则 → 标准密码 Edit 控件邻近的用户名 Edit → 当前焦点控件和后续可编辑控件。任何歧义返回 `ambiguous-fields`，不得猜测填入。

- [x] **Step 2: 实现前台程序身份获取**

必须获取真实可执行文件路径；进程路径读取失败、目标为 SafeVault 自身、目标权限高于 Bridge 或窗口位于安全桌面时拒绝。

- [x] **Step 3: 实现 UI Automation 填充**

优先使用 ValuePattern；只在目标规则明确且字段唯一时写入；不自动点击登录按钮；密码不得写入日志或错误消息。

- [-] **Step 4: 注册全局快捷键**

默认 `Ctrl+Shift+L`；冲突时显示提示并允许用户更改；快捷键只触发一次前台识别和用户确认，不后台遍历所有窗口。

- [x] **Step 5: 运行 .NET 测试**

Run: `dotnet test native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj`

Expected: 协议、字段定位和安全拒绝测试全部通过。

- [ ] **Step 6: 完成代表性程序手工验证**

至少覆盖原生 Win32、Windows Forms、WPF、Electron 各一个程序，以及管理员程序、自绘程序两个安全失败场景。

- [ ] **Step 7: 更新进度**

Task 10 完成后将阶段 8 标记为已完成。

---

### Task 11: 桌面程序规则和安全兜底

**状态：** [x] 已完成

**Files:**
- Modify: `src/components/LoginTargetEditor.jsx`
- Modify: `electron/credentialMatcher.js`
- Modify: `electron/clipboardManager.js`
- Modify: `native-bridge/Automation/CredentialFiller.cs`
- Modify: `native-bridge/SafeVault.Bridge.Tests/LoginFieldLocatorTests.cs`
- Modify: `scripts/verify-credential-matcher.cjs`

**Interfaces:**
- Consumes: Windows 程序目标和 UI Automation 结果。
- Produces: `uia`、`clipboard`、`keystroke` 三种明确策略；默认只启用 `uia`。

- [x] **Step 1: 增加桌面规则字段验证**

```js
{
  type: 'windowsApp',
  executablePath: 'C:\\Program Files\\Example\\example.exe',
  windowTitlePattern: '^Example Login$',
  fillStrategy: 'uia',
  usernameSelector: { automationId: 'username' },
  passwordSelector: { automationId: 'password' },
  enabled: true,
}
```

正则长度限制为 128 字符，并在保存时预编译验证；不能只凭窗口标题建立规则。

- [x] **Step 2: 实现规则捕获向导**

用户打开目标登录窗口后主动点击“识别当前程序”；展示程序路径和找到的字段；用户确认后保存，不后台记录键盘输入。

- [x] **Step 3: 实现剪贴板兜底**

自动化失败时允许用户分别复制账号和密码；沿用 Task 5 的限时清理与所有权检查。

- [x] **Step 4: 实现模拟按键兜底**

默认关闭；只允许用户对明确程序规则启用；执行前重新验证前台可执行文件路径；执行顺序固定为用户确认过的字段序列。

- [x] **Step 5: 运行验证和安全失败检查**

Run: `node scripts/verify-credential-matcher.cjs; node scripts/verify-clipboard-manager.cjs; dotnet test native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj`

- [x] **Step 6: 更新进度**

Task 11 完成后将阶段 9 标记为已完成。

---

### Task 12: 安全加固、回归验证和文档发布

**状态：** [-] 进行中（自动验证与发布构建完成，安装和手工安全验收待执行）

**Files:**
- Create: `scripts/verify-security-boundaries.cjs`
- Modify: `scripts/verify-theme-wiring.cjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-20-safevault-local-autofill-roadmap.md`

**Interfaces:**
- Consumes: 全部已实现模块。
- Produces: 一条可重复执行的验证入口、发布检查记录和用户操作文档。

- [x] **Step 1: 建立统一验证命令**

在 `package.json` 增加不带自动修复的命令：

```json
"verify": "node scripts/verify-normalize-data.cjs && node scripts/verify-vault-crypto.cjs && node scripts/verify-vault-migration.cjs && node scripts/verify-vault-session.cjs && node scripts/verify-credential-matcher.cjs && node scripts/verify-clipboard-manager.cjs && node scripts/verify-bridge-server.cjs && node scripts/verify-extension.cjs && node scripts/verify-security-boundaries.cjs"
```

- [x] **Step 2: 验证五类高风险边界**

固定覆盖错误密码/损坏文件、钓鱼域名、锁定状态、扩展伪造消息、错误前台程序；每类都必须断言“未返回密码”。

- [x] **Step 3: 执行 Node 和 .NET 全量验证**

Run: `npm run verify; dotnet test native-bridge/SafeVault.Bridge.Tests/SafeVault.Bridge.Tests.csproj`

Expected: 全部退出码为 0，无密码出现在标准输出。

- [ ] **Step 4: 执行手工安全检查**

检查磁盘文件、备份、日志、DevTools、扩展存储、剪贴板和错误弹窗均不残留测试密码；检查主程序退出、Windows 锁屏和超时后的拒绝行为。

- [x] **Step 5: 更新 README**

说明主密码不可恢复、加密备份、Chrome/Edge 扩展安装、桌面快捷键、支持与不支持范围、数据恢复和卸载后的数据保留。

- [-] **Step 6: 经用户授权后执行发布构建**

Run: `npm run build`

随后分别安装 NSIS 和便携版，验证 Bridge 路径、注册表、Chrome、Edge、升级安装和卸载清理。

- [ ] **Step 7: 完成最终进度记录**

将阶段 10 和所有已完成任务标记为 `[x]`，记录版本号、验证日期、已知限制和未覆盖程序类型。

---

## 阶段门禁

- 阶段 1–3 未完成前，不开始浏览器扩展或桌面自动填充，避免在明文密码库上扩大攻击面。
- Task 6 的通信协议和锁定拒绝验证未通过前，不允许扩展接收真实凭据。
- Task 7 的精确 Origin 校验未通过前，不进行任何真实网站密码测试。
- Task 10 的可执行文件路径验证未通过前，不进行模拟按键填充。
- 每个阶段只在自动验证和列出的手工验收都通过后标记完成。

## 进度记录

| 日期 | 阶段/任务 | 状态变化 | 验证或说明 |
|---|---|---|---|
| 2026-09-20 | Task 0 | 未开始 → 已完成 | 完成仓库结构、数据流、IPC、打包方式和技术难度审计；建立本计划 |
| 2026-09-20 | Task 1 | 未开始 → 已完成 | `npm run verify:vault-crypto` 通过；现有 5 项 Node 验证全部通过；阶段 1 保持进行中 |
| 2026-09-20 | Task 2 | 未开始 → 已完成 | schema v3、旧网址迁移、网站 Origin 隔离和 Windows 程序路径匹配验证通过；阶段 1 完成 |
| 2026-09-20 | Task 3 | 未开始 → 已完成 | 首次创建、明文迁移、回读验证、损坏写保护、失败恢复和受限 IPC 验证通过；阶段 2 完成 |
| 2026-09-20 | Task 4 | 未开始 → 已完成 | 会话失败退避、创建/解锁 UI、手动/空闲/系统锁定、锁定卸载业务界面验证通过；隔离用户目录运行烟测通过；阶段 3 完成 |
| 2026-09-20 | Task 5 | 未开始 → 已完成 | Origin/程序目标 CRUD、`.exe` 主进程选择校验、剪贴板所有权清理、加密备份及明文导出二次口令验证通过；阶段 4 完成 |
| 2026-09-20 | Task 6 | 未开始 → 已完成 | Native Messaging 1 MiB 编解码、三类 action、SID 摘要命名管道、随机令牌与 DPAPI 配置、锁定/令牌/超时拒绝验证通过；阶段 5 完成 |
| 2026-09-20 | Task 7 | 未开始 → 已完成 | Manifest V3、安全来源校验、最小凭据请求、标准字段识别、多账号 popup 与不自动提交边界验证通过；阶段 6 完成 |
| 2026-09-21 | Task 8 | 未开始 → 进行中 | Edge 真实 Native Messaging 的锁定、摘要、选中账号和错误 Origin 已通过；卸载仅清理本应用注册项/清单且密码库哈希不变；Chrome 正式版禁止命令行加载未打包扩展，保留人工验收 |
| 2026-09-21 | Task 9 | 未开始 → 进行中 | 动态表单、frame 真实 URL、两分钟账号上下文、OTP/诱饵排除和确认式密码更新已实现；20 站矩阵已建立，真实网站结果待人工填写 |
| 2026-09-21 | Task 10 | 未开始 → 进行中 | 前台路径/完整性级别检查、UI Automation 唯一字段定位和 `Ctrl+Shift+L` 主动触发已实现；10 项 xUnit 测试通过，六类代表性程序待人工验收 |
| 2026-09-21 | Task 11 | 未开始 → 已完成 | 程序规则捕获、安全正则/选择器验证、30 秒剪贴板所有权清理和显式模拟粘贴兜底验证通过；阶段 9 完成 |
| 2026-09-21 | Task 12 | 未开始 → 进行中 | `npm run verify` 全部通过；v4.0.0 自包含 Bridge、NSIS 和便携版构建成功且资源哈希一致；因 `D:\APP\密码管理` 旧版实例正在运行，临时 NSIS/便携版启动验收被单实例锁拒绝，未关闭用户程序，密码库哈希保持不变 |
| 2026-09-21 | v4.0.0 设置增强 | 已完成 | 保留启动主密码；自动锁定支持 1–1440 分钟和不自动锁定并持久化；扩展注册与取消注册完成后显示统一弹窗 |

## 当前下一步

下一步执行人工验收：Chrome Native Messaging、20 站矩阵、Win32/WinForms/WPF/Electron/管理员/自绘程序，以及 NSIS/便携版安装升级与卸载。完成前不得把 Task 8、9、10、12 或阶段 10 标记为已完成。
