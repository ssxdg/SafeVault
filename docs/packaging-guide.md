# SafeVault 打包教程

本项目在 Windows 上使用 `electron-builder` 生成 x64 安装版和便携版。以下命令均在项目根目录的 PowerShell 中执行。

## 1. 准备环境

- Windows 10/11。
- Node.js 18+、npm 9+。
- .NET 8 SDK；`Native Bridge` 的验证和发布都需要它。安装或更改用户环境变量后，重新打开 PowerShell；若使用 IDE 内置终端，还需重启 IDE。然后确认 `dotnet --version` 可运行。

若 SDK 通过解压方式安装，还需要在执行 `npm run verify` 或 `npm run build` 的同一个 PowerShell 中设置 SDK 目录。例如安装在当前用户的 `.dotnet` 目录时：

```powershell
$sdkDir = Join-Path $env:USERPROFILE '.dotnet'
$env:DOTNET_ROOT = $sdkDir
$env:Path = "$sdkDir;$env:Path"
dotnet --version
```

`PATH` 让构建命令找到 `dotnet`；`DOTNET_ROOT` 让验证脚本启动的 `SafeVault.Bridge.exe` 找到 .NET 运行时。只设置其中一个仍可能导致命令失败。

首次打包或依赖尚未安装时，按锁文件安装：

```powershell
npm ci
```

## 2. 更新版本号

发布新版本时，在项目根目录执行：

```powershell
npm version patch --no-git-tag-version --ignore-scripts
```

该命令会同步更新 `package.json` 和 `package-lock.json`。本次版本为 `4.0.3`；标题栏版本由 `vite.config.mjs` 从 `package.json` 读取，无须单独修改。发布前还要同步 `README.md` 中的当前版本与产物示例。

## 3. 验证并打包

```powershell
npm run verify
npm run build
```

`npm run verify` 运行项目现有验证脚本和 .NET 测试。`npm run build` 依次执行 `dotnet publish`、`vite build`、`electron-builder`，无需手动执行各阶段命令。

打包完成后，在 `release/` 查找：

- `密码保险箱 Setup 4.0.3.exe`：NSIS 安装版。
- `密码保险箱 4.0.3.exe`：便携版。

安装包会包含 `browser-extension/` 和自包含的 `SafeVault.Bridge.exe`。浏览器扩展的加载与 ID 登记步骤见 [用户手册](SafeVault-User-Manual.md)。如需单独准备 Chrome 和 Edge 的扩展目录，可运行 `npm run package:extension`，输出位于 `release/browser-extension/`。

## 4. 发布前核对

1. 核对 `package.json`、`package-lock.json` 和安装包文件名的版本一致。
2. 在 `release/` 中确认安装版与便携版均为本次生成的文件，避免误用旧版本产物。
3. 分别启动安装版和便携版，确认标题栏显示新版本，并检查解锁、保存及浏览器扩展连接。

当前 `package.json` 未配置代码签名。向他人分发前，应按实际发布要求处理签名与 Windows 安全提示。

## 常见问题

- `dotnet` 无法识别或提示找不到 `hostfxr.dll`：确认已安装 .NET 8 SDK，并按上面的命令同时设置 `PATH` 和 `DOTNET_ROOT`；更改用户环境变量后重新打开终端。
- 图标或 `winCodeSign` 处理报权限错误：在 Windows 设置中开启“开发人员模式”，再重新运行 `npm run build`。
- 找不到本次安装包：检查 `npm run build` 是否完整结束，再按版本号筛选 `release/`；该目录可能保留旧产物。
