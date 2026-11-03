// Git 仅通过临时进程环境传递凭据；此脚本不写入、不记录访问令牌。
const prompt = String(process.argv[2] || '').toLowerCase()
const value = prompt.includes('username')
  ? process.env.SAFEVAULT_GIT_USERNAME
  : process.env.SAFEVAULT_GIT_SECRET
process.stdout.write(value || '')
