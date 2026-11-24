import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

// 每个测试文件用独立数据库，避免污染演示库
const dbFile = join(tmpdir(), `ngcms-auth-${process.pid}-${Date.now()}.db`)
process.env.DSH_MONITOR_DB = dbFile

const { hashPassword, verifyPassword, registerUser, loginUser } = await import('../services/auth.mjs')

test('scrypt 哈希可校验，错误密码不通过', () => {
  const { salt, hash } = hashPassword('Secret@123')
  assert.equal(verifyPassword('Secret@123', salt, hash), true)
  assert.equal(verifyPassword('Secret@124', salt, hash), false)
  assert.equal(verifyPassword('Secret@123', 'deadbeef', hash), false)
})

test('首个注册用户成为管理员，第二个是成员', () => {
  const a = registerUser({ username: 'boss', password: 'Boss@12345' })
  assert.equal(a.user.role, '管理员')

  const b = registerUser({ username: 'staff', password: 'Staff@12345', displayName: '运营小李' })
  assert.equal(b.user.role, '成员')
  assert.equal(b.user.displayName, '运营小李')
})

test('用户名大小写归一化，重复注册被拒绝', () => {
  assert.throws(() => registerUser({ username: 'BOSS', password: 'Boss@12345' }), /已被注册/)
})

test('密码强度与用户名格式校验', () => {
  assert.throws(() => registerUser({ username: 'ab', password: 'Good@12345' }), /3-20/)
  assert.throws(() => registerUser({ username: 'valid_name', password: 'short' }), /至少 8 位/)
})

test('登录成功返回会话，错误密码抛 401', () => {
  const ok = loginUser({ username: 'boss', password: 'Boss@12345', ip: '127.0.0.1' })
  assert.ok(ok.token.length > 20)
  assert.equal(ok.user.username, 'boss')

  try {
    loginUser({ username: 'boss', password: 'nope', ip: '127.0.0.1' })
    assert.fail('应当抛出错误')
  } catch (err) {
    assert.equal(err.status, 401)
  }
})

test('登录响应不含密码字段', () => {
  const { user } = loginUser({ username: 'boss', password: 'Boss@12345' })
  assert.equal('password_hash' in user, false)
  assert.equal('passwordHash' in user, false)
})

test('勾选记住账号 → 会话 7 天；不勾选 → 12 小时兜底', () => {
  const remembered = loginUser({ username: 'boss', password: 'Boss@12345', remember: true, ip: '10.0.0.1' })
  const plain = loginUser({ username: 'boss', password: 'Boss@12345', remember: false, ip: '10.0.0.2' })

  const db = new DatabaseSync(dbFile)
  const exp = (token) => new Date(db.prepare(`SELECT expires_at FROM sessions WHERE token = ?`).get(token).expires_at)
  const days = (token) => (exp(token).getTime() - Date.now()) / 86_400_000

  assert.ok(Math.abs(days(remembered.token) - 7) < 0.01, '应为 7 天')
  assert.ok(Math.abs(days(plain.token) - 0.5) < 0.01, '应为 12 小时')
  db.close()
})

test.after(() => {
  try { rmSync(dbFile, { force: true }) } catch { /* ignore */ }
})