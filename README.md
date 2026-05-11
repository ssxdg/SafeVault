# 密码保险箱 (SafeVault)

> 当前版本：v2.0.0  
> 个人账号密码、网址与全局多标签记事本管理工具。本地存储、离线使用、支持导入导出备份。

## 功能概览

- **账号密码管理**：记录账户名称、用户名、密码、邮箱、登录网址和备注。
- **网址与 Token 管理**：记录网站名称、URL、Token/Key 和备注。
- **多标签分类**：通过左侧标签页按工作、个人、金融、社交等分类管理数据。
- **全局多标签记事本**：独立于密码标签页，可新建多个记事本、切换、重命名和删除。
- **使用频率排序**：复制账号/密码或打开网址后自动累计使用次数，切换标签或搜索时按使用频率排序。
- **导入导出备份**：支持 JSON 文件备份和迁移，导入时自动合并并去重。
- **统一应用内弹窗**：删除确认、导入导出结果、提示信息均使用统一美观弹窗。
- **本地 JSON 存储**：数据保存到用户目录，不需要账号、不依赖网络。

## 环境要求

- Node.js 18+
- npm 9+
- Windows 10/11

## 安装依赖

```bash
npm install
```

> 中国大陆网络环境下，项目根目录已配置 `.npmrc` 使用 npmmirror 镜像。

## 运行项目

### 开发模式

```bash
npm run dev
```

启动后会同时运行 Vite 开发服务器（`http://localhost:7331`）和 Electron 窗口，支持热更新。

### 端口被占用时

```bash
npm run dev:kill
```

该命令会释放 `7331` 端口后重新启动开发环境。

### 仅启动 Electron

当 Vite 服务已经启动时，可以单独运行：

```bash
npm run electron
```

## 打包构建

```bash
npm run build
```

构建产物输出到 `release/` 目录，包含：

- NSIS 安装包：`密码保险箱 Setup 2.0.0.exe`
- 便携版程序：`密码保险箱 2.0.0.exe`

## 数据存储位置

运行时数据保存在系统用户数据目录：

```text
C:\Users\<用户名>\AppData\Roaming\safe-vault\safe_vault.json
```

v2.0.0 使用 `schemaVersion: 2` 数据结构，主要字段包括：

```json
{
  "schemaVersion": 2,
  "tabs": [],
  "notepads": [],
  "activeNotepadId": ""
}
```

### 存储优化

- 写入时先保存到 `safe_vault.json.tmp`
- 写入完成后再替换为 `safe_vault.json`
- 旧版 `notes` 字段会自动迁移为新版 `notepads` 数组

## 导入与导出

### 导出

点击底部栏 **导出**，选择保存位置后会生成 JSON 备份文件。

### 导入

点击底部栏 **导入**，选择 JSON 备份文件。导入规则：

- 同名标签页会合并账号和网址。
- 账号去重：按账户名称或用户名匹配。
- 网址去重：按网站名称匹配。
- 记事本去重：按记事本名称 + 内容匹配。
- 导入完成后会显示新增数量和跳过重复数量。

## 项目结构

```text
safe_vault/
├── electron/
│   ├── main.js          # Electron 主进程、窗口、IPC
│   ├── preload.js       # contextBridge 预加载脚本
│   └── fileManager.js   # 数据读写、导入导出、数据规范化
├── src/
│   ├── main.jsx         # React 入口
│   ├── App.jsx          # 根组件、全局状态、导入导出逻辑
│   ├── components/
│   │   ├── AccountCard.jsx
│   │   ├── AppDialog.jsx
│   │   ├── BottomBar.jsx
│   │   ├── ContentArea.jsx
│   │   ├── Modal.jsx
│   │   ├── NotesPad.jsx
│   │   ├── Sidebar.jsx
│   │   ├── TitleBar.jsx
│   │   └── UrlCard.jsx
│   ├── images/          # 图标资源
│   └── styles/
│       └── global.css   # 全局样式、弹窗、卡片、记事本样式
├── index.html
├── package.json
├── vite.config.js
├── 操作手册.md
└── README.md
```

## 常见问题

### 打包后 exe 图标不是自定义图标

Electron Builder 修改 exe 图标可能需要 Windows 符号链接权限。

解决方法：Windows 设置 → 隐私和安全性 → 开发者选项 → 开启 **开发人员模式**，然后重新运行：

```bash
npm run build
```

### 打包时 winCodeSign 报错

通常也是权限或下载环境导致。优先开启开发人员模式，并确认 `.npmrc` 镜像配置可用。

### 旧数据是否兼容 v2.0.0？

兼容。旧版的标签、账号、网址会保留；旧版单一 `notes` 字段会自动转换为一个默认记事本。

### 数据是否加密？

当前数据为本地明文 JSON 文件。请保护好 Windows 账户和数据文件，不要将备份文件分享给他人。

## 技术栈

- Electron 30
- React 18
- Vite 5
- Ant Design 6
- electron-builder

## 版本说明

### v2.0.0

- 新增全局多标签记事本。
- 新增统一应用内弹窗。
- 优化导入导出反馈和去重逻辑。
- 优化页面样式、卡片、按钮、表单和弹窗视觉效果。
- 数据结构升级为 `schemaVersion: 2`。

### v1.1.0

- 新增版本号显示。
- 新增使用次数排序。
- 优化导入去重和导入导出提示。
