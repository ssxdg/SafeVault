# SafeVault 打包教程

本项目在 Windows 上使用 `electron-builder` 生成 x64 安装版和便携版。以下命令均在项目根目录的 PowerShell 中执行。

## 1. 准备环境

- Windows 10/11。
- Node.js 18+、npm 9+。
- .NET 8 SDK；`Native Bridge` 的验证和发布都需要它。本工作区已缓存于 `tools/dotnet-sdk/`，其中应有 `dotnet.exe`。

`npm run verify` 和 `npm run build` 会优先使用项目内的 SDK，自动为子进程设置 `PATH` 与 `DOTNET_ROOT`，无需在终端手动配置。确认本地缓存：

```powershell
.\tools\dotnet-sdk\dotnet.exe --version
```

项目内 SDK 已纳入 Git；在 Windows x64 电脑克隆完整仓库后，无需另行下载 SDK，`npm ci` 也不会删除它。若只复制部分源码而没有 `tools/dotnet-sdk/`，脚本会改用系统安装的 SDK。该目录体积较大，发布安装包时不会包含这份构建用 SDK。

首次打包或依赖尚未安装时，按锁文件安装：

```powershell
npm ci
```

## 2. 更新版本号

发布新版本时，在项目根目录执行：

```powershell
npm version patch --no-git-tag-version --ignore-scripts
```

该命令会同步更新 `package.json` 和 `package-lock.json`。本次版本为 `4.1.0`；标题栏版本由 `vite.config.mjs` 从 `package.json` 读取，无须单独修改。发布前还要同步 `README.md` 中的当前版本与产物示例。

## 3. 验证并打包

```powershell
npm run verify
npm run build
```

`npm run verify` 运行项目现有验证脚本和 .NET 测试。`npm run build` 依次执行 `dotnet publish`、`vite build`、`electron-builder`，无需手动执行各阶段命令。

打包完成后，在 `release/` 查找：

- `密码保险箱 Setup 4.1.0.exe`：NSIS 安装版。
- `密码保险箱 4.1.0.exe`：便携版。

安装包会包含 `browser-extension/` 和自包含的 `SafeVault.Bridge.exe`。浏览器扩展的加载与 ID 登记步骤见 [用户手册](SafeVault-User-Manual.md)。如需单独准备 Chrome 和 Edge 的扩展目录，可运行 `npm run package:extension`，输出位于 `release/browser-extension/`。

## 4. 发布前核对

1. 核对 `package.json`、`package-lock.json` 和安装包文件名的版本一致。
2. 在 `release/` 中确认安装版与便携版均为本次生成的文件，避免误用旧版本产物。
3. 分别启动安装版和便携版，确认标题栏显示新版本，并检查解锁、保存及浏览器扩展连接。

当前 `package.json` 未配置代码签名。向他人分发前，应按实际发布要求处理签名与 Windows 安全提示。

## 常见问题

- `dotnet` 无法识别或提示找不到 `hostfxr.dll`：确认 `tools/dotnet-sdk/dotnet.exe` 和 `tools/dotnet-sdk/host/fxr/` 都存在，再使用 `npm run verify` 或 `npm run build`。直接执行 `dotnet` 或 `npm run build:bridge` 时仍依赖终端环境变量。
- 图标或 `winCodeSign` 处理报权限错误：在 Windows 设置中开启“开发人员模式”，再重新运行 `npm run build`。
- 找不到本次安装包：检查 `npm run build` 是否完整结束，再按版本号筛选 `release/`；该目录可能保留旧产物。
