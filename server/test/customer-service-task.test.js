const test = require('node:test')
const assert = require('node:assert/strict')
const {
  chooseCustomerServiceAssignee,
  customerServiceTaskView,
  ensureCustomerServiceTask,
  requireAssignedCustomerServiceTask,
  transitionCustomerServiceTask,
  resumeTimedOutCustomerServiceTask,
  refreshExpiredCustomerServiceTasks
} = require('../src/customer-service-task-service')
const {
  canTransitionCustomerServiceTask,
  customerServiceTaskStatusForApplication
} = require('../../domain/task/customer-service-status')
const { assignApplicationToBranch } = require('../src/customer-service-assignment-service')
const { backfillCustomerServiceTasks } = require('../scripts/backfill-customer-service-tasks')

class MemoryExecutor {
  constructor({ users = [], tasks = [], applications = [] } = {}) {
    this.users = users
    this.tasks = tasks
    this.applications = applications
    this.events = []
    this.applicationTasks = []
    this.now = new Date('2026-07-23T02:00:00.000Z')
  }

  async beginTransaction() {}
  async commit() {}
  async rollback() {}
  release() {}
  async getConnection() { return this }

  taskWithAssignee(task) {
    if (!task) return null
    const user = this.users.find(item => Number(item.id) === Number(task.assignee_user_id)) || {}
    return Object.assign({}, task, { assignee_name: user.display_name || `客服${task.assignee_user_id}` })
  }

  async execute(sql, params = []) {
    const query = sql.replace(/\s+/g, ' ').trim()
    if (query.includes('FROM customer_service_tasks t') && query.includes('WHERE t.application_id = ?')) {
      const task = this.tasks.find(item => item.application_id === params[0])
      return [[this.taskWithAssignee(task)].filter(Boolean)]
    }
    if (query.includes('FROM customer_service_tasks t') && query.includes('WHERE t.id = ?')) {
      const task = this.tasks.find(item => item.id === params[0])
      return [[this.taskWithAssignee(task)].filter(Boolean)]
    }
    if (query.startsWith('SELECT u.id') && query.includes('JOIN user_roles')) {
      return [this.users.filter(item => item.active !== false).map(item => ({ id: item.id }))]
    }
    if (query.startsWith('SELECT u.id,') && query.includes('active_task_count')) {
      const active = new Set(['ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH', 'TIMEOUT'])
      return [this.users.filter(item => item.active !== false).map(user => {
        const assigned = this.tasks.filter(task => Number(task.assignee_user_id) === Number(user.id))
        const activeTasks = assigned.filter(task => active.has(task.status))
        const times = assigned.map(task => task.assigned_at).filter(Boolean).sort()
        return {
          id: user.id,
          active_task_count: activeTasks.length,
          last_assigned_at: times.length ? times[times.length - 1] : null
        }
      })]
    }
    if (query.startsWith('INSERT INTO customer_service_tasks')) {
      if (this.tasks.some(task => task.application_id === params[1])) {
        const error = new Error('duplicate')
        error.code = 'ER_DUP_ENTRY'
        throw error
      }
      this.tasks.push({
        id: params[0],
        application_id: params[1],
        assignee_user_id: params[2],
        status: 'ASSIGNED',
        assigned_at: this.now,
        started_at: null,
        wait_dispatch_at: null,
        completed_at: null,
        transferred_at: null,
        due_at: new Date(this.now.getTime() + Number(params[3]) * 3600000),
        updated_at: this.now
      })
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('INSERT INTO customer_service_task_events')) {
      if (query.includes("'TASK_ASSIGNED'")) {
        this.events.push({ task_id: params[0], from_status: null, to_status: 'ASSIGNED', action_code: 'TASK_ASSIGNED' })
      } else if (query.includes("'TASK_TIMEOUT'")) {
        this.events.push({ task_id: params[0], from_status: params[1], to_status: 'TIMEOUT', action_code: 'TASK_TIMEOUT' })
      } else {
        this.events.push({
          task_id: params[0],
          from_status: params[1],
          to_status: params[2],
          action_code: params[3],
          operator_user_id: params[4]
        })
      }
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('UPDATE customer_service_tasks') && query.includes('SET status = ?')) {
      const to = params[0]
      const id = params[params.length - 2]
      const from = params[params.length - 1]
      const task = this.tasks.find(item => item.id === id && item.status === from)
      if (!task) return [{ affectedRows: 0 }]
      task.status = to
      task.updated_at = this.now
      if (to === 'PROCESSING') task.started_at = task.started_at || this.now
      if (to === 'WAIT_DISPATCH') task.wait_dispatch_at = task.wait_dispatch_at || this.now
      if (to === 'COMPLETED') task.completed_at = task.completed_at || this.now
      if (to === 'TRANSFERRED') task.transferred_at = task.transferred_at || this.now
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('SELECT * FROM customer_service_tasks') && query.includes('due_at < NOW')) {
      return [this.tasks.filter(task => Number(task.assignee_user_id) === Number(params[0]) &&
        ['ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH'].includes(task.status) &&
        new Date(task.due_at) < this.now)]
    }
    if (query.startsWith('UPDATE customer_service_tasks') && query.includes("SET status = 'TIMEOUT'")) {
      const task = this.tasks.find(item => item.id === params[0] && item.status === params[1])
      if (!task) return [{ affectedRows: 0 }]
      task.status = 'TIMEOUT'
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('SELECT id, status FROM applications')) {
      return [this.applications.map(item => ({ id: item.id, status: item.status }))]
    }
    throw new Error(`Unhandled SQL in test: ${query}`)
  }
}

