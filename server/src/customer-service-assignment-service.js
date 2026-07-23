const crypto = require('crypto')
const { ASSIGN_TYPES } = require('./organization-rules')
const {
  requireAssignedCustomerServiceTask,
  transitionCustomerServiceTask
} = require('./customer-service-task-service')

function businessError(message, status) {
  return Object.assign(new Error(message), { status })
}

async function recommendedBranches(order, executor) {
  const [candidates] = await executor.execute(
    `SELECT b.id, b.merchant_id, b.name, m.area_id
       FROM branches b
       JOIN merchants m ON m.id = b.merchant_id AND m.status = 'ACTIVE'
       JOIN sys_area district ON district.id = m.area_id
       JOIN sys_area city ON city.id = district.parent_id
      WHERE b.status = 'ACTIVE' AND city.name = '成都市'
      ORDER BY b.id`
  )
  const sameArea = candidates.filter(item => Number(item.area_id) === Number(order.district_area_id))
  if (sameArea.length) return { candidates: sameArea, matchLevel: 'SAME_DISTRICT' }
  const [neighbors] = await executor.execute(
    'SELECT neighbor_area_id FROM sys_area_neighbor WHERE area_id = ? ORDER BY sort_order',
    [order.district_area_id]
  )
  for (const neighbor of neighbors) {
    const matched = candidates.filter(item => Number(item.area_id) === Number(neighbor.neighbor_area_id))
    if (matched.length) return { candidates: matched, matchLevel: 'NEIGHBOR_DISTRICT' }
  }
  return { candidates, matchLevel: 'CHENGDU_FALLBACK' }
}

async function resolveBranch(branchId, outletId, executor) {
  if (branchId) {
    const [[branch]] = await executor.execute(
      `SELECT b.id, b.merchant_id, b.name, b.address, m.area_id, m.service_region
         FROM branches b
         JOIN merchants m ON m.id = b.merchant_id AND m.status = 'ACTIVE'
        WHERE b.id = ? AND b.status = 'ACTIVE'`,
      [branchId]
    )
    return branch || null
  }
  const [[branch]] = await executor.execute(
    `SELECT b.id, b.merchant_id, b.name, b.address, m.area_id, m.service_region
       FROM branches b
       JOIN merchants m ON m.id = b.merchant_id AND m.status = 'ACTIVE'
      WHERE b.merchant_id = ? AND b.status = 'ACTIVE'
      ORDER BY b.id
      LIMIT 1`,
    [outletId]
  )
  return branch || null
}

async function ensureApplicationTask(order, branch, operator, executor) {
  const [[existing]] = await executor.execute(
    'SELECT id FROM application_tasks WHERE application_id = ? FOR UPDATE',
    [order.id]
  )
  if (existing) {
    await executor.execute(
      `UPDATE application_tasks
          SET store_id = ?, branch_id = ?, assignee_user_id = NULL, assign_type = ?
        WHERE id = ?`,
      [branch.merchant_id, branch.id, ASSIGN_TYPES.BRANCH_ASSIGN, existing.id]
    )
    return existing.id
  }
  const taskId = crypto.randomUUID()
  await executor.execute(
    `INSERT INTO application_tasks
      (id, application_id, service_type, assignee_user_id, store_id, branch_id, assign_type,
       customer_id, customer_name, customer_phone, service_address, status, appointment_time)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ACCEPT', ?)`,
    [
      taskId,
      order.id,
      order.service_mode || 'STORE_SERVICE',
      branch.merchant_id,
      branch.id,
      ASSIGN_TYPES.BRANCH_ASSIGN,
      order.client_user_id,
      order.customer_name || null,
      order.phone_snapshot,
      order.service_address || order.detail_address || null,
      order.appointment_time || null
    ]
  )
  await executor.execute(
    `INSERT INTO application_task_status_history
      (task_id, old_status, new_status, operator_user_id, operator_role, operation, metadata)
     VALUES (?, NULL, 'PENDING_ACCEPT', ?, 'customer-service', 'TASK_CREATED_BY_BRANCH_DISPATCH', ?)`,
    [taskId, operator.id, JSON.stringify({ applicationId: order.id, branchId: branch.id })]
  )
  return taskId
}

