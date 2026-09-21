const fs = require('fs')
const path = require('path')

function readOption(name, fallback) {
  const prefix = `--${name}=`
  const option = process.argv.slice(2).find(value => value.startsWith(prefix))
  return option ? option.slice(prefix.length) : fallback
}

const projectRoot = path.join(__dirname, '..')
const sourceDirectory = path.join(projectRoot, 'browser-extension')
const outputDirectory = path.resolve(readOption('output', path.join(projectRoot, 'release', 'browser-extension')))
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'manifest.json'), 'utf8'))

if (outputDirectory === path.parse(outputDirectory).root
  || outputDirectory === projectRoot
  || outputDirectory === sourceDirectory) {
  throw new Error('扩展输出目录不能是磁盘根目录、项目根目录或扩展源码目录。')
}

if (manifest.manifest_version !== 3) throw new Error('扩展必须使用 Manifest V3。')
if (!manifest.permissions?.includes('nativeMessaging')) throw new Error('扩展缺少 nativeMessaging 权限。')
if (!manifest.host_permissions?.includes('http://*/*') || !manifest.host_permissions?.includes('https://*/*')) {
  throw new Error('扩展缺少 HTTP/HTTPS host 权限。')
}

fs.mkdirSync(outputDirectory, { recursive: true })
for (const browser of ['chrome', 'edge']) {
  const targetDirectory = path.join(outputDirectory, browser)
  fs.rmSync(targetDirectory, { recursive: true, force: true })
  fs.cpSync(sourceDirectory, targetDirectory, { recursive: true })
}

console.log(`browser extension packages created: ${outputDirectory}`)
