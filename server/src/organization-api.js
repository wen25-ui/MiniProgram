const crypto = require('crypto')
const {
  ASSIGN_TYPES,
  businessError,
  reviewStatus,
  organizationStatus,
  assertManagerBranch,
  assertSalesmanBranch
} = require('./organization-rules')
const {
  TRANSFERABLE_TASK_STATUSES,
  assertSalesmanCanAcceptTask,
  assertSalesmanOwnsTask,
  assertTransferAllowed,
  loadSalesmanScope
} = require('./salesman-access')
const {
  customerServiceTaskView,
  requireAssignedCustomerServiceTask,
  requireCustomerServiceTaskById,
  refreshExpiredCustomerServiceTasks
} = require('./customer-service-task-service')
const { CUSTOMER_SERVICE_TASK_FILTERS } = require('../../domain/task/customer-service-status')
const { assignApplicationToBranch } = require('./customer-service-assignment-service')

function createOrganizationApi({ db, sessionFor, readBody, json }) {
  const fail = (message, status = 400) => { throw businessError(message, status) }
  const requiredText = (value, name, maxLength) => {
    const text = String(value || '').trim()
    if (!text) fail(`${name} is required`)
    if (maxLength && text.length > maxLength) fail(`${name} is too long`)
    return text
  }
  const positiveId = (value, name) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) fail(`${name} is invalid`)
    return id
  }
  const maskedPhone = value => {
    const phone = String(value || '')
    return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
  }
  const orderStatusText = {
    PENDING: '待审核', CONTACTING: '联系客户', VERIFYING: '信息核实中',
    VERIFIED: '信息核实完成', INVALID_INFO: '信息异常', CORRECTING: '信息修正中',
    CONFIRMED: '客户确认办理', DISPATCHING: '派单中', ASSIGNED: '已派遣',
    PROCESSING: '处理中', COMPLETED: '已完成', SERVICE_COMPLETED: '服务完成'
  }

  async function customerService(req) {
    return sessionFor(req, 'customer-service')
  }

  async function salesman(req, executor = db) {
    const user = await sessionFor(req, 'salesman')
    return Object.assign(user, await loadSalesmanScope(executor, user.id))
  }

  async function managedBranches(req, executor = db) {
    const user = await sessionFor(req)
    const merchantId = Number(user.merchant_id || 0)
    const [rows] = await executor.execute(
      `SELECT id, merchant_id, name
         FROM branches
        WHERE status = 'ACTIVE'
          AND (manager_id = ? OR (? > 0 AND merchant_id = ?))`,
      [user.id, merchantId, merchantId]
    )
    if (!rows.length) fail('无网点管理权限', 403)
    return { user, branches: rows }
  }

  async function ensureTask(order, executor) {
    const [[existing]] = await executor.execute('SELECT id FROM application_tasks WHERE application_id = ?', [order.id])
    if (existing) return existing.id
    const id = crypto.randomUUID()
    await executor.execute(
      `INSERT INTO application_tasks
        (id, application_id, service_type, assignee_user_id, store_id, branch_id, assign_type,
         customer_id, customer_name, customer_phone, service_address, status, appointment_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ACCEPT', ?)`,
      [id, order.id, order.service_mode || 'STORE_SERVICE', order.current_salesman_id || null,
        order.assigned_merchant_id || null, order.branch_id || null, order.assign_type || ASSIGN_TYPES.BRANCH_ASSIGN,
        order.client_user_id, order.customer_name || null, order.phone_snapshot, order.service_address || null,
        order.appointment_time || null]
    )
    return id
  }

  async function reviews(req, res, url) {
    await customerService(req)
    const status = String(url.searchParams.get('status') || 'ALL').toUpperCase()
    if (!['ALL', 'WAIT_REVIEW', 'WAIT_RECONTACT'].includes(status)) fail('Invalid review status')
    const where = status === 'WAIT_REVIEW'
      ? "a.status = 'PENDING' AND COALESCE(a.contact_result, '') <> 'UNREACHABLE'"
      : status === 'WAIT_RECONTACT'
        ? "a.contact_result = 'UNREACHABLE' AND a.status NOT IN ('CANCELLED', 'CLOSED', 'COMPLETED', 'SERVICE_COMPLETED')"
        : "(a.status = 'PENDING' OR (a.contact_result = 'UNREACHABLE' AND a.status NOT IN ('CANCELLED', 'CLOSED', 'COMPLETED', 'SERVICE_COMPLETED')))"
    const [rows] = await db.query(
      `SELECT a.id, a.client_user_id, a.phone_snapshot, a.status, a.contact_result,
              a.created_at, a.screening_submitted_at, a.updated_at,
              COALESCE(u.display_name, '') AS customer_name, COALESCE(m.name, '') AS project_name
         FROM applications a
         JOIN users u ON u.id = a.client_user_id
         LEFT JOIN merchants m ON m.id = a.merchant_id
        WHERE ${where}
        ORDER BY COALESCE(a.screening_submitted_at, a.created_at) ASC`
    )
    json(res, 200, { reviews: rows.map(row => {
      const status = reviewStatus(row)
      const submittedAt = row.screening_submitted_at || row.created_at
      return {
        id: row.id, orderId: row.id, customerId: row.client_user_id,
        customerName: row.customer_name, maskedPhone: maskedPhone(row.phone_snapshot),
        projectName: row.project_name, status, submittedAt, updatedAt: row.updated_at,
        customer: { id: row.client_user_id, name: row.customer_name, maskedPhone: maskedPhone(row.phone_snapshot) },
        order: { id: row.id, projectName: row.project_name, status, submittedAt, updatedAt: row.updated_at }
      }
    }) })
  }

  async function customerServiceTasks(req, res, url) {
    const user = await customerService(req)
    const status = String(url.searchParams.get('status') || 'ALL').toUpperCase()
    if (!CUSTOMER_SERVICE_TASK_FILTERS.includes(status)) fail('Invalid customer-service task status')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await refreshExpiredCustomerServiceTasks(user.id, connection)
      const params = [user.id]
      const statusSql = status === 'ALL' ? '' : ' AND t.status = ?'
      if (status !== 'ALL') params.push(status)
      const [rows] = await connection.execute(
        `SELECT t.*, a.client_user_id, a.phone_snapshot, a.status AS order_status,
                COALESCE(c.display_name, '') AS customer_name,
                COALESCE(m.name, '') AS project_name,
                COALESCE(assignee.display_name, assignee.phone, assignee.login_name, '') AS assignee_name
           FROM customer_service_tasks t
           JOIN applications a ON a.id = t.application_id
           JOIN users c ON c.id = a.client_user_id
           JOIN users assignee ON assignee.id = t.assignee_user_id
           LEFT JOIN merchants m ON m.id = a.merchant_id
          WHERE t.assignee_user_id = ?${statusSql}
          ORDER BY (t.status = 'TIMEOUT') DESC,
                   COALESCE(t.due_at, '9999-12-31') ASC,
                   t.assigned_at ASC`,
        params
      )
      await connection.commit()
      json(res, 200, { tasks: rows.map(row => Object.assign(customerServiceTaskView(row), {
        customerId: row.client_user_id,
        customerName: row.customer_name,
        maskedPhone: maskedPhone(row.phone_snapshot),
        projectName: row.project_name || '业务返现办理',
        orderStatus: row.order_status,
        orderStatusText: orderStatusText[row.order_status] || row.order_status
      })) })
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function customerServiceTaskStatistics(req, res) {
    const user = await customerService(req)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await refreshExpiredCustomerServiceTasks(user.id, connection)
      const [[row]] = await connection.execute(
        `SELECT
           SUM(status = 'ASSIGNED') AS assigned,
           SUM(status = 'PROCESSING') AS processing,
           SUM(status = 'WAIT_DISPATCH') AS wait_dispatch,
           SUM(status = 'TIMEOUT') AS timeout,
           SUM(status = 'COMPLETED' AND DATE(completed_at) = CURRENT_DATE()) AS today_completed,
           SUM(status IN ('ASSIGNED', 'PROCESSING', 'WAIT_DISPATCH', 'TIMEOUT')) AS total
         FROM customer_service_tasks
        WHERE assignee_user_id = ?`,
        [user.id]
      )
      await connection.commit()
      json(res, 200, {
        assigned: Number(row.assigned || 0),
        processing: Number(row.processing || 0),
        waitDispatch: Number(row.wait_dispatch || 0),
        timeout: Number(row.timeout || 0),
        todayCompleted: Number(row.today_completed || 0),
        total: Number(row.total || 0)
      })
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function customerServiceTaskDetail(req, res, taskId) {
    const user = await customerService(req)
    const task = await requireCustomerServiceTaskById(taskId, user, db)
    json(res, 200, { task: customerServiceTaskView(task), taskInfo: customerServiceTaskView(task) })
  }

  async function questions(req, res) {
    await customerService(req)
    const [rows] = await db.query(
      "SELECT id, title, type, parent_id, parent_answer, `sort` FROM review_questions WHERE status = 'ACTIVE' ORDER BY `sort`, id"
    )
    json(res, 200, { questions: rows.map(row => ({
      id: row.id, title: row.title, type: row.type, parentId: row.parent_id,
      parentAnswer: row.parent_answer, parent_id: row.parent_id,
      parent_answer: row.parent_answer, sort: row.sort
    })) })
  }

  async function saveAnswer(req, res) {
    const user = await customerService(req)
    const body = await readBody(req)
    const orderId = requiredText(body.orderId, 'orderId', 36)
    const questionId = positiveId(body.questionId, 'questionId')
    const answer = requiredText(body.answer, 'answer')
    await requireAssignedCustomerServiceTask(orderId, user, db)
    const [[row]] = await db.execute(
      `SELECT a.id, q.id AS question_id
         FROM applications a JOIN review_questions q ON q.id = ? AND q.status = 'ACTIVE'
        WHERE a.id = ?`, [questionId, orderId]
    )
    if (!row) fail('Order or review question does not exist', 404)
    const [result] = await db.execute(
      'INSERT INTO review_answers (order_id, question_id, answer, operator_id) VALUES (?, ?, ?, ?)',
      [orderId, questionId, answer, user.id]
    )
    json(res, 201, { success: true, answerId: result.insertId })
  }

  async function assertCustomer(customerId) {
    const [[customer]] = await db.execute(
      `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'client'
        WHERE u.id = ?`, [customerId]
    )
    if (!customer) fail('Customer does not exist', 404)
  }

  async function customerTags(req, res, customerId, tagId) {
    const user = await customerService(req)
    customerId = positiveId(customerId, 'customerId')
    await assertCustomer(customerId)
    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT t.id, t.tag, t.operator_id, t.created_at, COALESCE(u.display_name, u.phone, u.login_name) AS operator_name
           FROM customer_internal_tags t LEFT JOIN users u ON u.id = t.operator_id
          WHERE t.customer_id = ? ORDER BY t.created_at DESC`, [customerId]
      )
      return json(res, 200, { tags: rows.map(row => ({ id: row.id, tag: row.tag, operatorId: row.operator_id, operatorName: row.operator_name, createdAt: row.created_at })) })
    }
    if (req.method === 'POST') {
      const body = await readBody(req)
      const tag = requiredText(body.tag, 'tag', 80)
      try {
        const [result] = await db.execute(
          'INSERT INTO customer_internal_tags (customer_id, tag, operator_id) VALUES (?, ?, ?)',
          [customerId, tag, user.id]
        )
        return json(res, 201, { success: true, tag: { id: result.insertId, tag } })
      } catch (cause) {
        if (cause.code === 'ER_DUP_ENTRY') fail('Tag already exists', 409)
        throw cause
      }
    }
    tagId = positiveId(tagId, 'tagId')
    const [result] = await db.execute('DELETE FROM customer_internal_tags WHERE id = ? AND customer_id = ?', [tagId, customerId])
    if (!result.affectedRows) fail('Tag does not exist', 404)
    json(res, 200, { success: true })
  }

  async function customerNotes(req, res, customerId) {
    const user = await customerService(req)
    customerId = positiveId(customerId, 'customerId')
    await assertCustomer(customerId)
    if (req.method === 'GET') {
      const [rows] = await db.execute(
        `SELECT n.id, n.content, n.operator_id, n.created_at, COALESCE(u.display_name, u.phone, u.login_name) AS operator_name
           FROM customer_internal_notes n LEFT JOIN users u ON u.id = n.operator_id
          WHERE n.customer_id = ? ORDER BY n.created_at DESC`, [customerId]
      )
      return json(res, 200, { notes: rows.map(row => ({ id: row.id, content: row.content, operatorId: row.operator_id, operatorName: row.operator_name, createdAt: row.created_at })) })
    }
    const body = await readBody(req)
    const content = requiredText(body.content || body.note, 'content')
    const [result] = await db.execute(
      'INSERT INTO customer_internal_notes (customer_id, content, operator_id) VALUES (?, ?, ?)',
      [customerId, content, user.id]
    )
    json(res, 201, { success: true, noteId: result.insertId })
  }

  async function assignBranch(req, res, orderId, branchOverride) {
    const user = await customerService(req)
    const body = branchOverride ? {} : await readBody(req)
    const branchId = positiveId(branchOverride || body.branchId, 'branchId')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const result = await assignApplicationToBranch({
        applicationId: orderId,
        branchId,
        operator: user,
        executor: connection
      })
      await connection.commit()
      json(res, 200, Object.assign({ success: true }, result))
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function followUps(req, res, url) {
    await customerService(req)
    const status = String(url.searchParams.get('status') || 'ALL').toUpperCase()
    if (!['ALL', 'PROCESSING', 'FINISHED'].includes(status)) fail('Invalid follow-up status')
    const terminal = "('COMPLETED', 'SERVICE_COMPLETED')"
    const statusSql = status === 'PROCESSING' ? ` AND a.status NOT IN ${terminal}` : status === 'FINISHED' ? ` AND a.status IN ${terminal}` : ''
    const [rows] = await db.query(
      `SELECT a.id, a.client_user_id, a.status, a.branch_id, a.current_salesman_id, a.updated_at,
              COALESCE(c.display_name, '') AS customer_name, b.name AS branch_name,
              COALESCE(s.display_name, '') AS salesman_name, t.status AS task_status
         FROM applications a
         JOIN users c ON c.id = a.client_user_id
         JOIN branches b ON b.id = a.branch_id
         LEFT JOIN users s ON s.id = a.current_salesman_id
         LEFT JOIN application_tasks t ON t.application_id = a.id
        WHERE a.branch_id IS NOT NULL${statusSql}
        ORDER BY a.updated_at DESC`
    )
    json(res, 200, { followUps: rows.map(row => ({
      orderId: row.id, customerId: row.client_user_id, customerName: row.customer_name,
      branchId: row.branch_id, branchName: row.branch_name, salesmanId: row.current_salesman_id,
      salesmanName: row.salesman_name, status: organizationStatus(row), progress: row.task_status || organizationStatus(row), updatedAt: row.updated_at
    })) })
  }

  async function pendingBranchOrders(req, res) {
    const scope = await managedBranches(req)
    const ids = scope.branches.map(row => Number(row.id))
    const [rows] = await db.query(
      `SELECT a.id, a.client_user_id, a.phone_snapshot, a.branch_id, a.status, a.created_at, a.updated_at,
              COALESCE(u.display_name, '') AS customer_name, b.name AS branch_name
         FROM applications a JOIN users u ON u.id = a.client_user_id JOIN branches b ON b.id = a.branch_id
        WHERE a.branch_id IN (${ids.map(() => '?').join(',')}) AND a.current_salesman_id IS NULL
          AND a.status IN ('ASSIGNED', 'PROCESSING')
        ORDER BY a.updated_at ASC`, ids
    )
    json(res, 200, { orders: rows.map(row => ({
      orderId: row.id, customerId: row.client_user_id, customerName: row.customer_name,
      maskedPhone: maskedPhone(row.phone_snapshot), branchId: row.branch_id, branchName: row.branch_name,
      status: 'WAIT_ASSIGN', createdAt: row.created_at, updatedAt: row.updated_at
    })) })
  }

  async function assignSalesman(req, res, orderId) {
    const body = await readBody(req)
    const salesmanId = positiveId(body.salesmanId, 'salesmanId')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const scope = await managedBranches(req, connection)
      const [[order]] = await connection.execute('SELECT * FROM applications WHERE id = ? FOR UPDATE', [orderId])
      if (!order) fail('订单不存在', 404)
      if (!order.branch_id) fail('订单尚未派遣到网点', 409)
      assertManagerBranch(scope.branches.map(row => row.id), order.branch_id)
      if (order.current_salesman_id) fail('订单已有负责业务员', 409)
      const [[target]] = await connection.execute(
        `SELECT u.id AS user_id, u.account_status, ur.branch_id, ur.can_field_service
           FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'salesman'
          WHERE u.id = ? AND u.account_status = 'ACTIVE'`, [salesmanId]
      )
      assertSalesmanBranch(target, order.branch_id)
      if (order.service_mode === 'HOME_SERVICE' && !Number(target.can_field_service)) {
        fail('该业务员未开通外派任务能力', 403)
      }
      await connection.execute(
        'UPDATE applications SET current_salesman_id = ?, assigned_salesman_user_id = ?, assign_type = ? WHERE id = ?',
        [salesmanId, salesmanId, ASSIGN_TYPES.BRANCH_ASSIGN, orderId]
      )
      const taskId = await ensureTask(order, connection)
      const [assignedTask] = await connection.execute(
        `UPDATE application_tasks
            SET assignee_user_id = ?, branch_id = ?, assign_type = ?,
                status = 'WAITING_CONTACT', accepted_at = NOW(3)
          WHERE id = ? AND assignee_user_id IS NULL AND status = 'PENDING_ACCEPT'`,
        [salesmanId, order.branch_id, ASSIGN_TYPES.BRANCH_ASSIGN, taskId]
      )
      if (!assignedTask.affectedRows) fail('任务已由其他业务员领取或当前状态不可分配', 409)
      await connection.execute(
        'INSERT INTO order_assignments (order_id, branch_id, salesman_id, assign_type, operator_id) VALUES (?, ?, ?, ?, ?)',
        [orderId, order.branch_id, salesmanId, ASSIGN_TYPES.BRANCH_ASSIGN, scope.user.id]
      )
      await connection.execute(
        `INSERT INTO application_task_status_history
          (task_id, old_status, new_status, operator_user_id, operator_role, operation, metadata)
         VALUES
          (?, 'PENDING_ACCEPT', 'ACCEPTED', ?, ?, 'BRANCH_TASK_ASSIGNED', ?),
          (?, 'ACCEPTED', 'WAITING_CONTACT', ?, ?, 'WAITING_CUSTOMER_CONTACT', ?)`,
        [
          taskId, scope.user.id, scope.user.roles[0] || null, JSON.stringify({ salesmanId }),
          taskId, scope.user.id, scope.user.roles[0] || null, JSON.stringify({})
        ]
      )
      await connection.commit()
      json(res, 200, { success: true, orderId, salesmanId, status: 'SALESMAN_PROCESSING' })
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function grabOrders(req, res) {
    const user = await salesman(req)
    const [rows] = await db.execute(
      `SELECT t.id AS task_id, a.id, a.client_user_id, a.phone_snapshot, a.status, t.branch_id,
              t.service_type, a.expected_refund_amount, t.created_at, t.updated_at,
              COALESCE(c.display_name, '') AS customer_name, b.name AS branch_name
         FROM application_tasks t
         JOIN applications a ON a.id = t.application_id
         JOIN users c ON c.id = a.client_user_id
         JOIN branches b ON b.id = t.branch_id AND b.status = 'ACTIVE'
        WHERE t.branch_id = ? AND t.assignee_user_id IS NULL AND t.status = 'PENDING_ACCEPT'
          AND (t.service_type = 'STORE_SERVICE' OR (t.service_type = 'HOME_SERVICE' AND ? = 1))
        ORDER BY t.updated_at ASC`,
      [user.branch_id, Number(user.can_field_service)]
    )
    json(res, 200, { branchId: user.branch_id, branchName: user.branch_name, orders: rows.map(row => ({
      taskId: row.task_id, orderId: row.id, customerId: row.client_user_id, customerName: row.customer_name,
      maskedPhone: maskedPhone(row.phone_snapshot), customerPhone: '', serviceAddress: '',
      serviceType: row.service_type, businessType: row.service_type,
      distance: null, expectedIncome: row.expected_refund_amount, publishedAt: row.created_at,
      status: 'WAIT_ASSIGN'
    })) })
  }

  async function grabOrder(req, res, orderId) {
    const connection = await db.getConnection()
    let actor = null
    try {
      await connection.beginTransaction()
      const user = await salesman(req, connection)
      actor = user
      const [[order]] = await connection.execute('SELECT * FROM applications WHERE id = ? FOR UPDATE', [orderId])
      if (!order) fail('任务不存在', 404)
      const taskId = await ensureTask(order, connection)
      const [[task]] = await connection.execute(
        `SELECT t.*, a.current_salesman_id, a.branch_id AS order_branch_id
           FROM application_tasks t JOIN applications a ON a.id = t.application_id
          WHERE t.id = ? FOR UPDATE`,
        [taskId]
      )
      assertSalesmanCanAcceptTask(task, user)
      const [claimed] = await connection.execute(
        `UPDATE application_tasks
            SET assignee_user_id = ?, assign_type = ?,
                status = 'WAITING_CONTACT', accepted_at = NOW(3)
          WHERE id = ? AND assignee_user_id IS NULL AND status = 'PENDING_ACCEPT'`,
        [user.id, ASSIGN_TYPES.SALESMAN_GRAB, taskId]
      )
      if (!claimed.affectedRows) fail('该任务已被其他业务员领取', 409)
      const [orderClaimed] = await connection.execute(
        `UPDATE applications
            SET current_salesman_id = ?, assigned_salesman_user_id = ?, assign_type = ?
          WHERE id = ? AND current_salesman_id IS NULL`,
        [user.id, user.id, ASSIGN_TYPES.SALESMAN_GRAB, orderId]
      )
      if (!orderClaimed.affectedRows) fail('该任务已被其他业务员领取', 409)
      await connection.execute(
        'INSERT INTO order_grab_records (order_id, salesman_id, result) VALUES (?, ?, ?)',
        [orderId, user.id, 'SUCCESS']
      )
      await connection.execute(
        'INSERT INTO order_assignments (order_id, branch_id, salesman_id, assign_type, operator_id) VALUES (?, ?, ?, ?, ?)',
        [orderId, order.branch_id, user.id, ASSIGN_TYPES.SALESMAN_GRAB, user.id]
      )
      await connection.execute(
        `INSERT INTO application_task_status_history
          (task_id, old_status, new_status, operator_user_id, operator_role, operation, metadata)
         VALUES
          (?, 'PENDING_ACCEPT', 'ACCEPTED', ?, 'salesman', 'TASK_ACCEPTED', ?),
          (?, 'ACCEPTED', 'WAITING_CONTACT', ?, 'salesman', 'WAITING_CUSTOMER_CONTACT', ?)`,
        [
          taskId, user.id, JSON.stringify({ assignType: ASSIGN_TYPES.SALESMAN_GRAB }),
          taskId, user.id, JSON.stringify({})
        ]
      )
      await connection.commit()
      json(res, 200, { success: true, taskId, orderId, status: 'WAITING_CONTACT' })
    } catch (cause) {
      await connection.rollback()
      if (cause.status === 409 && actor) {
        await db.execute(
          'INSERT INTO order_grab_records (order_id, salesman_id, result) VALUES (?, ?, ?)',
          [orderId, actor.id, 'FAILED']
        ).catch(() => {})
      }
      throw cause
    } finally {
      connection.release()
    }
  }

  async function createTransfer(req, res, orderId, bodyOverride) {
    const body = bodyOverride || await readBody(req)
    const toSalesmanId = positiveId(body.toSalesmanId || body.receiverUserId, 'toSalesmanId')
    const reason = requiredText(body.reason, 'reason', 500)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const user = await salesman(req, connection)
      const [[order]] = await connection.execute('SELECT * FROM applications WHERE id = ? FOR UPDATE', [orderId])
      if (!order) fail('任务不存在', 404)
      const [[task]] = await connection.execute(
        'SELECT * FROM application_tasks WHERE application_id = ? FOR UPDATE',
        [orderId]
      )
      const [[target]] = await connection.execute(
        `SELECT u.id AS user_id, u.account_status, ur.branch_id, ur.can_field_service
           FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'salesman'
          WHERE u.id = ?`,
        [toSalesmanId]
      )
      assertTransferAllowed(Object.assign({}, task, {
        current_salesman_id: order.current_salesman_id,
        order_branch_id: order.branch_id
      }), user, target)
      const [[pending]] = await connection.execute(
        "SELECT id FROM order_transfer_logs WHERE order_id = ? AND status = 'PENDING' FOR UPDATE", [orderId]
      )
      if (pending) fail('订单已有待处理的转接申请', 409)
      const [result] = await connection.execute(
        'INSERT INTO order_transfer_logs (order_id, from_salesman_id, to_salesman_id, reason, status) VALUES (?, ?, ?, ?, \'PENDING\')',
        [orderId, user.id, toSalesmanId, reason]
      )
      await connection.commit()
      json(res, 201, { success: true, transferId: result.insertId, status: 'TRANSFER_PENDING' })
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function decideTransfer(req, res, transferId, decision) {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const user = await salesman(req, connection)
      const [[transfer]] = await connection.execute('SELECT * FROM order_transfer_logs WHERE id = ? FOR UPDATE', [transferId])
      if (!transfer) fail('转接申请不存在', 404)
      if (Number(transfer.to_salesman_id) !== Number(user.id)) fail('只有接收业务员可以处理该转接', 403)
      if (transfer.status !== 'PENDING') fail('转接申请已处理', 409)
      const nextStatus = decision === 'accept' ? 'ACCEPTED' : 'REJECTED'
      if (decision === 'accept') {
        const [[order]] = await connection.execute('SELECT * FROM applications WHERE id = ? FOR UPDATE', [transfer.order_id])
        if (!order || Number(order.current_salesman_id) !== Number(transfer.from_salesman_id)) fail('任务负责人已发生变化', 409)
        if (Number(order.branch_id) !== Number(user.branch_id)) fail('任务只能在同一网点内转接', 403)
        const [[task]] = await connection.execute(
          'SELECT * FROM application_tasks WHERE application_id = ? FOR UPDATE',
          [order.id]
        )
        assertTransferAllowed(Object.assign({}, task, {
          current_salesman_id: order.current_salesman_id,
          order_branch_id: order.branch_id
        }), Object.assign({}, user, { id: transfer.from_salesman_id }), user)
        await connection.execute(
          'UPDATE applications SET current_salesman_id = ?, assigned_salesman_user_id = ?, assign_type = ? WHERE id = ?',
          [user.id, user.id, ASSIGN_TYPES.TRANSFER, order.id]
        )
        await connection.execute(
          'UPDATE application_tasks SET assignee_user_id = ?, assign_type = ? WHERE application_id = ?',
          [user.id, ASSIGN_TYPES.TRANSFER, order.id]
        )
        await connection.execute(
          'INSERT INTO order_assignments (order_id, branch_id, salesman_id, assign_type, operator_id) VALUES (?, ?, ?, ?, ?)',
          [order.id, order.branch_id, user.id, ASSIGN_TYPES.TRANSFER, user.id]
        )
        await connection.execute(
          `INSERT INTO application_task_status_history
            (task_id, old_status, new_status, operator_user_id, operator_role, operation, metadata)
           VALUES (?, ?, ?, ?, 'salesman', 'TASK_TRANSFER_ACCEPTED', ?)`,
          [task.id, task.status, task.status, user.id, JSON.stringify({
            fromSalesmanId: transfer.from_salesman_id,
            toSalesmanId: user.id
          })]
        )
      }
      await connection.execute('UPDATE order_transfer_logs SET status = ? WHERE id = ?', [nextStatus, transferId])
      await connection.commit()
      json(res, 200, { success: true, transferId: Number(transferId), status: nextStatus })
    } catch (cause) {
      await connection.rollback()
      throw cause
    } finally {
      connection.release()
    }
  }

  async function pendingTransfers(req, res) {
    const user = await salesman(req)
    const [rows] = await db.execute(
      `SELECT l.id, l.order_id, l.from_salesman_id, l.to_salesman_id, l.reason, l.status, l.created_at,
              COALESCE(sender.display_name, sender.phone, '') AS from_salesman_name,
              COALESCE(c.display_name, '') AS customer_name
         FROM order_transfer_logs l
         JOIN applications a ON a.id = l.order_id AND a.branch_id = ?
         JOIN users sender ON sender.id = l.from_salesman_id
         JOIN users c ON c.id = a.client_user_id
        WHERE l.to_salesman_id = ? AND l.status = 'PENDING'
        ORDER BY l.created_at ASC`,
      [user.branch_id, user.id]
    )
    json(res, 200, { transfers: rows.map(row => ({
      id: row.id, orderId: row.order_id, fromSalesmanId: row.from_salesman_id,
      toSalesmanId: row.to_salesman_id, fromSalesmanName: row.from_salesman_name,
      customerName: row.customer_name, reason: row.reason, status: row.status, createdAt: row.created_at
    })) })
  }

  async function salesmanBranch(req, res) {
    const user = await salesman(req)
    const [[branch]] = await db.execute(
      `SELECT b.id, b.name, b.address, b.contact_name, b.contact_phone, b.manager_id,
              COALESCE(u.display_name, u.phone, u.login_name, '') AS manager_name
         FROM branches b LEFT JOIN users u ON u.id = b.manager_id WHERE b.id = ?`, [user.branch_id]
    )
    const [members] = await db.execute(
      `SELECT u.id, COALESCE(u.display_name, u.phone, u.login_name, '') AS name,
              ur.can_field_service,
              COUNT(a.id) AS current_task_count
         FROM user_roles ur JOIN users u ON u.id = ur.user_id AND u.account_status = 'ACTIVE'
         LEFT JOIN applications a ON a.current_salesman_id = u.id AND a.status NOT IN ('COMPLETED', 'SERVICE_COMPLETED', 'CLOSED', 'CANCELLED')
        WHERE ur.role_code = 'salesman' AND ur.branch_id = ?
        GROUP BY u.id, ur.can_field_service ORDER BY name`, [user.branch_id]
    )
    const teamMembers = members.map(row => ({
      id: row.id, userId: row.id, name: row.name,
      canFieldService: Boolean(row.can_field_service),
      currentTaskCount: Number(row.current_task_count), taskCount: Number(row.current_task_count)
    }))
    json(res, 200, { branch: {
      id: branch.id, name: branch.name, address: branch.address || '', contactName: branch.contact_name || '',
      contactPhone: branch.contact_phone || '', managerId: branch.manager_id, managerName: branch.manager_name,
      canFieldService: Boolean(user.can_field_service),
      members: teamMembers, teamMembers, salesmen: teamMembers
    } })
  }

  async function salesmanSchedule(req, res) {
    const user = await salesman(req)
    const [rows] = await db.execute(
      `SELECT t.id, t.application_id, t.service_type, t.status, t.appointment_time,
              t.customer_name, t.customer_phone, t.service_address, t.branch_id,
              b.name AS branch_name
         FROM application_tasks t
         JOIN branches b ON b.id = t.branch_id AND b.status = 'ACTIVE'
        WHERE t.assignee_user_id = ? AND t.branch_id = ? AND t.appointment_time IS NOT NULL
          AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'ABNORMAL_CLOSED')
          AND (t.service_type = 'STORE_SERVICE' OR ? = 1)
        ORDER BY t.appointment_time`,
      [user.id, user.branch_id, Number(user.can_field_service)]
    )
    json(res, 200, { schedules: rows.map(row => ({
      id: row.id,
      applicationId: row.application_id,
      serviceType: row.service_type,
      status: row.status,
      appointmentTime: row.appointment_time,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      serviceAddress: row.service_address,
      branchId: row.branch_id,
      branchName: row.branch_name
    })) })
  }

  async function legacyProfile(req, res, orderId) {
    await customerService(req)
    const [[order]] = await db.execute('SELECT client_user_id FROM applications WHERE id = ?', [orderId])
    if (!order) fail('订单不存在', 404)
    if (req.method === 'GET') {
      const [tags] = await db.execute('SELECT id, tag, created_at FROM customer_internal_tags WHERE customer_id = ? ORDER BY created_at DESC', [order.client_user_id])
      const [[note]] = await db.execute('SELECT id, content, created_at FROM customer_internal_notes WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1', [order.client_user_id])
      return json(res, 200, { tags, note: note ? note.content : '' })
    }
    const body = await readBody(req)
    const user = await customerService(req)
    if (Array.isArray(body.tags)) {
      for (const tagValue of body.tags) {
        const tag = requiredText(typeof tagValue === 'string' ? tagValue : tagValue.tag, 'tag', 80)
        await db.execute('INSERT IGNORE INTO customer_internal_tags (customer_id, tag, operator_id) VALUES (?, ?, ?)', [order.client_user_id, tag, user.id])
      }
    }
    if (String(body.note || '').trim()) {
      await db.execute('INSERT INTO customer_internal_notes (customer_id, content, operator_id) VALUES (?, ?, ?)', [order.client_user_id, String(body.note).trim(), user.id])
    }
    json(res, 200, { success: true })
  }

  async function legacyOutletAssignment(req, res, orderId) {
    await customerService(req)
    const body = await readBody(req)
    const outletId = positiveId(body.outletId || body.branchId, 'outletId')
    const [[branch]] = await db.execute(
      `SELECT id FROM branches WHERE status = 'ACTIVE' AND (id = ? OR merchant_id = ?)
        ORDER BY (id = ?) DESC, id LIMIT 1`, [outletId, outletId, outletId]
    )
    if (!branch) fail('网点不存在', 404)
    return assignBranch(req, res, orderId, branch.id)
  }

  async function legacyGrab(req, res) {
    const body = await readBody(req)
    return grabOrder(req, res, requiredText(body.orderId, 'orderId', 36))
  }

  async function legacyTransfer(req, res) {
    const body = await readBody(req)
    let orderId = body.orderId
    if (!orderId && body.taskId) {
      const [[task]] = await db.execute('SELECT application_id FROM application_tasks WHERE id = ?', [body.taskId])
      if (!task) fail('任务不存在', 404)
      orderId = task.application_id
    }
    return createTransfer(req, res, requiredText(orderId, 'orderId', 36), body)
  }

  async function route(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/v1/customer-service/tasks/statistics') return customerServiceTaskStatistics(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/customer-service/tasks') return customerServiceTasks(req, res, url)
    let match = url.pathname.match(/^\/v1\/customer-service\/tasks\/([\w-]+)$/)
    if (match && req.method === 'GET') return customerServiceTaskDetail(req, res, match[1])
    if (req.method === 'GET' && url.pathname === '/v1/customer-service/reviews') return reviews(req, res, url)
    if (req.method === 'GET' && url.pathname === '/v1/customer-service/review/questions') return questions(req, res)
    if (req.method === 'POST' && url.pathname === '/v1/customer-service/review/answers') return saveAnswer(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/customer-service/follow-ups') return followUps(req, res, url)

    match = url.pathname.match(/^\/v1\/customer-service\/customers\/(\d+)\/tags(?:\/(\d+))?$/)
    if (match && ((req.method === 'GET' && !match[2]) || (req.method === 'POST' && !match[2]) || (req.method === 'DELETE' && match[2]))) return customerTags(req, res, match[1], match[2])
    match = url.pathname.match(/^\/v1\/customer-service\/customers\/(\d+)\/notes$/)
    if (match && ['GET', 'POST'].includes(req.method)) return customerNotes(req, res, match[1])
    match = url.pathname.match(/^\/v1\/customer-service\/orders\/([\w-]+)\/assign-branch$/)
    if (match && req.method === 'POST') return assignBranch(req, res, match[1])

    if (req.method === 'GET' && url.pathname === '/v1/branch/orders/pending') return pendingBranchOrders(req, res)
    match = url.pathname.match(/^\/v1\/branch\/orders\/([\w-]+)\/assign-salesman$/)
    if (match && req.method === 'POST') return assignSalesman(req, res, match[1])

    if (req.method === 'GET' && url.pathname === '/v1/salesman/grab-orders') return grabOrders(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/salesman/branch') return salesmanBranch(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/salesman/schedule') return salesmanSchedule(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/salesman/transfers') return pendingTransfers(req, res)
    match = url.pathname.match(/^\/v1\/salesman\/orders\/([\w-]+)\/grab$/)
    if (match && req.method === 'POST') return grabOrder(req, res, match[1])
    match = url.pathname.match(/^\/v1\/salesman\/orders\/([\w-]+)\/transfer$/)
    if (match && req.method === 'POST') return createTransfer(req, res, match[1])
    match = url.pathname.match(/^\/v1\/salesman\/transfers\/(\d+)\/(accept|reject)$/)
    if (match && req.method === 'POST') return decideTransfer(req, res, match[1], match[2])

    match = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)\/customer-service-profile$/)
    if (match && ['GET', 'POST'].includes(req.method)) return legacyProfile(req, res, match[1])
    match = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)\/outlet-assignment$/)
    if (match && req.method === 'POST') return legacyOutletAssignment(req, res, match[1])
    if (req.method === 'POST' && url.pathname === '/v1/salesman/grab-order') return legacyGrab(req, res)
    if (req.method === 'POST' && url.pathname === '/v1/salesman/task-transfer') return legacyTransfer(req, res)
    return false
  }

  return { route }
}

module.exports = { createOrganizationApi }
