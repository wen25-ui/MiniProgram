const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  TRANSFERABLE_TASK_STATUSES,
  assertSalesmanCanAcceptTask,
  assertSalesmanCanViewTask,
  assertSalesmanOwnsTask,
  assertTransferAllowed,
  canSeePoolTask,
  loadSalesmanScope
} = require('../src/salesman-access')

const branchAField = { id: 11, branch_id: 1, branch_status: 'ACTIVE', can_field_service: 1 }
const branchANormal = { id: 12, branch_id: 1, branch_status: 'ACTIVE', can_field_service: 0 }
const branchAField2 = { id: 13, branch_id: 1, branch_status: 'ACTIVE', can_field_service: 1 }
const branchBField = { id: 21, branch_id: 2, branch_status: 'ACTIVE', can_field_service: 1 }
const storePool = { branch_id: 1, service_type: 'STORE_SERVICE', assignee_user_id: null, status: 'PENDING_ACCEPT' }
const fieldPool = { branch_id: 1, service_type: 'HOME_SERVICE', assignee_user_id: null, status: 'PENDING_ACCEPT' }

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8')
}

test('普通网点业务员可见本网点到店任务池', () => {
  assert.equal(canSeePoolTask(storePool, branchANormal), true)
})

test('普通网点业务员不可见外派任务池', () => {
  assert.equal(canSeePoolTask(fieldPool, branchANormal), false)
})

test('外派能力业务员可见本网点外派任务池', () => {
  assert.equal(canSeePoolTask(fieldPool, branchAField), true)
})

test('业务员不可见其他网点到店任务', () => {
  assert.equal(canSeePoolTask({ ...storePool, branch_id: 2 }, branchANormal), false)
})

test('业务员不可见其他网点外派任务', () => {
  assert.equal(canSeePoolTask({ ...fieldPool, branch_id: 2 }, branchAField), false)
})

test('未接到店任务详情为摘要', () => {
  assert.deepEqual(assertSalesmanCanViewTask(storePool, branchANormal), { summaryOnly: true })
})

test('未接外派任务对普通业务员返回 403', () => {
  assert.throws(() => assertSalesmanCanViewTask(fieldPool, branchANormal), error => error.status === 403)
})

test('未接外派任务对外派业务员为摘要', () => {
  assert.deepEqual(assertSalesmanCanViewTask(fieldPool, branchAField), { summaryOnly: true })
})

test('负责人可查看完整任务', () => {
  assert.deepEqual(assertSalesmanCanViewTask({ ...fieldPool, assignee_user_id: 11 }, branchAField), { summaryOnly: false })
})

test('非负责人访问已领取任务返回 403', () => {
  assert.throws(
    () => assertSalesmanCanViewTask({ ...storePool, assignee_user_id: 11 }, branchANormal),
    error => error.status === 403
  )
})

test('未绑定网点的业务员返回 403', () => {
  assert.throws(() => assertSalesmanCanViewTask(storePool, { id: 99, branch_id: null }), error => error.status === 403)
})

test('停用网点的业务员返回 403', () => {
  assert.throws(
    () => assertSalesmanCanViewTask(storePool, { ...branchANormal, branch_status: 'DISABLED' }),
    error => error.status === 403
  )
})

test('加载业务员权限上下文时保留状态流转所需角色', async () => {
  const executor = {
    execute: async () => [[{
      id: 1,
      account_status: 'ACTIVE',
      branch_id: 10,
      branch_status: 'ACTIVE',
      can_field_service: 1
    }]]
  }
  const salesman = await loadSalesmanScope(executor, 1)
  assert.deepEqual(salesman.roles, ['salesman'])
})

test('普通业务员可领取到店任务', () => {
  assert.doesNotThrow(() => assertSalesmanCanAcceptTask(storePool, branchANormal))
})

test('普通业务员领取外派任务返回 403', () => {
  assert.throws(() => assertSalesmanCanAcceptTask(fieldPool, branchANormal), error => error.status === 403)
})

test('外派业务员可领取外派任务', () => {
  assert.doesNotThrow(() => assertSalesmanCanAcceptTask(fieldPool, branchAField))
})

test('重复领取本人的任务返回 409', () => {
  assert.throws(
    () => assertSalesmanCanAcceptTask({ ...storePool, assignee_user_id: 12 }, branchANormal),
    error => error.status === 409
  )
})