async function prepareCustomerServiceTaskForDispatch(applicationId, operator, executor) {
  let task = await requireAssignedCustomerServiceTask(applicationId, operator, executor, true)
  if (!task) return null
  if (task.status === 'TIMEOUT') {
    task = await transitionCustomerServiceTask(
      applicationId,
      'PROCESSING',
      'TASK_RESUMED_FOR_DISPATCH',
      operator,
      executor
    )
  }
  if (task.status === 'PROCESSING') {
    task = await transitionCustomerServiceTask(
      applicationId,
      'WAIT_DISPATCH',
      'TASK_READY_FOR_DISPATCH',
      operator,
      executor
    )
  }
  if (task.status !== 'WAIT_DISPATCH') {
    throw businessError('客服任务当前状态不能派遣网点', 409)
  }
  return task
}

async function assignApplicationToBranch({
  applicationId,
  branchId,
  outletId,
  operator,
  executor
}) {
  const [[order]] = await executor.execute(
    `SELECT a.*, COALESCE(u.display_name, '') AS customer_name
       FROM applications a
       JOIN users u ON u.id = a.client_user_id
      WHERE a.id = ?
      FOR UPDATE`,
    [applicationId]
  )
  if (!order) throw businessError('申请不存在', 404)
  await prepareCustomerServiceTaskForDispatch(applicationId, operator, executor)
  if (order.status !== 'CONFIRMED' || order.branch_id) {
    throw businessError('当前申请不能指派网点', 409)
  }
  if (!order.district_area_id) throw businessError('申请尚未关联客户所在区县', 400)

  const branch = await resolveBranch(branchId, outletId, executor)
  if (!branch) throw businessError('请选择有效的办理网点', 404)
  const recommendation = await recommendedBranches(order, executor)
  if (!recommendation.candidates.some(item => Number(item.id) === Number(branch.id))) {
    throw businessError('请选择当前推荐层级内的网点', 400)
  }

  const [updated] = await executor.execute(
    `UPDATE applications
        SET branch_id = ?, assigned_merchant_id = ?,
            current_salesman_id = NULL, assigned_salesman_user_id = NULL,
            assign_type = ?, status = 'ASSIGNED'
      WHERE id = ? AND status = 'CONFIRMED' AND branch_id IS NULL`,
    [branch.id, branch.merchant_id, ASSIGN_TYPES.BRANCH_ASSIGN, applicationId]
  )
  if (!updated.affectedRows) throw businessError('申请状态已变化，请刷新后重试', 409)

  await executor.execute(
    `INSERT INTO application_status_history
      (application_id, from_status, to_status, action_code, operator_user_id, operator_role, metadata)
     VALUES
      (?, 'CONFIRMED', 'DISPATCHING', 'DISPATCH_STARTED', ?, 'customer-service', ?),
      (?, 'DISPATCHING', 'ASSIGNED', 'ASSIGN_BRANCH', ?, 'customer-service', ?)`,
    [
      applicationId,
      operator.id,
      JSON.stringify({ branchId: branch.id }),
      applicationId,
      operator.id,
      JSON.stringify({
        branchId: branch.id,
        branchName: branch.name,
        matchLevel: recommendation.matchLevel
      })
    ]
  )
  await executor.execute(
    `INSERT INTO application_dispatches
      (application_id, salesman_user_id, submitted_by_user_id, dispatcher_user_id, note)
     VALUES (?, NULL, ?, ?, ?)`,
    [applicationId, operator.id, operator.id, `网点:${branch.id}`]
  )
  const applicationTaskId = await ensureApplicationTask(order, branch, operator, executor)
  await executor.execute(
    `INSERT INTO order_assignments
      (order_id, branch_id, salesman_id, assign_type, operator_id)
     VALUES (?, ?, NULL, ?, ?)`,
    [applicationId, branch.id, ASSIGN_TYPES.BRANCH_ASSIGN, operator.id]
  )
  const customerServiceTask = await requireAssignedCustomerServiceTask(applicationId, operator, executor, true)
  if (customerServiceTask) {
    await transitionCustomerServiceTask(
      applicationId,
      'COMPLETED',
      'TASK_COMPLETED_BY_BRANCH_DISPATCH',
      operator,
      executor,
      { metadata: { branchId: branch.id, applicationTaskId } }
    )
  }
  return {
    applicationId,
    orderId: applicationId,
    branchId: branch.id,
    branchName: branch.name,
    merchantId: branch.merchant_id,
    applicationTaskId,
    status: 'BRANCH_ASSIGNED',
    matchLevel: recommendation.matchLevel
  }
}

module.exports = {
  recommendedBranches,
  resolveBranch,
  ensureApplicationTask,
  assignApplicationToBranch
}
