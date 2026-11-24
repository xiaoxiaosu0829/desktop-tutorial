// 一条命令同时拉起 API(8787) 与前端 Vite(5173)
import { spawn } from 'node:child_process'
import process from 'node:process'

const isWin = process.platform === 'win32'
const npmCmd = isWin ? 'npm.cmd' : 'npm'

function run(name, args, color) {
  const child = spawn(npmCmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
  const paint = (t) => `\x1b[${color}m[${name}]\x1b[0m ${t}`
  child.stdout.on('data', (b) => process.stdout.write(paint(b.toString())))
  child.stderr.on('data', (b) => process.stderr.write(paint(b.toString())))
  child.on('exit', (code) => {
    console.log(paint(`exit ${code}`))
    process.exit(code ?? 0)
  })
  return child
}

console.log('\x1b[36m网络游戏账号交易版权监测系统 V1.0 — dev\x1b[0m')
run('api', ['run', 'server'], '32')
run('web', ['run', 'web'], '35')