test('负责人操作自己的任务通过', () => {
  assert.doesNotThrow(() => assertSalesmanOwnsTask({ ...storePool, assignee_user_id: 12 }, branchANormal))
})

test('未领取任务不能执行办理操作', () => {
  assert.throws(() => assertSalesmanOwnsTask(storePool, branchANormal), error => error.status === 403)
})

test('外派任务不能转给无外派能力业务员', () => {
  assert.throws(
    () => assertTransferAllowed({ ...fieldPool, assignee_user_id: 11, status: 'PROCESSING' }, branchAField, { ...branchANormal, user_id: 12, account_status: 'ACTIVE' }),
    error => error.status === 403
  )
})

test('任务不能跨网点转接', () => {
  assert.throws(
    () => assertTransferAllowed({ ...storePool, assignee_user_id: 12, status: 'PROCESSING' }, branchANormal, { ...branchBField, user_id: 21, account_status: 'ACTIVE' }),
    error => error.status === 403
  )
})

test('到店任务可在同网点业务员间转接', () => {
  assert.doesNotThrow(() => assertTransferAllowed(
    { ...storePool, assignee_user_id: 12, status: 'PROCESSING' },
    branchANormal,
    { ...branchAField2, user_id: 13, account_status: 'ACTIVE' }
  ))
})

test('外派任务可转给同网点外派业务员', () => {
  assert.doesNotThrow(() => assertTransferAllowed(
    { ...fieldPool, assignee_user_id: 11, status: 'WAITING_CONTACT' },
    branchAField,
    { ...branchAField2, user_id: 13, account_status: 'ACTIVE' }
  ))
})

test('完成任务不能普通转接', () => {
  assert.throws(
    () => assertTransferAllowed({ ...storePool, assignee_user_id: 12, status: 'COMPLETED' }, branchANormal, { ...branchAField2, user_id: 13, account_status: 'ACTIVE' }),
    error => error.status === 409
  )
})

test('待客服核销任务不能普通转接', () => {
  assert.equal(TRANSFERABLE_TASK_STATUSES.includes('PENDING_VERIFICATION'), false)
})

test('管理员新表单不再提交 salesmanType', () => {
  const code = source('modules/admin/pages/accounts/index.js')
  assert.doesNotMatch(code, /form\.salesmanType|changeSalesmanType/)
  assert.match(code, /branchId/)
  assert.match(code, /canFieldService/)
})

test('登录会话保存网点与外派能力', () => {
  const code = source('services/auth-service.js')
  assert.match(code, /branchId: response\.user\.branchId/)
  assert.match(code, /branchName: response\.user\.branchName/)
  assert.match(code, /canFieldService: response\.user\.canFieldService/)
})

test('任务领取使用条件更新并检查 affectedRows', () => {
  const code = source('server/src/index.js')
  assert.match(code, /assignee_user_id IS NULL/)
  assert.match(code, /claimed\.affectedRows/)
  assert.match(code, /current_salesman_id IS NULL/)
})

test('抢单成功后进入待联系而不是停留在待领取', () => {
  const code = source('server/src/organization-api.js')
  assert.match(code, /status = 'WAITING_CONTACT', accepted_at = NOW\(3\)/)
  assert.match(code, /'ACCEPTED', 'WAITING_CONTACT'/)
})

test('旧订单操作也统一校验网点和外派能力', () => {
  const code = source('server/src/index.js')
  assert.match(code, /assertSameBranch\(application, user\)/)
  assert.match(code, /assertFieldServiceCapability\(application, user\)/)
})

test('客服网点派遣生成任务并保留 service_type', () => {
  const code = source('server/src/customer-service-assignment-service.js')
  assert.match(code, /order\.service_mode \|\| 'STORE_SERVICE'/)
  assert.match(code, /branch_id/)
  assert.match(code, /assignee_user_id = NULL/)
})

test('新业务授权模块不依赖 salesman_type', () => {
  assert.doesNotMatch(source('server/src/salesman-access.js'), /salesman_type|HOME_VISIT/)
})

test('迁移保留旧负责人并回填当前负责人', () => {
  const migration = source('database/migrations/20260723_unify_salesman_branch_capability.sql')
  assert.match(migration, /current_salesman_id = assigned_salesman_user_id/)
  assert.doesNotMatch(migration, /DELETE FROM users|DELETE FROM user_roles/)
})