test('自动分配创建独立客服任务并记录事件', async () => {
  const executor = new MemoryExecutor({ users: [{ id: 2 }, { id: 1 }] })
  const result = await ensureCustomerServiceTask('application-1', executor, {
    randomUUID: () => 'task-1',
    dueHours: 12
  })
  assert.equal(result.created, true)
  assert.equal(result.task.assignee_user_id, 1)
  assert.equal(executor.tasks[0].status, 'ASSIGNED')
  assert.equal(executor.events[0].action_code, 'TASK_ASSIGNED')
})

test('同一申请重复确保任务保持幂等', async () => {
  const executor = new MemoryExecutor({ users: [{ id: 1 }] })
  await ensureCustomerServiceTask('application-1', executor, { randomUUID: () => 'task-1' })
  const repeated = await ensureCustomerServiceTask('application-1', executor, { randomUUID: () => 'task-2' })
  assert.equal(repeated.created, false)
  assert.equal(repeated.reason, 'EXISTS')
  assert.equal(executor.tasks.length, 1)
})

test('自动分配优先未完成任务最少的客服', async () => {
  const executor = new MemoryExecutor({
    users: [{ id: 1 }, { id: 2 }],
    tasks: [{
      id: 'existing',
      application_id: 'old',
      assignee_user_id: 1,
      status: 'PROCESSING',
      assigned_at: new Date('2026-07-22T00:00:00Z')
    }]
  })
  const result = await ensureCustomerServiceTask('application-2', executor, { randomUUID: () => 'task-2' })
  assert.equal(result.task.assignee_user_id, 2)
})

test('任务数相同时按最久未分配再按用户 ID 稳定选择', () => {
  const selected = chooseCustomerServiceAssignee([
    { id: 3, active_task_count: 0, last_assigned_at: '2026-07-22T02:00:00Z' },
    { id: 2, active_task_count: 0, last_assigned_at: '2026-07-22T01:00:00Z' },
    { id: 1, active_task_count: 0, last_assigned_at: '2026-07-22T01:00:00Z' }
  ])
  assert.equal(selected.id, 1)
})

