const assert = require('node:assert/strict')
const test = require('node:test')
const {
  ACCOUNT_SPECS, CONFIRMATION, assertSafe, parseArgs, passwordHash
} = require('../scripts/test-data-common')

const localConfig = { db: { host: '127.0.0.1', database: 'miniprogram_dev' } }
const executeArgs = { execute: true, confirm: CONFIRMATION }
const safeEnv = { NODE_ENV: 'development', SEED_TEST_PASSWORD: '1234' }

test('默认参数为 dry-run', () => {
  assert.deepEqual(parseArgs([]), {
    execute: false, dryRun: true, confirm: null, skipBackup: false, allowRemote: false
  })
})

test('缺少确认字符串时拒绝执行', () => {
  assert.throws(() => assertSafe(localConfig, { execute: true }, safeEnv), /confirm/)
})

test('production 环境拒绝执行', () => {
  assert.throws(() => assertSafe(localConfig, executeArgs, { ...safeEnv, NODE_ENV: 'production' }), /production/)
})

test('远程数据库拒绝执行', () => {
  assert.throws(() => assertSafe({ db: { host: 'db.example.com', database: 'app_test' } }, executeArgs, safeEnv), /allow-remote/)
})

test('数据库名不符合规则时拒绝执行', () => {
  assert.throws(() => assertSafe({ db: { host: 'localhost', database: 'miniprogram' } }, executeArgs, safeEnv), /allow-remote/)
})

test('明确远程覆盖参数允许已确认的远程库', () => {
  assert.doesNotThrow(() => assertSafe(
    { db: { host: 'db.example.com', database: 'app' } },
    { ...executeArgs, allowRemote: true },
    safeEnv
  ))
})

test('缺少测试密码时拒绝执行', () => {
  assert.throws(() => assertSafe(localConfig, executeArgs, { NODE_ENV: 'development' }), /SEED_TEST_PASSWORD/)
})

test('账号计划完整且密码哈希复用 SHA-256', () => {
  assert.equal(ACCOUNT_SPECS.length, 23)
  assert.equal(passwordHash('1234'), '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
})
