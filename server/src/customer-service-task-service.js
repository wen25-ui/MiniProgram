const crypto = require('crypto')
const {
  CUSTOMER_SERVICE_TASK_STATUS_TEXT,
  CUSTOMER_SERVICE_TASK_ACTIVE_STATUSES,
  canTransitionCustomerServiceTask,
  customerServiceTaskStatusForApplication
} = require('../../domain/task/customer-service-status')

const DEFAULT_DUE_HOURS = Number(process.env.CUSTOMER_SERVICE_TASK_DUE_HOURS || 24)

function businessError(message, status) {
  return Object.assign(new Error(message), { status })
}

function chooseCustomerServiceAssignee(candidates) {
  return candidates.slice().sort((left, right) => {
    const countDifference = Number(left.active_task_count || 0) - Number(right.active_task_count || 0)
    if (countDifference) return countDifference
    const leftTime = left.last_assigned_at ? new Date(left.last_assigned_at).getTime() : 0
    const rightTime = right.last_assigned_at ? new Date(right.last_assigned_at).getTime() : 0
    if (leftTime !== rightTime) return leftTime - rightTime
    return Number(left.id) - Number(right.id)
  })[0] || null
}

function elapsedMinutes(row, now = new Date()) {
  const started = row.started_at || row.assigned_at
  const ended = row.completed_at || row.transferred_at || now
  if (!started) return 0
  return Math.max(0, Math.floor((new Date(ended).getTime() - new Date(started).getTime()) / 60000))
}

function customerServiceTaskView(row, now = new Date()) {
  const minutes = elapsedMinutes(row, now)
  const status = row.status
  return {
    id: row.id,
    taskId: row.id,
    orderId: row.application_id,
    applicationId: row.application_id,
    assigneeId: row.assignee_user_id,
    assignee: row.assignee_name || '',
    assigneeName: row.assignee_name || '',
    assignedAt: row.assigned_at,
    startedAt: row.started_at || null,
    waitDispatchAt: row.wait_dispatch_at || null,
    completedAt: row.completed_at || null,
    dueAt: row.due_at || null,
    status,
    taskStatus: status,
    statusText: CUSTOMER_SERVICE_TASK_STATUS_TEXT[status] || status,
    taskStatusText: CUSTOMER_SERVICE_TASK_STATUS_TEXT[status] || status,
    elapsedMinutes: minutes,
    duration: `${minutes}分钟`,
    isTimeout: status === 'TIMEOUT',
    updatedAt: row.updated_at
  }
}

async function findTaskByApplication(applicationId, executor, locking = false) {
  const [[task]] = await executor.execute(
    `SELECT t.*, COALESCE(u.display_name, u.phone, u.login_name, '') AS assignee_name
       FROM customer_service_tasks t
       JOIN users u ON u.id = t.assignee_user_id
      WHERE t.application_id = ?${locking ? ' FOR UPDATE' : ''}`,
    [applicationId]
  )
  return task || null
}

async function findTaskById(taskId, executor, locking = false) {
  const [[task]] = await executor.execute(
    `SELECT t.*, COALESCE(u.display_name, u.phone, u.login_name, '') AS assignee_name
       FROM customer_service_tasks t
       JOIN users u ON u.id = t.assignee_user_id
      WHERE t.id = ?${locking ? ' FOR UPDATE' : ''}`,
    [taskId]
  )
  return task || null
}