test('没有可用客服时不抛错且申请可继续保留', async () => {
  const warnings = []
  const executor = new MemoryExecutor()
  const result = await ensureCustomerServiceTask('application-1', executor, {
    logger: { warn: message => warnings.push(message) }
  })
  assert.equal(result.reason, 'NO_ASSIGNEE')
  assert.equal(executor.tasks.length, 0)
  assert.equal(warnings.length, 1)
})

test('非负责人和已转移任务原负责人均被拒绝', async () => {
  const executor = new MemoryExecutor({
    users: [{ id: 1 }, { id: 2 }],
    tasks: [{ id: 'task-1', application_id: 'application-1', assignee_user_id: 1, status: 'PROCESSING' }]
  })
  await assert.rejects(requireAssignedCustomerServiceTask('application-1', { id: 2 }, executor), error => error.status === 403)
  executor.tasks[0].status = 'TRANSFERRED'
  await assert.rejects(requireAssignedCustomerServiceTask('application-1', { id: 1 }, executor), error => error.status === 403)
})

test('客服任务按开始、待派遣、派遣完成顺序流转并记录事件', async () => {
  const executor = new MemoryExecutor({
    users: [{ id: 1 }],
    tasks: [{ id: 'task-1', application_id: 'application-1', assignee_user_id: 1, status: 'ASSIGNED', assigned_at: new Date() }]
  })
  await transitionCustomerServiceTask('application-1', 'PROCESSING', 'TASK_PROCESSING_STARTED', { id: 1 }, executor)
  await transitionCustomerServiceTask('application-1', 'WAIT_DISPATCH', 'TASK_WAITING_BRANCH_DISPATCH', { id: 1 }, executor)
  await transitionCustomerServiceTask('application-1', 'COMPLETED', 'TASK_COMPLETED_BY_BRANCH_DISPATCH', { id: 1 }, executor)
  assert.equal(executor.tasks[0].status, 'COMPLETED')
  assert.deepEqual(executor.events.map(item => item.to_status), ['PROCESSING', 'WAIT_DISPATCH', 'COMPLETED'])
})

test('超时读取只写一次事件，负责人可恢复处理', async () => {
  const executor = new MemoryExecutor({
    users: [{ id: 1 }],
    tasks: [{
      id: 'task-1',
      application_id: 'application-1',
      assignee_user_id: 1,
      status: 'ASSIGNED',
      assigned_at: new Date('2026-07-22T00:00:00Z'),
      due_at: new Date('2026-07-22T01:00:00Z')
    }]
  })
  assert.equal(await refreshExpiredCustomerServiceTasks(1, executor), 1)
  assert.equal(await refreshExpiredCustomerServiceTasks(1, executor), 0)
  assert.equal(executor.events.filter(item => item.action_code === 'TASK_TIMEOUT').length, 1)
  await resumeTimedOutCustomerServiceTask('application-1', { id: 1 }, executor)
  assert.equal(executor.tasks[0].status, 'PROCESSING')
})

test('客服任务状态与申请业务状态使用独立映射', () => {
  assert.equal(customerServiceTaskStatusForApplication('PENDING'), 'ASSIGNED')
  assert.equal(customerServiceTaskStatusForApplication('VERIFYING'), 'PROCESSING')
  assert.equal(customerServiceTaskStatusForApplication('CONFIRMED'), 'WAIT_DISPATCH')
  assert.equal(customerServiceTaskStatusForApplication('ASSIGNED'), null)
  assert.equal(canTransitionCustomerServiceTask('ASSIGNED', 'PROCESSING'), true)
  assert.equal(canTransitionCustomerServiceTask('ASSIGNED', 'COMPLETED'), false)
})

