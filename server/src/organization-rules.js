const ASSIGN_TYPES = Object.freeze({
  BRANCH_ASSIGN: 'BRANCH_ASSIGN',
  SALESMAN_GRAB: 'SALESMAN_GRAB',
  TRANSFER: 'TRANSFER'
})

function businessError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function reviewStatus(order) {
  if (order.contact_result === 'UNREACHABLE') return 'WAIT_RECONTACT'
  return order.status === 'PENDING' ? 'WAIT_REVIEW' : order.status
}

function organizationStatus(order) {
  if (order.status === 'COMPLETED' || order.status === 'SERVICE_COMPLETED') return 'FINISHED'
  if (order.current_salesman_id) return order.status === 'PROCESSING' ? 'PROCESSING' : 'SALESMAN_PROCESSING'
  if (order.branch_id) return 'BRANCH_ASSIGNED'
  if (order.status === 'CONFIRMED' || order.status === 'DISPATCHING') return 'WAIT_BRANCH'
  return order.status
}

function assertBranchAssignment(order) {
  if (!order) throw businessError('订单不存在', 404)
  if (!['CONFIRMED', 'DISPATCHING'].includes(order.status)) throw businessError('订单当前状态不能指派网点', 409)
  if (order.branch_id) throw businessError('订单已经指派网点，不能重复操作', 409)
}

function assertManagerBranch(managerBranchIds, orderBranchId) {
  if (!managerBranchIds.map(Number).includes(Number(orderBranchId))) throw businessError('无权处理其他网点订单', 403)
}

function assertSalesmanBranch(salesman, branchId) {
  if (!salesman) throw businessError('业务员不存在', 404)
  if (Number(salesman.branch_id) !== Number(branchId)) throw businessError('业务员不属于当前网点', 400)
}

function assertGrab(order, salesmanBranchId) {
  if (!order) throw businessError('订单不存在', 404)
  if (Number(order.branch_id) !== Number(salesmanBranchId)) throw businessError('无权抢其他网点订单', 403)
  if (order.current_salesman_id) throw businessError('订单已被其他业务员抢走', 409)
}

function assertTransfer(order, fromUserId, target) {
  if (!order) throw businessError('订单不存在', 404)
  if (Number(order.current_salesman_id) !== Number(fromUserId)) throw businessError('只能转接自己负责的订单', 403)
  if (Number(fromUserId) === Number(target && target.user_id)) throw businessError('不能将订单转给自己', 400)
  assertSalesmanBranch(target, order.branch_id)
}

module.exports = {
  ASSIGN_TYPES,
  businessError,
  reviewStatus,
  organizationStatus,
  assertBranchAssignment,
  assertManagerBranch,
  assertSalesmanBranch,
  assertGrab,
  assertTransfer
}
