# 密码保险箱 (SafeVault)

个人账号密码管理器，本地存储，安全可靠。

## 环境要求

- Node.js 18+
- npm 9+

## 安装依赖

```bash
npm install
```

> **网络问题说明（中国大陆）**：项目根目录已配置 `.npmrc`，自动使用 npmmirror 镜像，无需额外设置。

## 运行项目

### 开发模式

```bash
npm run dev
```

启动后将同时运行 Vite 开发服务器（`http://localhost:5173`）和 Electron 窗口，支持热更新。

> **端口被占用时**（上次进程未退出）：
> ```bash
> npm run dev:kill
> ```
> 会自动释放 5173 端口后重新启动。

### 仅启动 Electron（已有 Vite 服务时）

```bash
npm run electron
```

## 打包构建

```bash
npm run build
```

构建产物输出至 `release/` 目录，包含安装包（NSIS）和便携版（Portable）`.exe`。

## 数据存储位置

运行时数据保存在系统用户数据目录：

```
C:\Users\<用户名>\AppData\Roaming\safe-vault\safe_vault.json
```

## 项目结构

```
safe_vault/
├── electron/
│   ├── main.js          # Electron 主进程（窗口、IPC）
│   ├── preload.js       # contextBridge 预加载脚本
│   └── fileManager.js   # 文件读写 & 对话框逻辑
├── src/
│   ├── main.jsx         # React 入口
│   ├── App.jsx          # 根组件（状态管理）
│   ├── components/      # UI 组件
│   │   ├── TitleBar.jsx
│   │   ├── Sidebar.jsx
│   │   ├── ContentArea.jsx
│   │   ├── AccountCard.jsx
│   │   ├── UrlCard.jsx
│   │   ├── Modal.jsx
│   │   └── BottomBar.jsx
│   ├── images/          # 图标资源
│   └── styles/
│       └── global.css
├── index.html
├── vite.config.js
├── package.json
└── .npmrc               # npm 镜像配置
```

## 常见问题

### 打包后 exe 图标不是自定义图标

electron-builder 修改 exe 图标需要创建符号链接的权限。

**解决方法**：Windows 设置 → 隐私和安全性 → 开发者选项 → 开启 **"开发人员模式"**，然后重新运行 `npm run build`。

### 打包时 winCodeSign 报错

同上，开启开发人员模式即可。

---

## 技术栈

- **Electron 30** + **React 18** + **Vite 5**
- 本地 JSON 文件存储，无需网络、无需账户