async function ensureCustomerServiceTask(applicationId, executor, options = {}) {
  const existing = await findTaskByApplication(applicationId, executor, true)
  if (existing) return { task: existing, created: false, reason: 'EXISTS' }

  const [availableUsers] = await executor.execute(
    `SELECT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'customer-service'
      WHERE u.account_status = 'ACTIVE'
      ORDER BY u.id
      FOR UPDATE`
  )
  if (!availableUsers.length) {
    const logger = options.logger || console
    logger.warn(`No active customer-service user for application ${applicationId}`)
    return { task: null, created: false, reason: 'NO_ASSIGNEE' }
  }

  const userIds = availableUsers.map(row => Number(row.id))
  const placeholders = userIds.map(() => '?').join(',')
  const [loads] = await executor.execute(
    `SELECT u.id,
            SUM(CASE WHEN t.status IN (${CUSTOMER_SERVICE_TASK_ACTIVE_STATUSES.map(() => '?').join(',')})
                     THEN 1 ELSE 0 END) AS active_task_count,
            MAX(t.assigned_at) AS last_assigned_at
       FROM users u
       LEFT JOIN customer_service_tasks t ON t.assignee_user_id = u.id
      WHERE u.id IN (${placeholders})
      GROUP BY u.id`,
    [...CUSTOMER_SERVICE_TASK_ACTIVE_STATUSES, ...userIds]
  )
  const assignee = chooseCustomerServiceAssignee(loads)
  if (!assignee) return { task: null, created: false, reason: 'NO_ASSIGNEE' }

  const taskId = (options.randomUUID || crypto.randomUUID)()
  const dueHours = Number(options.dueHours || DEFAULT_DUE_HOURS)
  try {
    await executor.execute(
      `INSERT INTO customer_service_tasks
        (id, application_id, assignee_user_id, status, assigned_at, due_at)
       VALUES (?, ?, ?, 'ASSIGNED', NOW(3), DATE_ADD(NOW(3), INTERVAL ? HOUR))`,
      [taskId, applicationId, assignee.id, dueHours]
    )
    await executor.execute(
      `INSERT INTO customer_service_task_events
        (task_id, from_status, to_status, action_code, operator_user_id, metadata)
       VALUES (?, NULL, 'ASSIGNED', 'TASK_ASSIGNED', NULL, ?)`,
      [taskId, JSON.stringify({ applicationId, strategy: 'LEAST_ACTIVE_THEN_OLDEST' })]
    )
  } catch (cause) {
    if (cause.code !== 'ER_DUP_ENTRY') throw cause
    const concurrent = await findTaskByApplication(applicationId, executor, true)
    if (concurrent) return { task: concurrent, created: false, reason: 'CONCURRENT_EXISTS' }
    throw cause
  }
  const task = await findTaskById(taskId, executor)
  return {
    task: task || {
      id: taskId,
      application_id: applicationId,
      assignee_user_id: assignee.id,
      status: 'ASSIGNED'
    },
    created: true,
    reason: 'CREATED'
  }
}

async function requireAssignedCustomerServiceTask(applicationId, user, executor, locking = false) {
  const task = await findTaskByApplication(applicationId, executor, locking)
  if (!task) return null
  if (Number(task.assignee_user_id) !== Number(user.id) || task.status === 'TRANSFERRED') {
    throw businessError('无权处理该客服任务', 403)
  }
  return task
}

async function requireCustomerServiceTaskById(taskId, user, executor, locking = false) {
  const task = await findTaskById(taskId, executor, locking)
  if (!task) throw businessError('客服任务不存在', 404)
  if (Number(task.assignee_user_id) !== Number(user.id) || task.status === 'TRANSFERRED') {
    throw businessError('无权处理该客服任务', 403)
  }
  return task
}

function statusTimestampAssignment(toStatus, dueHours) {
  if (toStatus === 'PROCESSING') {
    return { sql: 'started_at = COALESCE(started_at, NOW(3)), due_at = DATE_ADD(NOW(3), INTERVAL ? HOUR)', params: [dueHours] }
  }
  if (toStatus === 'WAIT_DISPATCH') return { sql: 'wait_dispatch_at = COALESCE(wait_dispatch_at, NOW(3))', params: [] }
  if (toStatus === 'COMPLETED') return { sql: 'completed_at = COALESCE(completed_at, NOW(3))', params: [] }
  if (toStatus === 'TRANSFERRED') return { sql: 'transferred_at = COALESCE(transferred_at, NOW(3))', params: [] }
  return { sql: 'updated_at = NOW(3)', params: [] }
}

