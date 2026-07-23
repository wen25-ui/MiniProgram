const FIELD_SERVICE_TYPE = 'HOME_SERVICE'
const STORE_SERVICE_TYPE = 'STORE_SERVICE'

const TRANSFERABLE_TASK_STATUSES = Object.freeze([
  'ACCEPTED',
  'WAITING_CONTACT',
  'CONTACT_FAILED',
  'CONTACTED',
  'WAITING_TIME_CONFIRMATION',
  'TIME_CONFIRMED',
  'WAITING_HOME_SERVICE',
  'WAITING_CUSTOMER_ARRIVAL',
  'WAITING_START_CONFIRMATION',
  'PROCESSING',
  'WAITING_RESULT_UPLOAD'
])

function forbidden(message) {
  return Object.assign(new Error(message), { status: 403 })
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 })
}

function branchIdOf(task) {
  return Number(task && (task.branch_id || task.order_branch_id) || 0)
}

function assigneeIdOf(task) {
  return Number(task && (task.assignee_user_id || task.current_salesman_id) || 0)
}

function canFieldService(salesman) {
  return Boolean(Number(salesman && salesman.can_field_service))
}

function assertSalesmanOrganization(salesman) {
  if (!salesman || !Number(salesman.branch_id) || salesman.branch_status === 'DISABLED') {
    throw forbidden('当前业务员未绑定有效网点，请联系管理员')
  }
}

function assertSameBranch(task, salesman) {
  assertSalesmanOrganization(salesman)
  if (!branchIdOf(task)) throw conflict('任务尚未绑定负责网点')
  if (branchIdOf(task) !== Number(salesman.branch_id)) {
    throw forbidden('无权访问其他网点任务')
  }
}

function assertFieldServiceCapability(task, salesman) {
  if (task && task.service_type === FIELD_SERVICE_TYPE && !canFieldService(salesman)) {
    throw forbidden('当前账号未开通外派任务能力')
  }
}

function assertSalesmanCanViewTask(task, salesman) {
  if (!task) throw Object.assign(new Error('任务不存在'), { status: 404 })
  assertSameBranch(task, salesman)
  assertFieldServiceCapability(task, salesman)
  const assigneeId = assigneeIdOf(task)
  if (assigneeId && assigneeId !== Number(salesman.id)) {
    throw forbidden('该任务已由其他业务员负责')
  }
  return { summaryOnly: !assigneeId }
}

function assertSalesmanCanAcceptTask(task, salesman) {
  const access = assertSalesmanCanViewTask(task, salesman)
  if (!access.summaryOnly) {
    if (assigneeIdOf(task) === Number(salesman.id)) throw conflict('该任务已由你领取')
    throw conflict('该任务已被其他业务员领取')
  }
  if (task.status !== 'PENDING_ACCEPT') throw conflict('当前任务不可领取')
}

function assertSalesmanOwnsTask(task, salesman) {
  assertSalesmanCanViewTask(task, salesman)
  if (assigneeIdOf(task) !== Number(salesman.id)) {
    throw forbidden('只有当前负责人可以处理该任务')
  }
}

function assertTransferAllowed(task, salesman, target) {
  assertSalesmanOwnsTask(task, salesman)
  if (!TRANSFERABLE_TASK_STATUSES.includes(task.status)) {
    throw conflict('当前任务状态不允许转接')
  }
  if (!target || target.account_status !== 'ACTIVE') throw forbidden('接收业务员账号不可用')
  if (Number(target.user_id || target.id) === Number(salesman.id)) {
    throw Object.assign(new Error('不能将任务转接给自己'), { status: 400 })
  }
  if (Number(target.branch_id) !== Number(salesman.branch_id)) {
    throw forbidden('任务只能在同一网点内转接')
  }
  if (task.service_type === FIELD_SERVICE_TYPE && !canFieldService(target)) {
    throw forbidden('接收业务员未开通外派任务能力')
  }
}

function canSeePoolTask(task, salesman) {
  try {
    assertSameBranch(task, salesman)
    assertFieldServiceCapability(task, salesman)
    return !assigneeIdOf(task)
  } catch (_) {
    return false
  }
}

async function loadSalesmanScope(executor, userId) {
  const [[salesman]] = await executor.execute(
    `SELECT u.id, u.account_status, ur.salesman_code, ur.branch_id, ur.can_field_service,
            b.name AS branch_name, b.status AS branch_status, b.merchant_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'salesman'
       LEFT JOIN branches b ON b.id = ur.branch_id
      WHERE u.id = ?`,
    [userId]
  )
  if (!salesman || salesman.account_status !== 'ACTIVE') throw forbidden('业务员账号不可用')
  assertSalesmanOrganization(salesman)
  salesman.roles = ['salesman']
  return salesman
}

module.exports = {
  FIELD_SERVICE_TYPE,
  STORE_SERVICE_TYPE,
  TRANSFERABLE_TASK_STATUSES,
  assertFieldServiceCapability,
  assertSalesmanCanAcceptTask,
  assertSalesmanCanViewTask,
  assertSalesmanOrganization,
  assertSalesmanOwnsTask,
  assertSameBranch,
  assertTransferAllowed,
  branchIdOf,
  canFieldService,
  canSeePoolTask,
  loadSalesmanScope
}
