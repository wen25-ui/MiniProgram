const test = require('node:test')
const assert = require('node:assert/strict')
const {
  reviewStatus, organizationStatus, assertBranchAssignment,
  assertManagerBranch, assertSalesmanBranch, assertGrab, assertTransfer
} = require('../src/organization-rules')

test('客服派网点只允许待派遣订单且不能重复派遣', () => {
  assert.doesNotThrow(() => assertBranchAssignment({ status: 'CONFIRMED', branch_id: null }))
  assert.throws(() => assertBranchAssignment({ status: 'ASSIGNED', branch_id: 10 }), /不能指派网点/)
  assert.equal(organizationStatus({ status: 'ASSIGNED', branch_id: 10 }), 'BRANCH_ASSIGNED')
})

test('网点负责人只能分配本网点业务员', () => {
  assert.doesNotThrow(() => assertManagerBranch([10], 10))
  assert.doesNotThrow(() => assertSalesmanBranch({ branch_id: 10 }, 10))
  assert.throws(() => assertSalesmanBranch({ branch_id: 11 }, 10), /不属于当前网点/)
})

test('抢单竞争时已存在负责人必须失败', () => {
  assert.doesNotThrow(() => assertGrab({ branch_id: 10, current_salesman_id: null }, 10))
  assert.throws(() => assertGrab({ branch_id: 10, current_salesman_id: 20 }, 10), /已被其他业务员抢走/)
})

test('业务员转接只能转给同网点其他业务员', () => {
  const order = { branch_id: 10, current_salesman_id: 20 }
  assert.doesNotThrow(() => assertTransfer(order, 20, { user_id: 21, branch_id: 10 }))
  assert.throws(() => assertTransfer(order, 20, { user_id: 20, branch_id: 10 }), /不能将订单转给自己/)
  assert.throws(() => assertTransfer(order, 20, { user_id: 22, branch_id: 11 }), /不属于当前网点/)
})

test('权限和审核状态映射符合新流程', () => {
  assert.throws(() => assertManagerBranch([10], 11), /无权处理其他网点订单/)
  assert.throws(() => assertGrab({ branch_id: 11, current_salesman_id: null }, 10), /无权抢其他网点订单/)
  assert.equal(reviewStatus({ status: 'PENDING', contact_result: null }), 'WAIT_REVIEW')
  assert.equal(reviewStatus({ status: 'CONTACTING', contact_result: 'UNREACHABLE' }), 'WAIT_RECONTACT')
})