test('任务返回结构包含前端兼容字段且不伪造订单状态', () => {
  const view = customerServiceTaskView({
    id: 'task-1',
    application_id: 'application-1',
    assignee_user_id: 1,
    assignee_name: '客服小王',
    status: 'PROCESSING',
    assigned_at: '2026-07-23T01:00:00Z',
    started_at: '2026-07-23T01:10:00Z',
    due_at: '2026-07-24T01:00:00Z',
    updated_at: '2026-07-23T01:10:00Z'
  }, new Date('2026-07-23T01:25:00Z'))
  assert.equal(view.id, 'task-1')
  assert.equal(view.taskId, 'task-1')
  assert.equal(view.status, 'PROCESSING')
  assert.equal(view.elapsedMinutes, 15)
  assert.equal(Object.hasOwn(view, 'orderStatus'), false)
})

test('补偿脚本可重复执行且第二次不重复创建', async () => {
  const executor = new MemoryExecutor({
    users: [{ id: 1 }],
    applications: [{ id: 'application-1', status: 'PENDING' }]
  })
  const first = await backfillCustomerServiceTasks(executor, { warn() {}, error() {} })
  const second = await backfillCustomerServiceTasks(executor, { warn() {}, error() {} })
  assert.equal(first.created, 1)
  assert.equal(second.created, 0)
  assert.equal(second.existing, 1)
  assert.equal(executor.tasks.length, 1)
})

class AssignmentExecutor extends MemoryExecutor {
  constructor() {
    super({
      users: [{ id: 1, display_name: '客服A' }],
      tasks: [{
        id: 'customer-task-1',
        application_id: 'application-1',
        assignee_user_id: 1,
        status: 'WAIT_DISPATCH',
        assigned_at: new Date('2026-07-23T00:00:00Z')
      }]
    })
    this.order = {
      id: 'application-1',
      client_user_id: 10,
      customer_name: '客户',
      phone_snapshot: '13800138000',
      status: 'CONFIRMED',
      service_mode: 'STORE_SERVICE',
      district_area_id: 100,
      branch_id: null
    }
    this.branch = { id: 20, merchant_id: 30, name: '测试网点', area_id: 100 }
  }

  async execute(sql, params = []) {
    const query = sql.replace(/\s+/g, ' ').trim()
    if (query.includes('FROM applications a') && query.includes('FOR UPDATE')) return [[Object.assign({}, this.order)]]
    if (query.includes('FROM branches b') && query.includes('WHERE b.id = ?')) return [[Object.assign({}, this.branch)]]
    if (query.startsWith('SELECT b.id, b.merchant_id, b.name, m.area_id')) return [[Object.assign({}, this.branch)]]
    if (query.startsWith('SELECT neighbor_area_id')) return [[]]
    if (query.startsWith('UPDATE applications')) {
      this.order.status = 'ASSIGNED'
      this.order.branch_id = params[0]
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('SELECT id FROM application_tasks')) {
      return [[this.applicationTasks[0]].filter(Boolean)]
    }
    if (query.startsWith('INSERT INTO application_tasks')) {
      this.applicationTasks.push({ id: params[0], application_id: params[1], branch_id: params[4] })
      return [{ affectedRows: 1 }]
    }
    if (query.startsWith('INSERT INTO application_task_status_history') ||
        query.startsWith('INSERT INTO application_status_history') ||
        query.startsWith('INSERT INTO application_dispatches') ||
        query.startsWith('INSERT INTO order_assignments')) return [{ affectedRows: 1 }]
    return super.execute(sql, params)
  }
}

test('网点派遣与客服任务完成、后续办理任务生成处于同一服务流程', async () => {
  const executor = new AssignmentExecutor()
  const result = await assignApplicationToBranch({
    applicationId: 'application-1',
    branchId: 20,
    operator: { id: 1 },
    executor
  })
  assert.equal(result.status, 'BRANCH_ASSIGNED')
  assert.equal(executor.order.status, 'ASSIGNED')
  assert.equal(executor.tasks[0].status, 'COMPLETED')
  assert.equal(executor.applicationTasks.length, 1)
  assert.equal(executor.events.at(-1).action_code, 'TASK_COMPLETED_BY_BRANCH_DISPATCH')
})