async function transitionTaskRow(task, toStatus, actionCode, operatorUserId, executor, options = {}) {
  if (task.status === toStatus) return task
  if (!canTransitionCustomerServiceTask(task.status, toStatus)) {
    throw businessError(`客服任务不能从 ${task.status} 变更为 ${toStatus}`, 409)
  }
  const dueHours = Number(options.dueHours || DEFAULT_DUE_HOURS)
  const assignment = statusTimestampAssignment(toStatus, dueHours)
  const [result] = await executor.execute(
    `UPDATE customer_service_tasks
        SET status = ?, ${assignment.sql}
      WHERE id = ? AND status = ?`,
    [toStatus, ...assignment.params, task.id, task.status]
  )
  if (!result.affectedRows) throw businessError('客服任务状态已变化，请刷新后重试', 409)
  await executor.execute(
    `INSERT INTO customer_service_task_events
      (task_id, from_status, to_status, action_code, operator_user_id, remark, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.status,
      toStatus,
      actionCode,
      operatorUserId || null,
      options.remark || null,
      JSON.stringify(options.metadata || {})
    ]
  )
  return Object.assign({}, task, { status: toStatus })
}

async function transitionCustomerServiceTask(applicationId, toStatus, actionCode, user, executor, options = {}) {
  const task = await requireAssignedCustomerServiceTask(applicationId, user, executor, true)
  if (!task) return null
  return transitionTaskRow(task, toStatus, actionCode, user.id, executor, options)
}

async function resumeTimedOutCustomerServiceTask(applicationId, user, executor) {
  const task = await requireAssignedCustomerServiceTask(applicationId, user, executor, true)
  if (!task || task.status !== 'TIMEOUT') return task
  return transitionTaskRow(task, 'PROCESSING', 'TASK_RESUMED', user.id, executor)
}

async function refreshExpiredCustomerServiceTasks(userId, executor) {
  const [expired] = await executor.execute(
    `SELECT *
       FROM customer_service_tasks
      WHERE assignee_user_id = ?
        AND due_at < NOW(3)
        AND status IN ('ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH')
      ORDER BY due_at, id
      FOR UPDATE`,
    [userId]
  )
  let updated = 0
  for (const task of expired) {
    const [result] = await executor.execute(
      `UPDATE customer_service_tasks
          SET status = 'TIMEOUT'
        WHERE id = ? AND status = ?`,
      [task.id, task.status]
    )
    if (!result.affectedRows) continue
    await executor.execute(
      `INSERT INTO customer_service_task_events
        (task_id, from_status, to_status, action_code, operator_user_id, metadata)
       VALUES (?, ?, 'TIMEOUT', 'TASK_TIMEOUT', NULL, ?)`,
      [task.id, task.status, JSON.stringify({ dueAt: task.due_at })]
    )
    updated += 1
  }
  return updated
}

async function synchronizeCustomerServiceTask(applicationId, applicationStatus, executor) {
  const target = customerServiceTaskStatusForApplication(applicationStatus)
  let task = await findTaskByApplication(applicationId, executor, true)
  if (!task || !target || task.status === target) return task
  if (target === 'PROCESSING' && task.status === 'ASSIGNED') {
    return transitionTaskRow(task, 'PROCESSING', 'TASK_BACKFILLED_PROCESSING', null, executor)
  }
  if (target === 'WAIT_DISPATCH') {
    if (task.status === 'ASSIGNED') {
      task = await transitionTaskRow(task, 'PROCESSING', 'TASK_BACKFILLED_PROCESSING', null, executor)
    }
    if (task.status === 'PROCESSING') {
      return transitionTaskRow(task, 'WAIT_DISPATCH', 'TASK_BACKFILLED_WAIT_DISPATCH', null, executor)
    }
  }
  return task
}

module.exports = {
  chooseCustomerServiceAssignee,
  elapsedMinutes,
  customerServiceTaskView,
  findTaskByApplication,
  ensureCustomerServiceTask,
  requireAssignedCustomerServiceTask,
  requireCustomerServiceTaskById,
  transitionCustomerServiceTask,
  resumeTimedOutCustomerServiceTask,
  refreshExpiredCustomerServiceTasks,
  synchronizeCustomerServiceTask
}
