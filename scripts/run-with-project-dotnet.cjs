const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const task = process.argv[2]
if (!['build:all', 'verify:all'].includes(task)) {
  console.error('仅支持项目打包和验证任务。')
  process.exit(1)
}

const projectRoot = path.join(__dirname, '..')
const sdkDirectory = path.join(projectRoot, 'tools', 'dotnet-sdk')
const localDotnet = path.join(sdkDirectory, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet')
const environment = { ...process.env }

if (fs.existsSync(localDotnet)) {
  // 子进程及 Bridge AppHost 都需要指向同一份 SDK，避免仅找到 dotnet 命令却缺少运行时。
  const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') || 'Path'
  environment.DOTNET_ROOT = sdkDirectory
  environment.DOTNET_ROOT_X64 = sdkDirectory
  environment[pathKey] = `${sdkDirectory}${path.delimiter}${environment[pathKey] || ''}`
  console.log(`使用项目内 .NET SDK：${sdkDirectory}`)
}

const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('请通过 npm run verify 或 npm run build 运行。')
  process.exit(1)
}

const result = spawnSync(process.execPath, [npmCli, 'run', task], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
