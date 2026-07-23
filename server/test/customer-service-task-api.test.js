const test = require('node:test')
const assert = require('node:assert/strict')
const { createOrganizationApi } = require('../src/organization-api')

class ApiDatabase {
  constructor() {
    this.tasks = [
      {
        id: 'task-1',
        application_id: 'application-1',
        assignee_user_id: 1,
        assignee_name: '客服一',
        status: 'ASSIGNED',
        assigned_at: '2026-07-23T01:00:00Z',
        due_at: '2026-07-24T01:00:00Z',
        updated_at: '2026-07-23T01:00:00Z',
        client_user_id: 10,
        customer_name: '客户一',
        phone_snapshot: '13800138000',
        project_name: '项目一',
        order_status: 'PENDING'
      },
      {
        id: 'task-2',
        application_id: 'application-2',
        assignee_user_id: 1,
        assignee_name: '客服一',
        status: 'PROCESSING',
        assigned_at: '2026-07-23T01:00:00Z',
        started_at: '2026-07-23T01:10:00Z',
        due_at: '2026-07-24T01:00:00Z',
        updated_at: '2026-07-23T01:10:00Z',
        client_user_id: 11,
        customer_name: '客户二',
        phone_snapshot: '13900139000',
        project_name: '项目二',
        order_status: 'CONTACTING'
      },
      {
        id: 'task-other',
        application_id: 'application-other',
        assignee_user_id: 2,
        assignee_name: '客服二',
        status: 'ASSIGNED',
        assigned_at: '2026-07-23T01:00:00Z',
        due_at: '2026-07-24T01:00:00Z',
        updated_at: '2026-07-23T01:00:00Z',
        client_user_id: 12,
        customer_name: '其他客户',
        phone_snapshot: '13700137000',
        project_name: '其他项目',
        order_status: 'PENDING'
      }
    ]
  }

  async beginTransaction() {}
  async commit() {}
  async rollback() {}
  release() {}
  async getConnection() { return this }

  async query(sql, params) { return this.execute(sql, params) }

  async execute(sql, params = []) {
    const query = sql.replace(/\s+/g, ' ').trim()
    if (query.startsWith('SELECT * FROM customer_service_tasks') && query.includes('due_at < NOW')) return [[]]
    if (query.includes('FROM customer_service_tasks t') && query.includes('JOIN applications a')) {
      const assigneeId = Number(params[0])
      const status = params[1]
      return [this.tasks.filter(task =>
        Number(task.assignee_user_id) === assigneeId && (!status || task.status === status)
      )]
    }
    if (query.startsWith('SELECT SUM(status')) {
      const own = this.tasks.filter(task => Number(task.assignee_user_id) === Number(params[0]))
      return [[{
        assigned: own.filter(task => task.status === 'ASSIGNED').length,
        processing: own.filter(task => task.status === 'PROCESSING').length,
        wait_dispatch: own.filter(task => task.status === 'WAIT_DISPATCH').length,
        timeout: own.filter(task => task.status === 'TIMEOUT').length,
        today_completed: own.filter(task => task.status === 'COMPLETED').length,
        total: own.filter(task => ['ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH', 'TIMEOUT'].includes(task.status)).length
      }]]
    }
    if (query.includes('FROM customer_service_tasks t') && query.includes('WHERE t.id = ?')) {
      const task = this.tasks.find(item => item.id === params[0])
      return [[task].filter(Boolean)]
    }
    throw new Error(`Unhandled API test SQL: ${query}`)
  }
}

function createApi() {
  const db = new ApiDatabase()
  const api = createOrganizationApi({
    db,
    sessionFor: async (req, role) => {
      if (role && role !== 'customer-service') throw Object.assign(new Error('无权访问'), { status: 403 })
      return req.user
    },
    readBody: async () => ({}),
    json: (res, code, body) => Object.assign(res, { code, body })
  })
  return { api, db }
}

async function request(api, path, userId = 1) {
  const req = { method: 'GET', user: { id: userId, roles: ['customer-service'] } }
  const res = {}
  await api.route(req, res, new URL(path, 'http://localhost'))
  return res
}

test('GET /tasks 只返回当前登录客服且忽略外部负责人参数', async () => {
  const { api } = createApi()
  const res = await request(api, '/v1/customer-service/tasks?status=ALL&assignee_user_id=2')
  assert.equal(res.code, 200)
  assert.deepEqual(res.body.tasks.map(item => item.taskId), ['task-1', 'task-2'])
  assert.ok(res.body.tasks.every(item => item.assigneeId === 1))
})

test('GET /tasks 的客服任务状态筛选正确', async () => {
  const { api } = createApi()
  const res = await request(api, '/v1/customer-service/tasks?status=PROCESSING')
  assert.deepEqual(res.body.tasks.map(item => item.taskId), ['task-2'])
  await assert.rejects(
    request(api, '/v1/customer-service/tasks?status=COMPLETED'),
    /Invalid customer-service task status/
  )
})

test('GET /tasks/statistics 只统计当前登录客服', async () => {
  const { api } = createApi()
  const own = await request(api, '/v1/customer-service/tasks/statistics', 1)
  const other = await request(api, '/v1/customer-service/tasks/statistics', 2)
  assert.deepEqual(own.body, {
    assigned: 1,
    processing: 1,
    waitDispatch: 0,
    timeout: 0,
    todayCompleted: 0,
    total: 2
  })
  assert.equal(other.body.total, 1)
})

test('GET /tasks/:id 拒绝非负责人查看任务详情', async () => {
  const { api } = createApi()
  await assert.rejects(
    request(api, '/v1/customer-service/tasks/task-other', 1),
    error => error.status === 403 && error.message === '无权处理该客服任务'
  )
  const own = await request(api, '/v1/customer-service/tasks/task-1', 1)
  assert.equal(own.body.task.assigneeId, 1)
})
