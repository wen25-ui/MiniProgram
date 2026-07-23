const crypto = require('crypto')
const http = require('http')
const { URL } = require('url')
const createQrCode = require('qrcode-generator')
const db = require('./db')
const phoneDb = require('./phone-db')
const config = require('./config')
const { TASK_STATUS_TEXT, canTransitionTask } = require('../../domain/task/status')

const roles = new Set(['client', 'merchant', 'salesman', 'customer-service', 'finance', 'boss', 'admin'])
const managedRoles = new Set(['merchant', 'salesman', 'customer-service'])
const salesmanTypes = new Set(['HOME_VISIT', 'BRANCH'])
const expenseTiers = new Set(['UNDER_79', 'FROM_79', 'FROM_150', 'FROM_250', 'FROM_400'])
const withdrawableStatuses = new Set(['PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'DISPATCHING', 'PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_STORE_SERVICE'])
const blockingStatuses = new Set(['PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED', 'PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE'])
const statusText = {
  PENDING: '待审核', CONTACTING: '联系客户', VERIFYING: '信息核实中', VERIFIED: '信息核实完成',
  INVALID_INFO: '信息异常', CORRECTING: '信息修正中', CONFIRMED: '客户确认办理', CANCELLED: '客户取消',
  DISPATCHING: '派单中', ASSIGNED: '已派单', PROCESSING: '处理中', COMPLETED: '已完成',
  PRE_SCREEN_REJECTED: '预审待补充', PENDING_REVIEW: '待客服复审', REVIEW_REJECTED: '审核未通过',
  PENDING_CONTACT: '待联系确认', PENDING_APPOINTMENT: '待确认上门时间', PENDING_DISPATCH: '预约已确认',
  CONTACT_FAILED: '暂未联系成功', CLIENT_DECLINED: '客户已放弃', PENDING_SERVICE_MODE: '待确认办理方式',
  PENDING_SERVICE: '待上门办理', IN_SERVICE: '办理中', PENDING_VERIFICATION: '待核销',
  PENDING_STORE_SERVICE: '待营业厅办理', IN_STORE_SERVICE: '营业厅办理中', SERVICE_FAILED: '办理失败',
  VERIFICATION_RETURNED: '核销资料待补充', SERVICE_COMPLETED: '服务完成', WITHDRAWN: '已撤回', CLOSED: '已结束'
}
const statusDescription = {
  PENDING: '申请已提交，等待客服审核。', CONTACTING: '客服正在联系客户。', VERIFYING: '客服正在核实客户信息。',
  VERIFIED: '客户信息已核实，等待确认办理意愿和方式。', INVALID_INFO: '客户提交的信息存在异常。',
  CORRECTING: '客服正在更正客户信息。', CONFIRMED: '客户已确认办理方式，等待派单。', CANCELLED: '客户已确认不再办理。',
  DISPATCHING: '正在分配办理网点或工作人员。', ASSIGNED: '任务已分配，等待工作人员处理。',
  PROCESSING: '工作人员正在处理业务。', COMPLETED: '业务办理已完成。',
  PRE_SCREEN_REJECTED: '申请资料暂未满足资格要求。', PENDING_REVIEW: '申请已提交，正在等待客服复审。',
  REVIEW_REJECTED: '人工复审未通过，可查看详情后撤回申请。', PENDING_CONTACT: '客服将联系您确认办理信息。',
  CONTACT_FAILED: '本次暂未联系成功，客服稍后可再次联系。', CLIENT_DECLINED: '您已放弃本次办理，可重新提交申请。', PENDING_SERVICE_MODE: '请与客服确认上门或营业厅办理。',
  PENDING_APPOINTMENT: '正在确认上门办理时间。', PENDING_DISPATCH: '预约已确认，正在安排业务员。',
  PENDING_SERVICE: '业务员已接到任务，请等待上门。', IN_SERVICE: '业务员正在办理业务。',
  PENDING_STORE_SERVICE: '请按约定前往营业厅办理。', IN_STORE_SERVICE: '营业厅正在办理业务。', SERVICE_FAILED: '本次业务办理失败，可查看失败原因。',
  PENDING_VERIFICATION: '办理资料正在等待客服核销。', VERIFICATION_RETURNED: '办理资料已退回业务员补充。',
  SERVICE_COMPLETED: '业务办理已完成。', WITHDRAWN: '申请已撤回，该申请已关闭。请重新扫描商家二维码后提交新申请。', CLOSED: '该申请已结束。'
}
const expenseTierText = { UNDER_79: '低于 79 元', FROM_79: '79 元以上', FROM_150: '150 元以上', FROM_250: '250 元以上', FROM_400: '400 元以上' }

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
function error(res, code, message) { json(res, code, { error: message }) }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '').replace(/\s/g, '')) }
function normalizeRegion(value) { return String(value || '').replace(/[省市自治区特别行政区\s]/g, '') }
async function findPhoneAttribution(phone) {
  const normalized = String(phone || '').replace(/\s/g, '')
  if (!validPhone(normalized)) throw Object.assign(new Error('请输入正确的手机号'), { status: 400 })
  const [[row]] = await phoneDb.execute(
    'SELECT phone, province, city, isp, isp_type, post_code, city_code, area_code FROM phone_location WHERE phone = ? LIMIT 1',
    [normalized.slice(0, 7)]
  )
  if (!row) return { phone: normalized, prefix: normalized.slice(0, 7), queryStatus: 'NOT_FOUND', isLocal: null, province: '', city: '', isp: '', message: '暂未查到该号段，请手动确认是否为本地号码。' }
  const isLocal = String(row.area_code || '') === String(config.localAreaCode)
  return {
    phone: normalized, prefix: row.phone, queryStatus: 'QUERY_SUCCESS', isLocal,
    eligibleProvince: config.localProvince, eligibleCity: config.localCity,
    province: row.province, city: row.city, isp: row.isp, ispType: row.isp_type,
    postCode: row.post_code, cityCode: row.city_code, areaCode: row.area_code,
    message: isLocal ? `号码归属地为${row.province}${row.city}，属于本地号码。` : `号码归属地为${row.province}${row.city}，非${config.localProvince}${config.localCity}本地号码。`
  }
}
function passwordHash(password) { return crypto.createHash('sha256').update(String(password)).digest('hex') }
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch (_) { throw new Error('请求体必须是 JSON') }
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex') }

async function createSession(userId, executor = db) {
  const token = crypto.randomBytes(32).toString('base64url')
  const id = crypto.randomUUID()
  await executor.query(
    'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? DAY))',
    [id, userId, tokenHash(token), config.sessionTtlDays]
  )
  return token
}
async function sessionFor(req, expectedRole) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw Object.assign(new Error('请先登录'), { status: 401 })
  // SQLPub may route ordinary SELECT statements to a lagging replica. A locking
  // read is forced to the primary so a session is usable immediately after login.
  const [[activeSession]] = await db.query(
    'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > NOW(3) FOR UPDATE',
    [tokenHash(token)]
  )
  if (!activeSession) throw Object.assign(new Error('登录已过期'), { status: 401 })
  const [rows] = await db.query(
    `SELECT u.id, u.phone, u.login_name, u.display_name, GROUP_CONCAT(ur.role_code) AS roles,
            MAX(ur.salesman_code) AS salesman_code, MAX(ur.salesman_type) AS salesman_type,
            MAX(ur.merchant_id) AS merchant_id, MAX(ur.assigned_merchant_id) AS assigned_merchant_id
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = ? AND u.account_status = 'ACTIVE'
      GROUP BY u.id`, [activeSession.user_id]
  )
  if (!rows.length) throw Object.assign(new Error('登录已过期'), { status: 401 })
  const user = rows[0]
  user.roles = user.roles ? user.roles.split(',') : []
  if (expectedRole && !user.roles.includes(expectedRole)) throw Object.assign(new Error('无权访问该资源'), { status: 403 })
  await db.query('UPDATE auth_sessions SET last_used_at = NOW(3) WHERE token_hash = ?', [tokenHash(token)])
  return user
}
async function authenticate(account, password) {
  const normalized = String(account || '').replace(/\s/g, '')
  if (!normalized || !password) throw Object.assign(new Error('请输入账号和密码'), { status: 400 })
  const [[user]] = await db.query('SELECT id, phone, login_name, password_hash FROM users WHERE (phone = ? OR login_name = ?) AND account_status = \'ACTIVE\'', [normalized, normalized])
  if (!user || !user.password_hash || user.password_hash !== passwordHash(password)) {
    throw Object.assign(new Error('账号或密码错误'), { status: 401 })
  }
  const [roleRows] = await db.query('SELECT role_code, salesman_code, salesman_type FROM user_roles WHERE user_id = ?', [user.id])
  if (!roleRows.length) throw Object.assign(new Error('该账号尚未分配身份'), { status: 403 })
  const token = await createSession(user.id)
  const salesmanRole = roleRows.find(row => row.role_code === 'salesman') || {}
  return { token, user: { id: user.id, phone: user.phone || user.login_name, roles: roleRows.map(row => row.role_code), defaultRole: roleRows[0].role_code, salesmanId: salesmanRole.salesman_code || '', salesmanType: salesmanRole.salesman_type || '' } }
}
async function registerClient(body) {
  const phone = String(body.phone || '').replace(/\s/g, '')
  const password = String(body.password || '')
  if (!validPhone(phone)) throw Object.assign(new Error('请输入正确的手机号'), { status: 400 })
  if (password.length < 6) throw Object.assign(new Error('账号密码不能少于 6 位'), { status: 400 })

  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
    if (existingUsers.length) throw Object.assign(new Error('该手机号已注册，请直接登录'), { status: 409 })

    const [result] = await connection.execute(
      'INSERT INTO users (phone, password_hash, account_status) VALUES (?, ?, \'ACTIVE\')',
      [phone, passwordHash(password)]
    )
    const userId = result.insertId
    await connection.execute('INSERT INTO user_roles (user_id, role_code) VALUES (?, \'client\')', [userId])
    const token = await createSession(userId, connection)
    await connection.commit()
    return { token, user: { id: userId, phone, roles: ['client'], defaultRole: 'client', salesmanId: '' } }
  } catch (cause) {
    await connection.rollback()
    throw cause
  } finally {
    connection.release()
  }
}
function applicationView(row) {
  return {
    id: row.id, status: row.status, statusText: statusText[row.status] || '处理中',
    statusDescription: statusDescription[row.status] || '申请正在处理中。',
    canWithdraw: withdrawableStatuses.has(row.status),
    appointmentTime: row.appointment_time, serviceMode: row.service_mode,
    serviceType: row.service_mode === 'STORE_SERVICE' ? 1 : row.service_mode === 'HOME_SERVICE' ? 2 : null,
    verifyResult: row.verify_result, customerIntention: row.customer_intention,
    verificationRemark: row.verification_remark, correctedInfo: row.corrected_info,
    contactResult: row.contact_result, contactReason: row.contact_reason,
    serviceFailureReason: row.service_failure_reason, refundStatus: row.refund_status,
    refundText: { NOT_RECORDED: '未登记', PENDING_CONFIRMATION: '待入账确认', REFUND_POSTED: '返现完成入账' }[row.refund_status] || '已登记',
    updatedAt: row.updated_at
  }
}
function parseCommitments(value) {
  if (Array.isArray(value)) return value
  try { return JSON.parse(value || '[]') } catch (_) { return [] }
}
function clientApplicationDetail(row) {
  return Object.assign(applicationView(row), {
    phone: row.phone_snapshot,
    localNumber: row.is_local_number === null ? null : Boolean(row.is_local_number),
    acceptLocalCard: row.accept_local_card === null ? null : Boolean(row.accept_local_card),
    expenseTier: row.expense_tier,
    serviceMode: row.service_mode,
    serviceAddress: row.service_address || '',
    serviceRegion: row.service_region || '',
    verifyResult: row.verify_result,
    customerIntention: row.customer_intention,
    verificationRemark: row.verification_remark || '',
    correctedInfo: row.corrected_info,
    contactResult: row.contact_result,
    contactReason: row.contact_reason || '',
    expenseTierText: expenseTierText[row.expense_tier] || '未填写',
    commitments: parseCommitments(row.commitments),
    ruleVersion: row.rule_version,
    submittedAt: row.screening_submitted_at,
    merchant: row.merchant_id ? {
      id: row.merchant_id,
      name: row.merchant_name || '',
      contactName: row.merchant_contact_name || '',
      contactPhone: row.merchant_contact_phone || ''
    } : null
  })
}
function staffApplicationView(row) {
  return Object.assign(applicationView(row), {
    maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    localOption: row.local_option,
    localNumber: row.is_local_number === null ? null : Boolean(row.is_local_number),
    acceptLocalCard: row.accept_local_card === null ? null : Boolean(row.accept_local_card),
    expenseTier: row.expense_tier,
    serviceAddress: row.detail_address || row.service_address || '',
    serviceRegion: row.district || row.service_region || '',
    province: row.province || '', city: row.city || '', district: row.district || '',
    detailAddress: row.detail_address || row.service_address || '', districtAreaId: row.district_area_id || null,
    latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
    fulfillment: row.voucher_remark ? { voucherRemark: row.voucher_remark } : null,
    verification: row.verification_reason ? { reason: row.verification_reason } : null
  })
}
async function changeStatus(id, from, to, action, operator, reason, extra = {}, executor = db) {
  const [result] = await executor.execute('UPDATE applications SET status = ?, updated_at = NOW(3) WHERE id = ? AND status = ?', [to, id, from])
  if (!result.affectedRows) throw Object.assign(new Error('申请当前状态不允许该操作'), { status: 409 })
  await executor.execute(
    'INSERT INTO application_status_history (application_id, from_status, to_status, action_code, reason, operator_user_id, operator_role, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, from, to, action, reason || null, operator.id, operator.roles[0] || null, JSON.stringify(extra)]
  )
}
async function recordStatusEvent(id, status, action, operator, reason, extra = {}, executor = db) {
  await executor.execute('UPDATE applications SET updated_at = NOW(3) WHERE id = ? AND status = ?', [id, status])
  await executor.execute(
    'INSERT INTO application_status_history (application_id, from_status, to_status, action_code, reason, operator_user_id, operator_role, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, status, status, action, reason || null, operator.id, operator.roles[0] || null, JSON.stringify(extra)]
  )
}
async function changeTaskStatus(taskId, from, to, operation, operator, remark, metadata = {}, executor = db, fields = '') {
  if (!canTransitionTask(from, to)) throw Object.assign(new Error(`不允许任务从 ${from} 跳转到 ${to}`), { status: 409 })
  const assignments = fields ? `, ${fields}` : ''
  const [result] = await executor.execute(
    `UPDATE application_tasks SET status = ?, version = version + 1${assignments} WHERE id = ? AND status = ?`,
    [to, taskId, from]
  )
  if (!result.affectedRows) throw Object.assign(new Error('任务当前状态不允许该操作，请刷新后重试'), { status: 409 })
  await executor.execute(
    'INSERT INTO application_task_status_history (task_id, old_status, new_status, operator_user_id, operator_role, operation, remark, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [taskId, from, to, operator.id, operator.roles[0] || null, operation, remark || null, JSON.stringify(metadata)]
  )
}
async function createApplicationTask(applicationId, operator, executor = db) {
  const [[application]] = await executor.execute(
    `SELECT a.id, a.client_user_id, a.phone_snapshot, a.service_mode, a.assigned_salesman_user_id,
            a.assigned_merchant_id, a.appointment_time, a.service_address, u.display_name
       FROM applications a JOIN users u ON u.id = a.client_user_id WHERE a.id = ?`, [applicationId]
  )
  if (!application || !['HOME_SERVICE', 'STORE_SERVICE'].includes(application.service_mode)) {
    throw Object.assign(new Error('派单申请缺少有效办理方式'), { status: 409 })
  }
  const taskId = crypto.randomUUID()
  await executor.execute(
    `INSERT INTO application_tasks
      (id, application_id, service_type, assignee_user_id, store_id, customer_id, customer_name, customer_phone, service_address, status, appointment_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_ACCEPT', ?)`,
    [taskId, application.id, application.service_mode, application.assigned_salesman_user_id, application.assigned_merchant_id,
      application.client_user_id, application.display_name || null, application.phone_snapshot, application.service_address, application.appointment_time]
  )
  await executor.execute(
    'INSERT INTO application_task_status_history (task_id, old_status, new_status, operator_user_id, operator_role, operation, metadata) VALUES (?, NULL, ?, ?, ?, ?, ?)',
    [taskId, 'PENDING_ACCEPT', operator.id, operator.roles[0] || null, 'TASK_CREATED_BY_DISPATCH', JSON.stringify({ applicationId })]
  )
  return taskId
}
async function customerApplications(req, res) {
  await sessionFor(req, 'customer-service')
  const [rows] = await db.query(
    `SELECT a.id, a.phone_snapshot, a.status, a.contact_result, a.contact_reason, a.screening_submitted_at, a.updated_at,
            m.name AS merchant_name
       FROM applications a LEFT JOIN merchants m ON m.id = a.merchant_id
      WHERE a.status IN ('PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING')
      ORDER BY a.screening_submitted_at ASC`
  )
  json(res, 200, { applications: rows.map(row => ({
    id: row.id,
    maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    status: row.status,
    statusText: statusText[row.status] || '待处理',
    contactResult: row.contact_result,
    contactReason: row.contact_reason || '',
    needsRecontact: row.status === 'CONTACTING' && row.contact_result === 'UNREACHABLE',
    merchantName: row.merchant_name || '未关联商家',
    submittedAt: row.screening_submitted_at,
    updatedAt: row.updated_at
  })) })
}
async function customerApplicationDetail(req, res, id) {
  await sessionFor(req, 'customer-service')
  const [[row]] = await db.execute(
    `SELECT a.*, m.name AS merchant_name, m.contact_name AS merchant_contact_name,
            m.contact_phone AS merchant_contact_phone
       FROM applications a LEFT JOIN merchants m ON m.id = a.merchant_id
       WHERE a.id = ? AND a.status IN ('PENDING', 'CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING', 'CONFIRMED')`,
    [id]
  )
  if (!row) throw Object.assign(new Error('待审核申请不存在或已被处理'), { status: 404 })
  json(res, 200, { application: {
    id: row.id,
    maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    phone: row.phone_snapshot,
    status: row.status,
    statusText: statusText[row.status] || '待处理',
    localNumber: row.is_local_number === null ? null : Boolean(row.is_local_number),
    acceptLocalCard: row.accept_local_card === null ? null : Boolean(row.accept_local_card),
    attributionProvince: row.attribution_province || '',
    attributionCity: row.attribution_city || '',
    expenseTier: row.expense_tier,
    serviceMode: row.service_mode,
    verifyResult: row.verify_result,
    customerIntention: row.customer_intention,
    verificationRemark: row.verification_remark || '',
    correctedInfo: row.corrected_info,
    contactResult: row.contact_result,
    contactReason: row.contact_reason || '',
    commitments: parseCommitments(row.commitments),
    ruleVersion: row.rule_version,
    submittedAt: row.screening_submitted_at,
    merchant: row.merchant_id ? {
      name: row.merchant_name || '',
      contactName: row.merchant_contact_name || '',
      contactPhone: row.merchant_contact_phone || ''
    } : null
  } })
}
async function customerWorkItems(req, res) {
  await sessionFor(req, 'customer-service')
  const [rows] = await db.query(
    `SELECT a.*, f.voucher_remark, f.verification_reason, t.status AS task_status,
            COALESCE(am.name, m.name) AS merchant_name,
            COALESCE(s.display_name, s.phone) AS salesman_name
       FROM applications a
       LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
       LEFT JOIN users s ON s.id = a.assigned_salesman_user_id
       LEFT JOIN application_tasks t ON t.application_id = a.id
      WHERE a.status IN ('CONFIRMED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING',
                         'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT',
                         'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE',
                         'IN_STORE_SERVICE', 'VERIFICATION_RETURNED',
                         'COMPLETED', 'CANCELLED', 'SERVICE_COMPLETED', 'SERVICE_FAILED', 'CLIENT_DECLINED', 'CLOSED')
      ORDER BY a.updated_at ASC`
  )
  json(res, 200, { applications: rows.map(row => Object.assign(staffApplicationView(row), {
    merchantName: row.merchant_name || '', salesmanName: row.salesman_name || '',
    taskStatus: row.task_status || '', taskStatusText: TASK_STATUS_TEXT[row.task_status] || ''
  })) })
}
async function customerWorkItemDetail(req, res, id) {
  await sessionFor(req, 'customer-service')
  const [[row]] = await db.query(
    `SELECT a.*, m.name AS source_merchant_name, m.contact_name AS merchant_contact_name,
            m.contact_phone AS merchant_contact_phone, am.name AS assigned_store_name,
            COALESCE(u.display_name, u.phone) AS handler_name, ur.salesman_code, ur.salesman_type,
            f.identity_verified, f.voucher_remark, f.verification_status, f.verification_reason,
            f.submitted_at AS fulfillment_submitted_at, f.verified_at AS fulfillment_verified_at
       FROM applications a
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
       LEFT JOIN users u ON u.id = a.assigned_salesman_user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'salesman'
       LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE a.id = ?`, [id])
  if (!row) throw Object.assign(new Error('业务数据不存在'), { status: 404 })
  const [history] = await db.query(
    `SELECT h.id, h.from_status, h.to_status, h.action_code, h.reason, h.operator_role, h.metadata, h.created_at,
            COALESCE(u.display_name, u.phone, u.login_name, '系统') AS operator_name
       FROM application_status_history h LEFT JOIN users u ON u.id = h.operator_user_id
      WHERE h.application_id = ? ORDER BY h.created_at ASC, h.id ASC`, [id])
  const [[task]] = await db.query('SELECT * FROM application_tasks WHERE application_id = ?', [id])
  let taskHistory = []
  let taskContacts = []
  if (task) {
    ;[taskHistory] = await db.query(
      `SELECT h.id, h.old_status, h.new_status, h.operation, h.remark, h.created_at,
              COALESCE(u.display_name, u.phone, '系统') AS operator_name
         FROM application_task_status_history h LEFT JOIN users u ON u.id = h.operator_user_id
        WHERE h.task_id = ? ORDER BY h.created_at ASC, h.id ASC`, [task.id])
    ;[taskContacts] = await db.query(
      `SELECT c.id, c.result, c.failure_reason, c.remark, c.is_retry, c.contacted_at,
              COALESCE(u.display_name, u.phone, '系统') AS operator_name
         FROM application_contact_records c LEFT JOIN users u ON u.id = c.operator_user_id
        WHERE c.task_id = ? ORDER BY c.contacted_at DESC, c.id DESC`, [task.id])
  }
  json(res, 200, { application: {
    id: row.id, phone: row.phone_snapshot, status: row.status, statusText: statusText[row.status] || row.status,
    statusDescription: statusDescription[row.status] || '', serviceMode: row.service_mode,
    verifyResult: row.verify_result, customerIntention: row.customer_intention,
    verificationRemark: row.verification_remark || '', correctedInfo: row.corrected_info,
    contactResult: row.contact_result, contactReason: row.contact_reason || '',
    appointmentTime: row.appointment_time, sourceMerchantName: row.source_merchant_name || '',
    serviceAddress: row.detail_address || row.service_address || '', serviceRegion: row.district || row.service_region || '',
    province: row.province || '', city: row.city || '', district: row.district || '',
    detailAddress: row.detail_address || row.service_address || '', districtAreaId: row.district_area_id || null,
    latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude),
    merchantContactName: row.merchant_contact_name || '', merchantContactPhone: row.merchant_contact_phone || '',
    assignedStoreName: row.assigned_store_name || '', handlerName: row.handler_name || '',
    salesmanCode: row.salesman_code || '', salesmanType: row.salesman_type || '',
    expenseTier: row.expense_tier, createdAt: row.created_at, updatedAt: row.updated_at,
    fulfillment: row.voucher_remark ? { identityVerified: Boolean(row.identity_verified), voucherRemark: row.voucher_remark, verificationStatus: row.verification_status, verificationReason: row.verification_reason || '', submittedAt: row.fulfillment_submitted_at, verifiedAt: row.fulfillment_verified_at } : null,
    history: history.map(item => ({ id: item.id, fromStatusText: statusText[item.from_status] || item.from_status || '无', toStatusText: statusText[item.to_status] || item.to_status, actionCode: item.action_code, reason: item.reason || '', operatorName: item.operator_name, operatorRole: item.operator_role || 'system', createdAt: item.created_at })),
    task: task ? Object.assign(taskView(task), {
      history: taskHistory.map(item => ({ id: item.id, oldStatusText: TASK_STATUS_TEXT[item.old_status] || item.old_status || '无', newStatusText: TASK_STATUS_TEXT[item.new_status] || item.new_status, operation: item.operation, remark: item.remark || '', operatorName: item.operator_name, createdAt: item.created_at })),
      contacts: taskContacts.map(item => ({ id: item.id, result: item.result, failureReason: item.failure_reason || '', remark: item.remark || '', isRetry: Boolean(item.is_retry), operatorName: item.operator_name, contactedAt: item.contacted_at }))
    }) : null
  } })
}
async function customerSalesmen(req, res) {
  await sessionFor(req, 'customer-service')
  const [rows] = await db.execute(
    `SELECT r.salesman_code AS id, COALESCE(u.display_name, u.phone, r.salesman_code) AS name, u.phone, r.salesman_type AS salesmanType,
            r.service_region AS serviceRegion, r.area_id AS areaId,
            (SELECT COUNT(*) FROM application_tasks t WHERE t.assignee_user_id = u.id AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'ABNORMAL_CLOSED', 'PROCESSING_FAILED')) AS activeTaskCount,
            (SELECT MIN(t.appointment_time) FROM application_tasks t WHERE t.assignee_user_id = u.id AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'ABNORMAL_CLOSED', 'PROCESSING_FAILED') AND t.appointment_time IS NOT NULL) AS nextAppointmentTime
       FROM user_roles r JOIN users u ON u.id = r.user_id
      WHERE r.role_code = 'salesman' AND u.account_status = 'ACTIVE' AND r.salesman_code IS NOT NULL
      ORDER BY u.display_name, r.salesman_code`
  )
  json(res, 200, { salesmen: rows })
}
async function customerOutlets(req, res) {
  await sessionFor(req, 'customer-service')
  const [rows] = await db.execute("SELECT id, name, contact_name AS contactName, contact_phone AS contactPhone, service_region AS serviceRegion, area_id AS areaId, latitude, longitude FROM merchants WHERE status = 'ACTIVE' ORDER BY name")
  json(res, 200, { outlets: rows })
}

async function selectRegionalCandidates(candidates, districtAreaId) {
  const sameArea = candidates.filter(item => Number(item.areaId) === Number(districtAreaId))
  if (sameArea.length) return { candidates: sameArea, matchLevel: 'SAME_DISTRICT', matchedAreaId: Number(districtAreaId) }
  const [neighbors] = await db.execute('SELECT neighbor_area_id AS areaId FROM sys_area_neighbor WHERE area_id = ? ORDER BY sort_order', [districtAreaId])
  for (const neighbor of neighbors) {
    const matched = candidates.filter(item => Number(item.areaId) === Number(neighbor.areaId))
    if (matched.length) return { candidates: matched, matchLevel: 'NEIGHBOR_DISTRICT', matchedAreaId: Number(neighbor.areaId) }
  }
  return { candidates, matchLevel: 'CHENGDU_FALLBACK', matchedAreaId: null }
}

async function resolveDistrictArea(executor, province, city, district) {
  const [[area]] = await executor.execute(
    `SELECT d.id FROM sys_area d JOIN sys_area c ON c.id = d.parent_id JOIN sys_area p ON p.id = c.parent_id
      WHERE d.level = 3 AND p.name = ? AND c.name = ? AND d.name = ? LIMIT 1`,
    [province, city, district]
  )
  if (!area) throw Object.assign(new Error('请选择区域基础表中有效的省、市、区县'), { status: 400 })
  return area.id
}

async function regionalDispatchCandidates(req, res, id) {
  await sessionFor(req, 'customer-service')
  const [[application]] = await db.execute('SELECT district_area_id FROM applications WHERE id = ?', [id])
  if (!application) throw Object.assign(new Error('申请不存在'), { status: 404 })
  if (!application.district_area_id) throw Object.assign(new Error('申请尚未关联客户所在区县'), { status: 400 })
  const [salesmen] = await db.execute(
    `SELECT r.salesman_code AS id, COALESCE(u.display_name, u.phone, r.salesman_code) AS name, u.phone,
            r.service_region AS serviceRegion, r.area_id AS areaId,
            (SELECT COUNT(*) FROM application_tasks t WHERE t.assignee_user_id = u.id AND t.status NOT IN ('COMPLETED','CANCELLED','ABNORMAL_CLOSED','PROCESSING_FAILED')) AS activeTaskCount,
            (SELECT MIN(t.appointment_time) FROM application_tasks t WHERE t.assignee_user_id = u.id AND t.status NOT IN ('COMPLETED','CANCELLED','ABNORMAL_CLOSED','PROCESSING_FAILED') AND t.appointment_time IS NOT NULL) AS nextAppointmentTime
       FROM user_roles r JOIN users u ON u.id = r.user_id JOIN sys_area d ON d.id = r.area_id JOIN sys_area c ON c.id = d.parent_id
      WHERE r.role_code = 'salesman' AND r.salesman_type = 'HOME_VISIT' AND u.account_status = 'ACTIVE' AND c.name = '成都市'
      ORDER BY activeTaskCount, name`)
  const [outlets] = await db.execute(
    `SELECT m.id, m.name, m.contact_name AS contactName, m.contact_phone AS contactPhone,
            m.service_region AS serviceRegion, m.area_id AS areaId, m.latitude, m.longitude
       FROM merchants m JOIN sys_area d ON d.id = m.area_id JOIN sys_area c ON c.id = d.parent_id
      WHERE m.status = 'ACTIVE' AND c.name = '成都市' ORDER BY m.name`)
  const [salesmanSelection, outletSelection] = await Promise.all([
    selectRegionalCandidates(salesmen, application.district_area_id),
    selectRegionalCandidates(outlets, application.district_area_id)
  ])
  json(res, 200, { salesmen: salesmanSelection, outlets: outletSelection })
}
async function customerVerifications(req, res, category) {
  await sessionFor(req, 'customer-service')
  const completed = category === 'completed'
  const rejected = category === 'rejected'
  const [rows] = await db.query(
    `SELECT a.id, a.phone_snapshot, a.status, a.service_mode, a.updated_at, f.submitted_at, f.verified_at, f.verification_reason,
            COALESCE(u.display_name, u.phone) AS salesman_name,
            COALESCE(am.name, m.name) AS outlet_name
       FROM applications a
       JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
       LEFT JOIN users u ON u.id = COALESCE(f.submitted_by_user_id, f.salesman_user_id)
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
      WHERE a.status = ? ${completed ? "AND f.verification_status = 'APPROVED'" : rejected ? "AND f.verification_status = 'RETURNED'" : "AND f.verification_status = 'PENDING'"}
      ORDER BY ${completed || rejected ? 'f.verified_at DESC' : 'f.submitted_at ASC'}`,
    [completed ? 'COMPLETED' : rejected ? 'VERIFICATION_RETURNED' : 'PENDING_VERIFICATION']
  )
  json(res, 200, { verifications: rows.map(row => ({
    id: row.id, maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    status: row.status, statusText: statusText[row.status] || '待处理',
    serviceMode: row.service_mode, salesmanName: row.salesman_name || '', outletName: row.outlet_name || '',
    submittedAt: row.submitted_at, verifiedAt: row.verified_at, verificationReason: row.verification_reason || '', updatedAt: row.updated_at
  })) })
}
async function customerVerificationDetail(req, res, id) {
  await sessionFor(req, 'customer-service')
  const [[row]] = await db.query(
    `SELECT a.*, f.identity_verified, f.voucher_remark, f.submitted_at AS fulfillment_submitted_at,
            COALESCE(u.display_name, u.phone) AS salesman_name, ur.salesman_code, ur.salesman_type,
            COALESCE(am.name, m.name) AS outlet_name
       FROM applications a
       JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
       LEFT JOIN users u ON u.id = COALESCE(f.submitted_by_user_id, f.salesman_user_id)
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'salesman'
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
      WHERE a.id = ? AND a.status = 'PENDING_VERIFICATION'`, [id]
  )
  if (!row) throw Object.assign(new Error('待核销订单不存在或已处理'), { status: 404 })
  json(res, 200, { verification: {
    id: row.id, phone: row.phone_snapshot, serviceMode: row.service_mode,
    outletName: row.outlet_name || '', salesmanName: row.salesman_name || '',
    salesmanCode: row.salesman_code || '', salesmanType: row.salesman_type || '',
    identityVerified: Boolean(row.identity_verified), voucherRemark: row.voucher_remark || '',
    submittedAt: row.fulfillment_submitted_at, applicationSubmittedAt: row.screening_submitted_at,
    expenseTier: row.expense_tier
  } })
}
async function customerAction(req, res, id, action) {
  const user = await sessionFor(req, 'customer-service')
  const body = await readBody(req)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[current]] = await connection.execute('SELECT status, service_mode, service_region FROM applications WHERE id = ? FOR UPDATE', [id])
    if (!current) throw Object.assign(new Error('申请不存在'), { status: 404 })
    if (action === 'start-contact') {
      await changeStatus(id, 'PENDING', 'CONTACTING', 'CONTACT_STARTED', user, null, {}, connection)
    } else if (action === 'contact-result') {
    const result = String(body.result || '')
    const target = { CONTACTED: 'VERIFYING', UNREACHABLE: 'CONTACTING', CLIENT_DECLINED: 'CANCELLED' }[result]
    if (!target) throw Object.assign(new Error('请选择有效的联系结果'), { status: 400 })
    if (result !== 'CONTACTED' && !String(body.reason || '').trim()) throw Object.assign(new Error('请填写联系结果说明'), { status: 400 })
    if (target === 'CONTACTING') await recordStatusEvent(id, 'CONTACTING', `CONTACT_${result}`, user, body.reason, {}, connection)
    else await changeStatus(id, 'CONTACTING', target, `CONTACT_${result}`, user, body.reason, {}, connection)
    await connection.execute('UPDATE applications SET contact_result = ?, contact_reason = ? WHERE id = ?', [result, body.reason || null, id])
    await connection.execute('INSERT INTO application_contact_records (application_id, operator_user_id, result, remark) VALUES (?, ?, ?, ?)', [id, user.id, result, body.reason || null])
    } else if (action === 'verify-info') {
      const result = String(body.verifyResult || '')
      if (!['VERIFIED', 'INVALID_INFO'].includes(result)) throw Object.assign(new Error('请选择信息属实或信息不属实'), { status: 400 })
      if (result === 'INVALID_INFO' && !String(body.remark || '').trim()) throw Object.assign(new Error('请填写信息异常说明'), { status: 400 })
      await changeStatus(id, 'VERIFYING', result, result === 'VERIFIED' ? 'INFORMATION_VERIFIED' : 'INFORMATION_INVALID', user, body.remark, {}, connection)
      await connection.execute('UPDATE applications SET verify_result = ?, verification_remark = ?, verified_by_user_id = ?, verified_at = NOW(3) WHERE id = ?', [result, body.remark || null, user.id, id])
      await connection.execute('INSERT INTO application_reviews (application_id, reviewer_user_id, decision, reason) VALUES (?, ?, ?, ?)', [id, user.id, result === 'VERIFIED' ? 'APPROVE' : 'REJECT', body.remark || null])
    } else if (action === 'intention') {
      const intention = String(body.customerIntention || '')
      if (!['WILLING', 'UNWILLING'].includes(intention)) throw Object.assign(new Error('请选择客户办理意愿'), { status: 400 })
      const from = current.status
      if (!['VERIFIED', 'INVALID_INFO'].includes(from)) throw Object.assign(new Error('当前申请不能确认办理意愿'), { status: 409 })
      const target = intention === 'UNWILLING' ? 'CANCELLED' : from === 'INVALID_INFO' ? 'CORRECTING' : 'VERIFIED'
      if (from === target) await recordStatusEvent(id, from, 'CUSTOMER_WILLING', user, body.remark, { customerIntention: intention }, connection)
      else await changeStatus(id, from, target, intention === 'UNWILLING' ? 'CUSTOMER_CANCELLED' : 'CUSTOMER_WILLING', user, body.remark, { customerIntention: intention }, connection)
      await connection.execute('UPDATE applications SET customer_intention = ?, intention_confirmed_at = NOW(3), closed_reason = ? WHERE id = ?', [intention, intention === 'UNWILLING' ? body.remark || '客户无办理意愿' : null, id])
    } else if (action === 'correct-info') {
      const correctedInfo = body.correctedInfo
      if (!correctedInfo || typeof correctedInfo !== 'object') throw Object.assign(new Error('请填写需要更正的客户信息'), { status: 400 })
      if (typeof correctedInfo.localNumber !== 'boolean') throw Object.assign(new Error('请选择手机号是否为本地号码'), { status: 400 })
      if (!correctedInfo.localNumber && correctedInfo.acceptLocalCard !== true) throw Object.assign(new Error('非本地号码需确认客户接受办理本地卡'), { status: 400 })
      if (!expenseTiers.has(String(correctedInfo.expenseTier || ''))) throw Object.assign(new Error('请选择有效的套餐档位'), { status: 400 })
      if (!Array.isArray(correctedInfo.commitments) || correctedInfo.commitments.length !== 3 || !correctedInfo.commitments.every(Boolean)) throw Object.assign(new Error('请确认全部三年履约要求'), { status: 400 })
      const normalizedCorrection = {
        localNumber: correctedInfo.localNumber,
        acceptLocalCard: correctedInfo.localNumber ? null : true,
        expenseTier: correctedInfo.expenseTier,
        commitments: [true, true, true],
        remark: String(body.remark || '').trim()
      }
      await changeStatus(id, 'CORRECTING', 'VERIFIED', 'INFORMATION_CORRECTED', user, normalizedCorrection.remark, { correctedInfo: normalizedCorrection }, connection)
      await connection.execute(
        "UPDATE applications SET corrected_info = ?, verify_result = 'VERIFIED', local_option = ?, is_local_number = ?, accept_local_card = ?, is_local_resident = ?, expense_tier = ?, commitments = ? WHERE id = ?",
        [JSON.stringify(normalizedCorrection), normalizedCorrection.localNumber ? 'LOCAL_NUMBER' : 'ACCEPT_LOCAL_CARD', normalizedCorrection.localNumber ? 1 : 0, normalizedCorrection.acceptLocalCard === null ? null : 1, normalizedCorrection.localNumber ? 1 : 0, normalizedCorrection.expenseTier, JSON.stringify(normalizedCorrection.commitments), id]
      )
    } else if (action === 'service-type' || action === 'service-mode') {
    const mode = String(body.serviceMode || '')
    if (!['HOME_SERVICE', 'STORE_SERVICE'].includes(mode)) throw Object.assign(new Error('请选择上门办理或营业厅办理'), { status: 400 })
    if (current.status !== 'VERIFIED' || current.status === 'VERIFIED' && current.service_mode) throw Object.assign(new Error('当前申请不能确认办理方式'), { status: 409 })
    await changeStatus(id, 'VERIFIED', 'CONFIRMED', 'SERVICE_TYPE_CONFIRMED', user, null, { serviceMode: mode }, connection)
    const province = String(body.province || '四川省').trim()
    const city = String(body.city || '成都市').trim()
    const district = String(body.district || body.serviceRegion || '').trim()
    const detailAddress = String(body.detailAddress || body.serviceAddress || '').trim()
    if (!province || !city || !district) throw Object.assign(new Error('请完整填写客户省、市、区县'), { status: 400 })
    if (!detailAddress) throw Object.assign(new Error('请填写客户详细地址'), { status: 400 })
    const districtAreaId = await resolveDistrictArea(connection, province, city, district)
    await connection.execute(
      `UPDATE applications SET service_mode = ?, service_address = ?, service_region = ?,
              province = ?, city = ?, district = ?, detail_address = ?, district_area_id = ?
        WHERE id = ?`,
      [mode, mode === 'HOME_SERVICE' ? detailAddress : null, district, province, city, district, detailAddress || null, districtAreaId, id]
    )
  } else if (action === 'confirm-appointment') {
    if (!String(body.appointmentTime || '').trim()) throw Object.assign(new Error('请填写已确认的上门时间'), { status: 400 })
    await changeStatus(id, 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'APPOINTMENT_CONFIRMED', user, null, { appointmentTime: body.appointmentTime }, connection)
    await connection.execute('UPDATE applications SET appointment_time = ? WHERE id = ?', [body.appointmentTime, id])
    await connection.execute('INSERT INTO application_appointments (application_id, appointment_time, confirmed_by_user_id) VALUES (?, ?, ?)', [id, body.appointmentTime, user.id])
  } else if (action === 'dispatch') {
    if (current.status !== 'CONFIRMED' || current.service_mode !== 'HOME_SERVICE') throw Object.assign(new Error('当前上门任务不能派单'), { status: 409 })
    if (!current.district_area_id) throw Object.assign(new Error('该上门任务尚未关联客户所在区县'), { status: 400 })
    const [[salesman]] = await connection.query("SELECT u.id, u.display_name, r.service_region, r.area_id FROM users u JOIN user_roles r ON r.user_id = u.id WHERE r.role_code = 'salesman' AND r.salesman_type = 'HOME_VISIT' AND r.salesman_code = ? AND u.account_status = 'ACTIVE'", [body.salesmanId])
    if (!salesman) throw Object.assign(new Error('请选择有效的业务员'), { status: 400 })
    const [availableSalesmen] = await connection.query("SELECT r.salesman_code AS id, r.area_id AS areaId FROM users u JOIN user_roles r ON r.user_id = u.id JOIN sys_area d ON d.id = r.area_id JOIN sys_area c ON c.id = d.parent_id WHERE r.role_code = 'salesman' AND r.salesman_type = 'HOME_VISIT' AND u.account_status = 'ACTIVE' AND c.name = '成都市'")
    const salesmanSelection = await selectRegionalCandidates(availableSalesmen, current.district_area_id)
    if (!salesmanSelection.candidates.some(item => item.id === body.salesmanId)) throw Object.assign(new Error('请选择当前推荐层级内的业务员'), { status: 400 })
    const nearbyFallback = salesmanSelection.matchLevel !== 'SAME_DISTRICT'
    await changeStatus(id, 'CONFIRMED', 'DISPATCHING', 'DISPATCH_STARTED', user, null, {}, connection)
    await changeStatus(id, 'DISPATCHING', 'ASSIGNED', 'DISPATCHED', user, null, { salesmanId: body.salesmanId, nearbyFallback, selectedRegion: salesman.service_region }, connection)
    await connection.execute('UPDATE applications SET assigned_salesman_user_id = ?, assigned_merchant_id = NULL WHERE id = ?', [salesman.id, id])
    await connection.execute('INSERT INTO application_dispatches (application_id, salesman_user_id, dispatcher_user_id) VALUES (?, ?, ?)', [id, salesman.id, user.id])
    await createApplicationTask(id, user, connection)
  } else if (action === 'assign-store') {
    const outletId = Number(body.outletId)
    if (!current.district_area_id) throw Object.assign(new Error('该网点任务尚未关联客户所在区县'), { status: 400 })
    const [[outlet]] = await connection.execute("SELECT id, service_region, area_id FROM merchants WHERE id = ? AND status = 'ACTIVE'", [outletId])
    if (!outlet) throw Object.assign(new Error('请选择有效的指定网点'), { status: 400 })
    const [availableOutlets] = await connection.query("SELECT m.id, m.area_id AS areaId FROM merchants m JOIN sys_area d ON d.id = m.area_id JOIN sys_area c ON c.id = d.parent_id WHERE m.status = 'ACTIVE' AND c.name = '成都市'")
    const outletSelection = await selectRegionalCandidates(availableOutlets, current.district_area_id)
    if (!outletSelection.candidates.some(item => Number(item.id) === outletId)) throw Object.assign(new Error('请选择当前推荐层级内的网点'), { status: 400 })
    const nearbyFallback = outletSelection.matchLevel !== 'SAME_DISTRICT'
    if (current.status !== 'CONFIRMED' || current.service_mode !== 'STORE_SERVICE') throw Object.assign(new Error('当前任务不能派遣到网点'), { status: 409 })
    await changeStatus(id, 'CONFIRMED', 'DISPATCHING', 'DISPATCH_STARTED', user, null, {}, connection)
    await changeStatus(id, 'DISPATCHING', 'ASSIGNED', 'STORE_ASSIGNED', user, null, { outletId, nearbyFallback, selectedRegion: outlet.service_region }, connection)
    await connection.execute('UPDATE applications SET assigned_merchant_id = ?, assigned_salesman_user_id = NULL WHERE id = ?', [outletId, id])
    await connection.execute('INSERT INTO application_dispatches (application_id, salesman_user_id, submitted_by_user_id, dispatcher_user_id, note) VALUES (?, NULL, ?, ?, ?)', [id, user.id, user.id, `网点:${outletId}`])
    await createApplicationTask(id, user, connection)
  } else if (action === 'start-store') {
    const [[managedTask]] = await connection.execute('SELECT id FROM application_tasks WHERE application_id = ?', [id])
    if (managedTask) throw Object.assign(new Error('该订单已启用新版任务流程，请由网点工作人员处理'), { status: 409 })
    await changeStatus(id, 'ASSIGNED', 'PROCESSING', 'STORE_SERVICE_STARTED', user, null, {}, connection)
  } else if (action === 'submit-store') {
    const [[managedTask]] = await connection.execute('SELECT id FROM application_tasks WHERE application_id = ?', [id])
    if (managedTask) throw Object.assign(new Error('该订单已启用新版任务流程，请由网点工作人员上传结果'), { status: 409 })
    if (!String(body.voucherRemark || '').trim()) throw Object.assign(new Error('请填写营业厅办理结果与凭证说明'), { status: 400 })
    if (current.service_mode !== 'STORE_SERVICE' || !['PROCESSING', 'VERIFICATION_RETURNED'].includes(current.status)) throw Object.assign(new Error('当前申请不能提交营业厅办理凭证'), { status: 409 })
    await changeStatus(id, current.status, 'PENDING_VERIFICATION', 'STORE_FULFILLMENT_SUBMITTED', user, null, {}, connection)
    await connection.execute('INSERT INTO fulfillment_submissions (application_id, submitted_by_user_id, identity_verified, voucher_remark) VALUES (?, ?, 1, ?)', [id, user.id, body.voucherRemark.trim()])
  } else if (action === 'service-fail') {
    const [[managedTask]] = await connection.execute('SELECT id FROM application_tasks WHERE application_id = ?', [id])
    if (managedTask) throw Object.assign(new Error('该订单已启用新版任务流程，请在任务详情中异常结束'), { status: 409 })
    if (!String(body.reason || '').trim()) throw Object.assign(new Error('请填写办理失败原因'), { status: 400 })
    if (current.status !== 'PROCESSING') throw Object.assign(new Error('当前申请不能标记为办理失败'), { status: 409 })
    await changeStatus(id, current.status, 'SERVICE_FAILED', 'STORE_SERVICE_FAILED', user, body.reason, {}, connection)
    await connection.execute('UPDATE applications SET service_failure_reason = ? WHERE id = ?', [body.reason.trim(), id])
  } else if (action === 'verify') {
    const approve = body.decision === 'APPROVE'
    if (!approve && !String(body.reason || '').trim()) throw Object.assign(new Error('退回时请填写原因'), { status: 400 })
    if (approve && body.customerConfirmed !== true) throw Object.assign(new Error('请先与客户确认业务已办理完成'), { status: 400 })
    await changeStatus(id, 'PENDING_VERIFICATION', approve ? 'COMPLETED' : 'VERIFICATION_RETURNED', approve ? 'FULFILLMENT_VERIFIED' : 'FULFILLMENT_RETURNED', user, body.reason, { customerConfirmed: approve }, connection)
    await connection.execute('UPDATE fulfillment_submissions SET verification_status = ?, verification_reason = ?, verifier_user_id = ?, verified_at = NOW(3) WHERE application_id = ? ORDER BY submitted_at DESC LIMIT 1', [approve ? 'APPROVED' : 'RETURNED', body.reason || null, user.id, id])
    const [[task]] = await connection.execute("SELECT id, status FROM application_tasks WHERE application_id = ? FOR UPDATE", [id])
    if (task && task.status === 'PENDING_VERIFICATION') {
      await changeTaskStatus(task.id, 'PENDING_VERIFICATION', approve ? 'COMPLETED' : 'WAITING_RESULT_UPLOAD', approve ? 'TASK_VERIFICATION_APPROVED' : 'TASK_VERIFICATION_RETURNED', user, body.reason, {}, connection, approve ? 'completed_at = NOW(3)' : '')
    }
  } else throw Object.assign(new Error('未知客服操作'), { status: 404 })
    await connection.commit()
  } catch (cause) {
    await connection.rollback()
    throw cause
  } finally {
    connection.release()
  }
  json(res, 200, { ok: true })
}
async function salesmanApplications(req, res) {
  const user = await sessionFor(req, 'salesman')
  const branch = user.salesman_type === 'BRANCH'
  const [rows] = await db.query(
    `SELECT a.*, f.voucher_remark, f.verification_reason
      FROM applications a LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE ${branch
        ? "a.service_mode = 'STORE_SERVICE' AND a.status IN ('ASSIGNED','PROCESSING','VERIFICATION_RETURNED','PENDING_VERIFICATION') AND (a.assigned_salesman_user_id IS NULL OR a.assigned_salesman_user_id = ?)"
        : "a.assigned_salesman_user_id = ? AND a.service_mode = 'HOME_SERVICE' AND a.status IN ('ASSIGNED','PROCESSING','VERIFICATION_RETURNED','PENDING_VERIFICATION')"}
      ORDER BY a.appointment_time ASC, a.updated_at ASC`, [user.id]
  )
  json(res, 200, { salesmanType: branch ? 'BRANCH' : 'HOME_VISIT', applications: rows.map(staffApplicationView) })
}
async function salesmanAction(req, res, id, action) {
  const user = await sessionFor(req, 'salesman')
  const body = await readBody(req)
  const branch = user.salesman_type === 'BRANCH'
  const [[application]] = await db.query('SELECT assigned_salesman_user_id, service_mode, status FROM applications WHERE id = ?', [id])
  const [[managedTask]] = await db.query('SELECT id FROM application_tasks WHERE application_id = ?', [id])
  if (managedTask) throw Object.assign(new Error('该订单已启用新版任务流程，请从任务中心按步骤处理'), { status: 409 })
  const canClaimBranch = branch && application && application.service_mode === 'STORE_SERVICE' && application.status === 'ASSIGNED' && application.assigned_salesman_user_id === null
  if (!application || (!canClaimBranch && application.assigned_salesman_user_id !== user.id)) throw Object.assign(new Error('无权操作该申请'), { status: 403 })
  if (action === 'start') {
    if (branch) {
      const [claimed] = await db.query("UPDATE applications SET assigned_salesman_user_id = ? WHERE id = ? AND service_mode = 'STORE_SERVICE' AND status = 'ASSIGNED' AND assigned_salesman_user_id IS NULL", [user.id, id])
      if (!claimed.affectedRows && application.assigned_salesman_user_id !== user.id) throw Object.assign(new Error('该网点任务已被其他业务员接手'), { status: 409 })
      await changeStatus(id, 'ASSIGNED', 'PROCESSING', 'BRANCH_SERVICE_STARTED', user)
    } else {
      if (application.service_mode !== 'HOME_SERVICE') throw Object.assign(new Error('上门型业务员不能处理网点任务'), { status: 403 })
      await changeStatus(id, 'ASSIGNED', 'PROCESSING', 'SERVICE_STARTED', user)
    }
  } else if (action === 'submit') {
    if (!body.identityVerified) throw Object.assign(new Error('请先确认已完成实名核实'), { status: 400 })
    if (!String(body.voucherRemark || '').trim()) throw Object.assign(new Error('请填写办理凭证说明'), { status: 400 })
    const [[current]] = await db.query('SELECT status FROM applications WHERE id = ?', [id])
    const allowed = ['PROCESSING', 'VERIFICATION_RETURNED']
    if (!allowed.includes(current.status)) throw Object.assign(new Error('当前申请不能提交凭证'), { status: 409 })
    await changeStatus(id, current.status, 'PENDING_VERIFICATION', 'FULFILLMENT_SUBMITTED', user)
    await db.query('INSERT INTO fulfillment_submissions (application_id, salesman_user_id, submitted_by_user_id, identity_verified, voucher_remark) VALUES (?, ?, ?, 1, ?)', [id, user.id, user.id, body.voucherRemark.trim()])
  } else if (action === 'fail') {
    if (!String(body.reason || '').trim()) throw Object.assign(new Error('请填写办理失败原因'), { status: 400 })
    await changeStatus(id, 'PROCESSING', 'SERVICE_FAILED', branch ? 'BRANCH_SERVICE_FAILED' : 'HOME_SERVICE_FAILED', user, body.reason)
    await db.execute('UPDATE applications SET service_failure_reason = ? WHERE id = ?', [body.reason.trim(), id])
  } else throw Object.assign(new Error('未知业务员操作'), { status: 404 })
  json(res, 200, { ok: true })
}
const taskCategories = {
  pending: ['PENDING_ACCEPT', 'ACCEPTED'],
  contact: ['WAITING_CONTACT'],
  'contact-failed': ['CONTACT_FAILED'],
  waiting: ['CONTACTED', 'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'WAITING_HOME_SERVICE', 'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION'],
  processing: ['PROCESSING'],
  upload: ['WAITING_RESULT_UPLOAD', 'VERIFICATION_RETURNED'],
  verification: ['PENDING_VERIFICATION'],
  completed: ['COMPLETED'],
  abnormal: ['PROCESSING_FAILED', 'CANCELLED', 'ABNORMAL_CLOSED']
}
function salesmanStoreId(user) { return Number(user.assigned_merchant_id || user.merchant_id || 0) }
function taskView(row, includePhone = false) {
  const phone = String(row.customer_phone || '')
  const terminalOrLocked = ['PENDING_ACCEPT', 'PENDING_VERIFICATION', 'COMPLETED', 'ABNORMAL_CLOSED', 'PROCESSING_FAILED', 'CANCELLED']
  return {
    id: row.id, applicationId: row.application_id, serviceType: row.service_type,
    status: row.status, statusText: TASK_STATUS_TEXT[row.status] || row.status,
    customerName: row.customer_name || '未填写',
    customerPhone: includePhone ? phone : '',
    maskedPhone: phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone,
    serviceAddress: row.service_address || '', appointmentTime: row.appointment_time,
    storeId: row.store_id, storeName: row.store_name || '', assigneeUserId: row.assignee_user_id,
    contactFailCount: Number(row.contact_fail_count || 0), failReason: row.fail_reason || '',
    canAbnormalClose: !terminalOrLocked.includes(row.status),
    dispatchedAt: row.created_at, acceptedAt: row.accepted_at, contactedAt: row.contacted_at,
    arrivedAt: row.arrived_at, startedAt: row.started_at, processingFinishedAt: row.processing_finished_at,
    resultUploadedAt: row.result_uploaded_at, completedAt: row.completed_at, updatedAt: row.updated_at,
    verificationReason: row.verification_reason || '', resultRemark: row.voucher_remark || ''
  }
}
function assertTaskOwnership(task, user) {
  if (!task) throw Object.assign(new Error('任务不存在'), { status: 404 })
  if (task.service_type === 'HOME_SERVICE' && Number(task.assignee_user_id) !== Number(user.id)) {
    throw Object.assign(new Error('该上门任务未分配给当前业务员'), { status: 403 })
  }
  if (task.service_type === 'STORE_SERVICE') {
    const storeId = salesmanStoreId(user)
    if (!storeId || Number(task.store_id) !== storeId) throw Object.assign(new Error('该到店任务不属于当前网点'), { status: 403 })
    if (task.assignee_user_id && Number(task.assignee_user_id) !== Number(user.id)) throw Object.assign(new Error('该任务已由其他网点工作人员接收'), { status: 403 })
  }
}
async function salesmanTasks(req, res, category) {
  const user = await sessionFor(req, 'salesman')
  const branch = user.salesman_type === 'BRANCH'
  const storeId = salesmanStoreId(user)
  if (branch && !storeId) throw Object.assign(new Error('网点型业务员尚未绑定办理网点，请联系管理员'), { status: 403 })
  const statuses = taskCategories[category] || []
  const statusSql = statuses.length ? ` AND t.status IN (${statuses.map(() => '?').join(',')})` : ''
  const [rows] = await db.query(
    `SELECT t.*, m.name AS store_name, f.voucher_remark, f.verification_reason
       FROM application_tasks t
       LEFT JOIN merchants m ON m.id = t.store_id
       LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE task_id = t.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE ${branch
        ? "t.service_type = 'STORE_SERVICE' AND t.store_id = ? AND (t.assignee_user_id IS NULL OR t.assignee_user_id = ?)"
        : "t.service_type = 'HOME_SERVICE' AND t.assignee_user_id = ?"}${statusSql}
      ORDER BY COALESCE(t.appointment_time, t.created_at) ASC, t.updated_at ASC`,
    [...(branch ? [storeId, user.id] : [user.id]), ...statuses]
  )
  json(res, 200, { salesmanType: branch ? 'BRANCH' : 'HOME_VISIT', tasks: rows.map(row => taskView(row)) })
}
async function salesmanTaskDetail(req, res, id) {
  const user = await sessionFor(req, 'salesman')
  const [[row]] = await db.query(
    `SELECT t.*, m.name AS store_name, f.voucher_remark, f.verification_reason
       FROM application_tasks t LEFT JOIN merchants m ON m.id = t.store_id
       LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE task_id = t.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE t.id = ?`, [id]
  )
  assertTaskOwnership(row, user)
  const [contacts] = await db.query(
    `SELECT c.id, c.contact_method, c.result, c.failure_reason, c.remark, c.is_retry, c.contacted_at,
            COALESCE(u.display_name, u.phone) AS operator_name
       FROM application_contact_records c LEFT JOIN users u ON u.id = c.operator_user_id
      WHERE c.task_id = ? ORDER BY c.contacted_at DESC, c.id DESC`, [id]
  )
  const [history] = await db.query(
    `SELECT h.id, h.old_status, h.new_status, h.operation, h.remark, h.created_at,
            COALESCE(u.display_name, u.phone, '系统') AS operator_name
       FROM application_task_status_history h LEFT JOIN users u ON u.id = h.operator_user_id
      WHERE h.task_id = ? ORDER BY h.created_at ASC, h.id ASC`, [id]
  )
  json(res, 200, { task: Object.assign(taskView(row, true), {
    contacts: contacts.map(item => ({ id: item.id, method: item.contact_method, result: item.result, failureReason: item.failure_reason || '', remark: item.remark || '', isRetry: Boolean(item.is_retry), contactedAt: item.contacted_at, operatorName: item.operator_name || '' })),
    history: history.map(item => ({ id: item.id, oldStatus: item.old_status, oldStatusText: TASK_STATUS_TEXT[item.old_status] || item.old_status || '无', newStatus: item.new_status, newStatusText: TASK_STATUS_TEXT[item.new_status] || item.new_status, operation: item.operation, remark: item.remark || '', operatorName: item.operator_name, createdAt: item.created_at }))
  }) })
}
async function salesmanTaskAction(req, res, id, action) {
  const user = await sessionFor(req, 'salesman')
  const body = await readBody(req)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[task]] = await connection.execute('SELECT * FROM application_tasks WHERE id = ? FOR UPDATE', [id])
    assertTaskOwnership(task, user)
    const [[application]] = await connection.execute('SELECT status FROM applications WHERE id = ? FOR UPDATE', [task.application_id])
    if (action === 'accept') {
      if (task.status !== 'PENDING_ACCEPT') throw Object.assign(new Error('当前任务无需重复接收'), { status: 409 })
      if (task.service_type === 'STORE_SERVICE' && !task.assignee_user_id) {
        await connection.execute('UPDATE application_tasks SET assignee_user_id = ? WHERE id = ? AND assignee_user_id IS NULL', [user.id, id])
        await connection.execute('UPDATE applications SET assigned_salesman_user_id = ? WHERE id = ?', [user.id, task.application_id])
      }
      await changeTaskStatus(id, 'PENDING_ACCEPT', 'ACCEPTED', 'TASK_ACCEPTED', user, null, {}, connection, 'accepted_at = NOW(3)')
      await changeTaskStatus(id, 'ACCEPTED', 'WAITING_CONTACT', 'WAITING_CUSTOMER_CONTACT', user, null, {}, connection)
    } else if (action === 'contact') {
      if (!['WAITING_CONTACT', 'CONTACT_FAILED'].includes(task.status)) throw Object.assign(new Error('当前任务不能记录联系结果'), { status: 409 })
      const result = String(body.result || '')
      if (!['CONTACT_SUCCESS', 'CONTACT_FAILED'].includes(result)) throw Object.assign(new Error('请选择有效的联系结果'), { status: 400 })
      const failureReason = String(body.failureReason || '').trim()
      const remark = String(body.remark || '').trim()
      if (result === 'CONTACT_FAILED' && !failureReason) throw Object.assign(new Error('联系失败时必须选择失败原因'), { status: 400 })
      const retry = task.status === 'CONTACT_FAILED' || Number(task.contact_fail_count) > 0
      await connection.execute(
        'INSERT INTO application_contact_records (application_id, task_id, customer_id, operator_user_id, contact_method, result, failure_reason, remark, is_retry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [task.application_id, id, task.customer_id, user.id, String(body.contactMethod || 'PHONE'), result, failureReason || null, remark || null, retry ? 1 : 0]
      )
      if (result === 'CONTACT_FAILED') {
        await changeTaskStatus(id, task.status, 'CONTACT_FAILED', 'CUSTOMER_CONTACT_FAILED', user, remark || failureReason, { failureReason }, connection, 'contact_fail_count = contact_fail_count + 1')
      } else {
        const serviceAddress = String(body.serviceAddress || '').trim()
        if (task.service_type === 'HOME_SERVICE' && !serviceAddress) throw Object.assign(new Error('请确认客户上门地址'), { status: 400 })
        if (task.service_type === 'HOME_SERVICE') {
          await connection.execute('UPDATE application_tasks SET service_address = ? WHERE id = ?', [serviceAddress, id])
          await connection.execute('UPDATE applications SET service_address = ? WHERE id = ?', [serviceAddress, task.application_id])
        }
        await changeTaskStatus(id, task.status, 'CONTACTED', 'CUSTOMER_CONTACTED', user, remark, {}, connection, 'contacted_at = NOW(3)')
        await changeTaskStatus(id, 'CONTACTED', 'WAITING_TIME_CONFIRMATION', 'WAITING_APPOINTMENT_CONFIRMATION', user, null, {}, connection)
      }
    } else if (action === 'appointment') {
      if (task.status !== 'WAITING_TIME_CONFIRMATION') throw Object.assign(new Error('当前任务不能确认办理时间'), { status: 409 })
      const appointmentTime = String(body.appointmentTime || '').trim()
      if (!appointmentTime || Number.isNaN(Date.parse(appointmentTime.replace(' ', 'T')))) throw Object.assign(new Error('请填写有效的办理时间'), { status: 400 })
      if (new Date(appointmentTime.replace(' ', 'T')).getTime() <= Date.now()) throw Object.assign(new Error('办理时间必须晚于当前时间'), { status: 400 })
      const serviceAddress = String(task.service_address || '').trim()
      if (task.service_type === 'HOME_SERVICE' && !serviceAddress) throw Object.assign(new Error('请先在联系客户环节确认上门地址'), { status: 400 })
      const appointmentFields = 'appointment_time = ' + connection.escape(appointmentTime)
      await changeTaskStatus(id, 'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'APPOINTMENT_CONFIRMED', user, null, { appointmentTime, serviceAddress }, connection, appointmentFields)
      const waitingStatus = task.service_type === 'HOME_SERVICE' ? 'WAITING_HOME_SERVICE' : 'WAITING_CUSTOMER_ARRIVAL'
      await changeTaskStatus(id, 'TIME_CONFIRMED', waitingStatus, task.service_type === 'HOME_SERVICE' ? 'WAITING_HOME_SERVICE' : 'WAITING_CUSTOMER_ARRIVAL', user, null, {}, connection)
      await connection.execute('UPDATE applications SET appointment_time = ? WHERE id = ?', [appointmentTime, task.application_id])
      await connection.execute('INSERT INTO application_appointments (application_id, appointment_time, confirmed_by_user_id, note) VALUES (?, ?, ?, ?)', [task.application_id, appointmentTime, user.id, task.service_type])
    } else if (action === 'arrive') {
      const expected = task.service_type === 'HOME_SERVICE' ? 'WAITING_HOME_SERVICE' : 'WAITING_CUSTOMER_ARRIVAL'
      if (task.status !== expected) throw Object.assign(new Error('当前任务不能确认到达或到店'), { status: 409 })
      await changeTaskStatus(id, expected, 'WAITING_START_CONFIRMATION', task.service_type === 'HOME_SERVICE' ? 'SALESMAN_ARRIVED' : 'CUSTOMER_ARRIVED', user, null, {}, connection, 'arrived_at = NOW(3)')
    } else if (action === 'start') {
      if (task.status !== 'WAITING_START_CONFIRMATION') throw Object.assign(new Error('当前任务尚未进入开始确认环节'), { status: 409 })
      await changeTaskStatus(id, 'WAITING_START_CONFIRMATION', 'PROCESSING', 'SERVICE_STARTED', user, null, {}, connection, 'started_at = NOW(3)')
      if (application.status === 'ASSIGNED') await changeStatus(task.application_id, 'ASSIGNED', 'PROCESSING', 'TASK_SERVICE_STARTED', user, null, { taskId: id }, connection)
    } else if (action === 'finish-processing') {
      if (task.status !== 'PROCESSING') throw Object.assign(new Error('当前任务不在办理中'), { status: 409 })
      await changeTaskStatus(id, 'PROCESSING', 'WAITING_RESULT_UPLOAD', 'SERVICE_PROCESSING_FINISHED', user, String(body.remark || '').trim(), {}, connection, 'processing_finished_at = NOW(3)')
    } else if (action === 'result') {
      if (task.status !== 'WAITING_RESULT_UPLOAD') throw Object.assign(new Error('当前任务不能上传办理结果'), { status: 409 })
      if (!body.identityVerified) throw Object.assign(new Error('请先确认已完成客户实名核实'), { status: 400 })
      const resultStatus = String(body.resultStatus || 'SUCCESS')
      if (resultStatus !== 'SUCCESS') throw Object.assign(new Error('办理失败请使用异常结束并填写失败原因'), { status: 400 })
      const description = String(body.resultDescription || '').trim()
      if (!description) throw Object.assign(new Error('请填写办理结果说明'), { status: 400 })
      if (!['PROCESSING', 'VERIFICATION_RETURNED'].includes(application.status)) throw Object.assign(new Error('订单当前状态不能接收办理结果'), { status: 409 })
      await changeTaskStatus(id, 'WAITING_RESULT_UPLOAD', 'PENDING_VERIFICATION', 'SERVICE_RESULT_UPLOADED', user, description, {}, connection, 'result_uploaded_at = NOW(3)')
      await changeStatus(task.application_id, application.status, 'PENDING_VERIFICATION', 'FULFILLMENT_SUBMITTED', user, null, { taskId: id }, connection)
      await connection.execute('INSERT INTO fulfillment_submissions (task_id, application_id, salesman_user_id, submitted_by_user_id, identity_verified, result_status, result_description, voucher_remark) VALUES (?, ?, ?, ?, 1, ?, ?, ?)', [id, task.application_id, user.id, user.id, resultStatus, description, description])
    } else if (action === 'abnormal-close') {
      const reason = String(body.reason || '').trim()
      if (!reason) throw Object.assign(new Error('异常结束必须填写原因'), { status: 400 })
      if (['COMPLETED', 'PENDING_VERIFICATION', 'CANCELLED', 'ABNORMAL_CLOSED'].includes(task.status)) throw Object.assign(new Error('当前任务不能异常结束'), { status: 409 })
      await changeTaskStatus(id, task.status, 'ABNORMAL_CLOSED', 'TASK_ABNORMAL_CLOSED', user, reason, {}, connection, 'fail_reason = ' + connection.escape(reason) + ', completed_at = NOW(3)')
      if (['ASSIGNED', 'PROCESSING'].includes(application.status)) await changeStatus(task.application_id, application.status, 'SERVICE_FAILED', 'TASK_ABNORMAL_CLOSED', user, reason, { taskId: id }, connection)
      await connection.execute('UPDATE applications SET service_failure_reason = ? WHERE id = ?', [reason, task.application_id])
    } else throw Object.assign(new Error('未知业务员任务操作'), { status: 404 })
    await connection.commit()
    json(res, 200, { ok: true })
  } catch (cause) {
    await connection.rollback()
    throw cause
  } finally { connection.release() }
}
async function submitScreening(req, res) {
  const user = await sessionFor(req, 'client')
  const body = await readBody(req)
  const inviteCode = String(body.source && body.source.inviteCode || '').trim()
  if (!inviteCode) throw Object.assign(new Error('请扫描商家提供的二维码后再提交申请'), { status: 400 })
  const [[invite]] = await db.execute(
    `SELECT mi.id, mi.merchant_id, mi.source_type
       FROM client_entry_sources ces JOIN merchant_invites mi ON mi.id = ces.merchant_invite_id
      WHERE ces.user_id = ? AND mi.invite_code = ? AND ces.updated_at > DATE_SUB(NOW(3), INTERVAL 2 HOUR)
        AND mi.source_type = 'merchant_qr' AND mi.status = 'ACTIVE'
        AND (mi.expires_at IS NULL OR mi.expires_at > NOW(3))`,
    [user.id, inviteCode]
  )
  if (!invite) throw Object.assign(new Error('扫码状态已失效，请重新扫描商家二维码'), { status: 400 })
  const [[activeApplication]] = await db.execute(`SELECT id FROM applications WHERE client_user_id = ? AND status IN (${Array.from(blockingStatuses).map(() => '?').join(',')}) LIMIT 1`, [user.id, ...blockingStatuses])
  if (activeApplication) throw Object.assign(new Error('已有进行中的申请，请先查看或撤回原申请'), { status: 409 })
  const applicationPhone = String(body.phone || '').replace(/\s/g, '')
  if (!validPhone(applicationPhone)) throw Object.assign(new Error('请输入正确的申请手机号'), { status: 400 })
  const attribution = await findPhoneAttribution(applicationPhone)
  const commitments = Array.isArray(body.commitments) ? body.commitments : []
  const localNumber = typeof attribution.isLocal === 'boolean' ? attribution.isLocal : (typeof body.localNumber === 'boolean' ? body.localNumber : null)
  const acceptLocalCard = typeof body.acceptLocalCard === 'boolean' ? body.acceptLocalCard : null
  const localOption = localNumber === true ? 'LOCAL_NUMBER' : (acceptLocalCard === true ? 'ACCEPT_LOCAL_CARD' : null)
  const reasons = []
  if (localNumber === null) reasons.push('请选择当前手机号是否为本地号码')
  else if (localNumber === false && acceptLocalCard === null) reasons.push('请选择是否接受新开卡')
  else if (localNumber === false && acceptLocalCard !== true) reasons.push('当前不接受新开卡，暂不满足办理条件')
  if (!expenseTiers.has(body.expenseTier)) reasons.push('请选择个人（全家）套餐档位')
  if (commitments.length !== 3 || !commitments.every(Boolean)) reasons.push('请确认三年内不销户、不转网、不降套餐')
  const passed = reasons.length === 0
  const status = passed ? 'PENDING' : 'PRE_SCREEN_REJECTED'
  const id = crypto.randomUUID()
  await db.execute(
    `INSERT INTO applications (id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot, attribution_status, attribution_province, attribution_city, local_option, is_local_number, accept_local_card, expense_tier, commitments, pre_screen_passed, pre_screen_status, rule_version, status, screening_submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'screening-v4', ?, NOW(3))`,
    [id, user.id, invite.merchant_id, invite.id, invite.source_type, applicationPhone, attribution.queryStatus, attribution.province || null, attribution.city || null, localOption, localNumber, acceptLocalCard, body.expenseTier || null, JSON.stringify(commitments), passed ? 1 : 0, status, status]
  )
  await db.execute('INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role) VALUES (?, ?, ?, ?, ?)', [id, status, 'PRE_SCREEN_SUBMITTED', user.id, 'client'])
  await db.execute('DELETE FROM client_entry_sources WHERE user_id = ?', [user.id])
  json(res, 201, { id, status, passed, reasons })
}
async function listMyApplications(req, res) {
  const user = await sessionFor(req, 'client')
  const [rows] = await db.execute('SELECT id, status, appointment_time, refund_status, updated_at FROM applications WHERE client_user_id = ? ORDER BY updated_at DESC', [user.id])
  json(res, 200, { applications: rows.map(applicationView) })
}
async function clientEntrySource(req, res) {
  const user = await sessionFor(req, 'client')
  await db.execute('DELETE FROM client_entry_sources WHERE user_id = ? AND updated_at <= DATE_SUB(NOW(3), INTERVAL 2 HOUR)', [user.id])
  if (req.method === 'POST') {
    const body = await readBody(req)
    const inviteCode = String(body.inviteCode || '').trim()
    const [[invite]] = await db.execute(
      "SELECT id FROM merchant_invites WHERE invite_code = ? AND source_type = 'merchant_qr' AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW(3))",
      [inviteCode]
    )
    if (!invite) throw Object.assign(new Error('商家二维码无效、已停用或已过期，请重新扫码'), { status: 400 })
    await db.execute(
      'INSERT INTO client_entry_sources (user_id, merchant_invite_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE merchant_invite_id = VALUES(merchant_invite_id), updated_at = NOW(3)',
      [user.id, invite.id]
    )
  }
  const [[source]] = await db.execute(
    `SELECT mi.invite_code AS inviteCode, mi.source_type AS sourceType, ces.updated_at AS receivedAt,
            DATE_ADD(ces.updated_at, INTERVAL 2 HOUR) AS expiresAt
       FROM client_entry_sources ces JOIN merchant_invites mi ON mi.id = ces.merchant_invite_id
      WHERE ces.user_id = ? AND ces.updated_at > DATE_SUB(NOW(3), INTERVAL 2 HOUR)
        AND mi.status = 'ACTIVE' AND (mi.expires_at IS NULL OR mi.expires_at > NOW(3))`,
    [user.id]
  )
  json(res, 200, { source: source || null })
}
async function getMyApplication(req, res, id) {
  const user = await sessionFor(req, 'client')
  const [[row]] = await db.execute(
    `SELECT a.*, m.name AS merchant_name, m.contact_name AS merchant_contact_name,
            m.contact_phone AS merchant_contact_phone
       FROM applications a LEFT JOIN merchants m ON m.id = a.merchant_id
      WHERE a.id = ? AND a.client_user_id = ?`,
    [id, user.id]
  )
  if (!row) throw Object.assign(new Error('申请不存在'), { status: 404 })
  json(res, 200, { application: clientApplicationDetail(row) })
}
async function withdrawMyApplication(req, res, id) {
  const user = await sessionFor(req, 'client')
  const [[row]] = await db.execute('SELECT status FROM applications WHERE id = ? AND client_user_id = ?', [id, user.id])
  if (!row) throw Object.assign(new Error('申请不存在'), { status: 404 })
  if (!withdrawableStatuses.has(row.status)) throw Object.assign(new Error('申请当前阶段不可撤回'), { status: 409 })
  await changeStatus(id, row.status, 'WITHDRAWN', 'APPLICATION_WITHDRAWN', user, '用户主动撤回申请')
  await db.execute('DELETE FROM client_entry_sources WHERE user_id = ?', [user.id])
  json(res, 200, { ok: true })
}
async function merchantDashboard(req, res) {
  const user = await sessionFor(req, 'merchant')
  if (!user.merchant_id) throw Object.assign(new Error('商家账号未绑定门店'), { status: 403 })
  const [[[merchant]], [[applicationStats]], [[billStats]], [recentRows]] = await Promise.all([
    db.execute('SELECT id, name, contact_name, contact_phone FROM merchants WHERE id = ?', [user.merchant_id]),
    db.execute(`SELECT COUNT(*) total,
      SUM(status IN ('PENDING','CONTACTING','VERIFYING','VERIFIED','INVALID_INFO','CORRECTING','CONFIRMED','DISPATCHING','ASSIGNED','PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED')) processing,
      SUM(status = 'COMPLETED') completed
      FROM applications WHERE merchant_id = ? OR assigned_merchant_id = ?`, [user.merchant_id, user.merchant_id]),
    db.execute(`SELECT COALESCE(SUM(commission_amount),0) expected_commission,
      COALESCE(SUM(CASE WHEN status = 'REFUND_POSTED' THEN commission_amount ELSE 0 END),0) settled_commission
      FROM paper_bills WHERE merchant_id = ? AND status <> 'VOIDED'`, [user.merchant_id]),
    db.execute('SELECT * FROM applications WHERE merchant_id = ? OR assigned_merchant_id = ? ORDER BY updated_at DESC LIMIT 5', [user.merchant_id, user.merchant_id])
  ])
  json(res, 200, { merchant, stats: Object.assign({}, applicationStats, billStats), applications: recentRows.map(staffApplicationView) })
}
async function merchantApplications(req, res) {
  const user = await sessionFor(req, 'merchant')
  if (!user.merchant_id) throw Object.assign(new Error('商家账号未绑定门店'), { status: 403 })
  const [rows] = await db.execute('SELECT * FROM applications WHERE merchant_id = ? OR assigned_merchant_id = ? ORDER BY updated_at DESC', [user.merchant_id, user.merchant_id])
  json(res, 200, { applications: rows.map(staffApplicationView) })
}
async function merchantInviteQr(req, res) {
  const user = await sessionFor(req, 'merchant')
  if (!user.merchant_id) throw Object.assign(new Error('商家账号未绑定门店'), { status: 403 })
  const [[merchant]] = await db.execute("SELECT id, name FROM merchants WHERE id = ? AND status = 'ACTIVE'", [user.merchant_id])
  if (!merchant) throw Object.assign(new Error('门店不存在或已停用'), { status: 403 })
  let [[invite]] = await db.execute(
    "SELECT id, invite_code, expires_at FROM merchant_invites WHERE merchant_id = ? AND source_type = 'merchant_qr' AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW(3)) ORDER BY created_at DESC LIMIT 1",
    [user.merchant_id]
  )
  if (!invite) {
    const inviteCode = `merchant-${user.merchant_id}-${crypto.randomBytes(8).toString('hex')}`
    const [result] = await db.execute("INSERT INTO merchant_invites (merchant_id, invite_code, source_type, status) VALUES (?, ?, 'merchant_qr', 'ACTIVE')", [user.merchant_id, inviteCode])
    invite = { id: result.insertId, invite_code: inviteCode, expires_at: null }
  }
  const qr = createQrCode(0, 'M')
  qr.addData(invite.invite_code)
  qr.make()
  const qrDataUrl = qr.createDataURL(8, 16)
  json(res, 200, { merchantName: merchant.name, inviteCode: invite.invite_code, expiresAt: invite.expires_at, qrDataUrl })
}
async function financeDashboard(req, res) {
  await sessionFor(req, 'finance')
  const [[[applicationStats]], [[billStats]], [recentBills]] = await Promise.all([
    db.query(`SELECT COUNT(*) total_applications, SUM(status = 'COMPLETED') completed_applications FROM applications`),
    db.query(`SELECT COUNT(*) total_bills,
      SUM(status = 'PENDING_CONFIRMATION') pending_confirmation,
      COALESCE(SUM(cashback_amount),0) cashback_total,
      COALESCE(SUM(commission_amount),0) commission_total
      FROM paper_bills WHERE status <> 'VOIDED'`),
    db.query(`SELECT b.*, m.name merchant_name FROM paper_bills b LEFT JOIN merchants m ON m.id = b.merchant_id ORDER BY b.updated_at DESC LIMIT 6`)
  ])
  json(res, 200, { stats: Object.assign({}, applicationStats, billStats), bills: recentBills })
}
async function financeBills(req, res) {
  await sessionFor(req, 'finance')
  const [rows] = await db.query(`SELECT b.*, m.name merchant_name, a.phone_snapshot
    FROM paper_bills b JOIN applications a ON a.id = b.application_id
    LEFT JOIN merchants m ON m.id = b.merchant_id ORDER BY b.updated_at DESC`)
  json(res, 200, { bills: rows.map(row => Object.assign({}, row, { maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}` })) })
}
async function bossDashboard(req, res) {
  await sessionFor(req, 'boss')
  const [[[applicationStats]], [[businessStats]], [roleRows], [recentRows]] = await Promise.all([
    db.query(`SELECT COUNT(*) total_applications,
      SUM(status IN ('PENDING','CONTACTING','VERIFYING','VERIFIED','INVALID_INFO','CORRECTING','CONFIRMED','DISPATCHING','ASSIGNED','PROCESSING','PENDING_VERIFICATION','VERIFICATION_RETURNED')) processing,
      SUM(status = 'COMPLETED') completed,
      SUM(status = 'WITHDRAWN') withdrawn FROM applications`),
    db.query(`SELECT (SELECT COUNT(*) FROM merchants WHERE status = 'ACTIVE') active_merchants,
      COALESCE(SUM(cashback_amount),0) cashback_total,
      COALESCE(SUM(commission_amount),0) commission_total FROM paper_bills WHERE status <> 'VOIDED'`),
    db.query(`SELECT role_code, COUNT(*) count FROM user_roles GROUP BY role_code`),
    db.query(`SELECT a.*, m.name merchant_name FROM applications a LEFT JOIN merchants m ON m.id = a.merchant_id ORDER BY a.updated_at DESC LIMIT 6`)
  ])
  const roles = roleRows.reduce((result, row) => { result[row.role_code] = row.count; return result }, {})
  json(res, 200, { stats: Object.assign({}, applicationStats, businessStats), roles, applications: recentRows.map(row => Object.assign(applicationView(row), { merchantName: row.merchant_name || '自然进入' })) })
}

function validateManagedAccount(body, role, editing = false) {
  if (!managedRoles.has(role)) throw Object.assign(new Error('不支持管理该角色'), { status: 400 })
  if (!String(body.displayName || '').trim()) throw Object.assign(new Error(role === 'merchant' ? '请填写商家名称' : '请填写姓名'), { status: 400 })
  if (!validPhone(body.phone)) throw Object.assign(new Error('请输入正确的手机号'), { status: 400 })
  if (!editing && String(body.password || '').length < 6) throw Object.assign(new Error('初始密码不能少于 6 位'), { status: 400 })
  if (body.password && String(body.password).length < 6) throw Object.assign(new Error('新密码不能少于 6 位'), { status: 400 })
  if (role === 'salesman' && !String(body.salesmanCode || '').trim()) throw Object.assign(new Error('请填写业务员工号'), { status: 400 })
  if (role === 'merchant' && !String(body.serviceRegion || '').trim()) throw Object.assign(new Error('请填写网点服务地域'), { status: 400 })
  if (role === 'salesman' && !salesmanTypes.has(String(body.salesmanType || 'HOME_VISIT'))) throw Object.assign(new Error('请选择有效的业务员类型'), { status: 400 })
  if (role === 'salesman' && String(body.salesmanType || 'HOME_VISIT') === 'HOME_VISIT' && !String(body.serviceRegion || '').trim()) throw Object.assign(new Error('请填写外派业务员负责地域'), { status: 400 })
}

async function adminAccounts(req, res, role) {
  await sessionFor(req, 'admin')
  if (!managedRoles.has(role)) throw Object.assign(new Error('不支持管理该角色'), { status: 400 })
  const [rows] = await db.execute(
    `SELECT u.id, u.phone, u.display_name AS displayName, u.account_status AS accountStatus,
            ur.role_code AS role, ur.salesman_code AS salesmanCode, ur.salesman_type AS salesmanType, COALESCE(ur.service_region, m.service_region) AS serviceRegion, ur.merchant_id AS merchantId,
            ur.assigned_merchant_id AS assignedMerchantId, am.name AS assignedMerchantName,
            m.name AS merchantName, m.contact_name AS contactName, m.contact_phone AS contactPhone,
            u.created_at AS createdAt
       FROM user_roles ur JOIN users u ON u.id = ur.user_id
       LEFT JOIN merchants m ON m.id = ur.merchant_id
       LEFT JOIN merchants am ON am.id = ur.assigned_merchant_id
      WHERE ur.role_code = ? ORDER BY u.created_at DESC`, [role]
  )
  json(res, 200, { accounts: rows })
}

async function adminOutlets(req, res) {
  await sessionFor(req, 'admin')
  const [rows] = await db.execute("SELECT id, name FROM merchants WHERE status = 'ACTIVE' ORDER BY name")
  json(res, 200, { outlets: rows })
}

async function createManagedAccount(req, res, role) {
  const admin = await sessionFor(req, 'admin')
  const body = await readBody(req)
  validateManagedAccount(body, role)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const areaId = ['merchant', 'salesman'].includes(role) && String(body.serviceRegion || '').trim()
      ? await resolveDistrictArea(connection, '四川省', '成都市', String(body.serviceRegion).trim()) : null
    if (role === 'salesman') {
      const [[duplicateCode]] = await connection.execute("SELECT user_id FROM user_roles WHERE role_code = 'salesman' AND salesman_code = ? LIMIT 1", [body.salesmanCode.trim()])
      if (duplicateCode) throw Object.assign(new Error('业务员工号已存在'), { status: 409 })
      if (String(body.salesmanType || 'HOME_VISIT') === 'BRANCH') {
        const [[outlet]] = await connection.execute("SELECT id FROM merchants WHERE id = ? AND status = 'ACTIVE'", [Number(body.assignedMerchantId)])
        if (!outlet) throw Object.assign(new Error('网点型业务员必须绑定有效办理网点'), { status: 400 })
      }
    }
    let merchantId = null
    if (role === 'merchant') {
      const [merchantResult] = await connection.execute(
        'INSERT INTO merchants (name, contact_name, contact_phone, service_region, area_id) VALUES (?, ?, ?, ?, ?)',
        [body.displayName.trim(), String(body.contactName || '').trim() || null, String(body.phone).trim(), String(body.serviceRegion).trim(), areaId]
      )
      merchantId = merchantResult.insertId
    }
    const [userResult] = await connection.execute(
      "INSERT INTO users (phone, password_hash, display_name, account_status) VALUES (?, ?, ?, 'ACTIVE')",
      [String(body.phone).trim(), passwordHash(body.password), body.displayName.trim()]
    )
    await connection.execute(
      'INSERT INTO user_roles (user_id, role_code, merchant_id, assigned_merchant_id, salesman_code, salesman_type, service_region, area_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userResult.insertId, role, merchantId, role === 'salesman' && String(body.salesmanType) === 'BRANCH' ? Number(body.assignedMerchantId) : null, role === 'salesman' ? body.salesmanCode.trim() : null, role === 'salesman' ? String(body.salesmanType || 'HOME_VISIT') : null, role === 'salesman' && String(body.salesmanType || 'HOME_VISIT') === 'HOME_VISIT' ? String(body.serviceRegion).trim() : null, role === 'salesman' && String(body.salesmanType || 'HOME_VISIT') === 'HOME_VISIT' ? areaId : null]
    )
    await connection.execute(
      'INSERT INTO audit_logs (actor_user_id, actor_role, action_code, target_type, target_id, after_data) VALUES (?, ?, ?, ?, ?, ?)',
      [admin.id, 'admin', 'ACCOUNT_CREATED', 'user', String(userResult.insertId), JSON.stringify({ role, phone: body.phone, displayName: body.displayName })]
    )
    await connection.commit()
    json(res, 201, { id: userResult.insertId })
  } catch (cause) {
    await connection.rollback()
    if (cause.code === 'ER_DUP_ENTRY') throw Object.assign(new Error('手机号或业务员工号已存在'), { status: 409 })
    throw cause
  } finally { connection.release() }
}

async function updateManagedAccount(req, res, role, id) {
  const admin = await sessionFor(req, 'admin')
  const body = await readBody(req)
  validateManagedAccount(body, role, true)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const areaId = ['merchant', 'salesman'].includes(role) && String(body.serviceRegion || '').trim()
      ? await resolveDistrictArea(connection, '四川省', '成都市', String(body.serviceRegion).trim()) : null
    const [[target]] = await connection.execute('SELECT merchant_id FROM user_roles WHERE user_id = ? AND role_code = ?', [id, role])
    if (!target) throw Object.assign(new Error('账号不存在'), { status: 404 })
    if (role === 'salesman') {
      const [[duplicateCode]] = await connection.execute("SELECT user_id FROM user_roles WHERE role_code = 'salesman' AND salesman_code = ? AND user_id <> ? LIMIT 1", [body.salesmanCode.trim(), id])
      if (duplicateCode) throw Object.assign(new Error('业务员工号已存在'), { status: 409 })
      if (String(body.salesmanType || 'HOME_VISIT') === 'BRANCH') {
        const [[outlet]] = await connection.execute("SELECT id FROM merchants WHERE id = ? AND status = 'ACTIVE'", [Number(body.assignedMerchantId)])
        if (!outlet) throw Object.assign(new Error('网点型业务员必须绑定有效办理网点'), { status: 400 })
      }
    }
    const passwordSql = body.password ? ', password_hash = ?' : ''
    const params = [String(body.phone).trim(), body.displayName.trim()]
    if (body.password) params.push(passwordHash(body.password))
    params.push(id)
    const accountStatus = body.accountStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE'
    const statusSql = ', account_status = ?'
    params.splice(params.length - 1, 0, accountStatus)
    await connection.execute(`UPDATE users SET phone = ?, display_name = ?${passwordSql}${statusSql} WHERE id = ?`, params)
    if (role === 'merchant') {
      await connection.execute('UPDATE merchants SET name = ?, contact_name = ?, contact_phone = ?, service_region = ?, area_id = ?, status = ? WHERE id = ?', [body.displayName.trim(), String(body.contactName || '').trim() || null, String(body.phone).trim(), String(body.serviceRegion).trim(), areaId, accountStatus, target.merchant_id])
    } else if (role === 'salesman') {
      await connection.execute('UPDATE user_roles SET salesman_code = ?, salesman_type = ?, assigned_merchant_id = ?, service_region = ?, area_id = ? WHERE user_id = ? AND role_code = ?', [body.salesmanCode.trim(), String(body.salesmanType || 'HOME_VISIT'), String(body.salesmanType || 'HOME_VISIT') === 'BRANCH' ? Number(body.assignedMerchantId) : null, String(body.salesmanType || 'HOME_VISIT') === 'HOME_VISIT' ? String(body.serviceRegion).trim() : null, String(body.salesmanType || 'HOME_VISIT') === 'HOME_VISIT' ? areaId : null, id, role])
    }
    await connection.execute('INSERT INTO audit_logs (actor_user_id, actor_role, action_code, target_type, target_id, after_data) VALUES (?, ?, ?, ?, ?, ?)', [admin.id, 'admin', 'ACCOUNT_UPDATED', 'user', String(id), JSON.stringify({ role, phone: body.phone, displayName: body.displayName })])
    await connection.commit()
    json(res, 200, { ok: true })
  } catch (cause) {
    await connection.rollback()
    if (cause.code === 'ER_DUP_ENTRY') throw Object.assign(new Error('手机号或业务员工号已存在'), { status: 409 })
    throw cause
  } finally { connection.release() }
}

async function disableManagedAccount(req, res, role, id) {
  const admin = await sessionFor(req, 'admin')
  if (!managedRoles.has(role)) throw Object.assign(new Error('不支持管理该角色'), { status: 400 })
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[target]] = await connection.execute('SELECT merchant_id FROM user_roles WHERE user_id = ? AND role_code = ?', [id, role])
    if (!target) throw Object.assign(new Error('账号不存在'), { status: 404 })
    await connection.execute("UPDATE users SET account_status = 'DISABLED' WHERE id = ?", [id])
    if (role === 'merchant' && target.merchant_id) await connection.execute("UPDATE merchants SET status = 'DISABLED' WHERE id = ?", [target.merchant_id])
    await connection.execute('DELETE FROM auth_sessions WHERE user_id = ?', [id])
    await connection.execute('INSERT INTO audit_logs (actor_user_id, actor_role, action_code, target_type, target_id, after_data) VALUES (?, ?, ?, ?, ?, ?)', [admin.id, 'admin', 'ACCOUNT_DISABLED', 'user', String(id), JSON.stringify({ role })])
    await connection.commit()
    json(res, 200, { ok: true })
  } catch (cause) { await connection.rollback(); throw cause } finally { connection.release() }
}

async function adminOrders(req, res, status) {
  await sessionFor(req, 'admin')
  const params = []
  const where = status ? 'WHERE a.status = ?' : ''
  if (status) params.push(status)
  const [rows] = await db.execute(
    `SELECT a.id, a.phone_snapshot, a.status, a.service_mode, a.verify_result, a.customer_intention,
            a.updated_at, m.name AS source_merchant_name, am.name AS assigned_store_name,
            COALESCE(u.display_name, u.phone) AS handler_name
       FROM applications a
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
       LEFT JOIN users u ON u.id = a.assigned_salesman_user_id
       ${where} ORDER BY a.updated_at DESC`, params)
  json(res, 200, { orders: rows.map(row => ({
    id: row.id, maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    status: row.status, statusText: statusText[row.status] || row.status, serviceMode: row.service_mode,
    verifyResult: row.verify_result, customerIntention: row.customer_intention,
    sourceMerchantName: row.source_merchant_name || '', assignedStoreName: row.assigned_store_name || '',
    handlerName: row.handler_name || '', updatedAt: row.updated_at
  })) })
}

async function adminOrderDetail(req, res, id) {
  await sessionFor(req, 'admin')
  const [[row]] = await db.execute(
    `SELECT a.*, m.name AS source_merchant_name, am.name AS assigned_store_name,
            COALESCE(u.display_name, u.phone) AS handler_name
       FROM applications a
       LEFT JOIN merchants m ON m.id = a.merchant_id
       LEFT JOIN merchants am ON am.id = a.assigned_merchant_id
       LEFT JOIN users u ON u.id = a.assigned_salesman_user_id
      WHERE a.id = ?`, [id])
  if (!row) throw Object.assign(new Error('订单不存在'), { status: 404 })
  const [history] = await db.execute(
    `SELECT h.id, h.from_status, h.to_status, h.action_code, h.reason, h.operator_role, h.metadata, h.created_at,
            COALESCE(u.display_name, u.phone, u.login_name, '系统') AS operator_name
       FROM application_status_history h LEFT JOIN users u ON u.id = h.operator_user_id
      WHERE h.application_id = ? ORDER BY h.created_at ASC, h.id ASC`, [id])
  json(res, 200, { order: {
    id: row.id, phone: row.phone_snapshot, status: row.status, statusText: statusText[row.status] || row.status,
    serviceMode: row.service_mode, verifyResult: row.verify_result, customerIntention: row.customer_intention,
    verificationRemark: row.verification_remark || '', correctedInfo: row.corrected_info,
    sourceMerchantName: row.source_merchant_name || '', assignedStoreName: row.assigned_store_name || '',
    handlerName: row.handler_name || '', createdAt: row.created_at, updatedAt: row.updated_at,
    history: history.map(item => ({ id: item.id, fromStatus: item.from_status, fromStatusText: statusText[item.from_status] || item.from_status || '无', toStatus: item.to_status, toStatusText: statusText[item.to_status] || item.to_status, actionCode: item.action_code, reason: item.reason || '', operatorRole: item.operator_role || 'system', operatorName: item.operator_name, metadata: item.metadata, createdAt: item.created_at }))
  } })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (req.method === 'GET' && url.pathname === '/health') {
      await db.query('SELECT 1'); return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/v1/auth/login') {
      const body = await readBody(req); return json(res, 200, await authenticate(body.account, body.password))
    }
    if (req.method === 'POST' && url.pathname === '/v1/auth/register') {
      const body = await readBody(req); return json(res, 201, await registerClient(body))
    }
    if (req.method === 'GET' && url.pathname === '/v1/phone-attribution') {
      await sessionFor(req, 'client')
      return json(res, 200, await findPhoneAttribution(url.searchParams.get('phone')))
    }
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/v1/client/entry-source') return await clientEntrySource(req, res)
    if (req.method === 'POST' && url.pathname === '/v1/applications/pre-screen') return await submitScreening(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/applications/me') return await listMyApplications(req, res)
    const clientApplicationMatch = url.pathname.match(/^\/v1\/applications\/([\w-]+)(?:\/(withdraw))?$/)
    if (req.method === 'GET' && clientApplicationMatch && !clientApplicationMatch[2]) return await getMyApplication(req, res, clientApplicationMatch[1])
    if (req.method === 'POST' && clientApplicationMatch && clientApplicationMatch[2] === 'withdraw') return await withdrawMyApplication(req, res, clientApplicationMatch[1])
    if (req.method === 'GET' && url.pathname === '/v1/merchant/dashboard') return await merchantDashboard(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/merchant/applications') return await merchantApplications(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/merchant/invite-qr') return await merchantInviteQr(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/finance/dashboard') return await financeDashboard(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/finance/bills') return await financeBills(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/boss/dashboard') return await bossDashboard(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/admin/accounts') return await adminAccounts(req, res, url.searchParams.get('role'))
    if (req.method === 'GET' && url.pathname === '/v1/admin/outlets') return await adminOutlets(req, res)
    if (req.method === 'POST' && url.pathname === '/v1/admin/accounts') return await createManagedAccount(req, res, url.searchParams.get('role'))
    const adminAccountMatch = url.pathname.match(/^\/v1\/admin\/accounts\/(merchant|salesman|customer-service)\/(\d+)$/)
    if (req.method === 'PUT' && adminAccountMatch) return await updateManagedAccount(req, res, adminAccountMatch[1], adminAccountMatch[2])
    if (req.method === 'DELETE' && adminAccountMatch) return await disableManagedAccount(req, res, adminAccountMatch[1], adminAccountMatch[2])
    if (req.method === 'GET' && url.pathname === '/v1/admin/orders') return await adminOrders(req, res, url.searchParams.get('status'))
    const adminOrderMatch = url.pathname.match(/^\/v1\/admin\/orders\/([\w-]+)$/)
    if (req.method === 'GET' && adminOrderMatch) return await adminOrderDetail(req, res, adminOrderMatch[1])
    if (req.method === 'GET' && url.pathname === '/v1/customer/applications') return await customerApplications(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/customer/work-items') return await customerWorkItems(req, res)
    const customerWorkItemMatch = url.pathname.match(/^\/v1\/customer\/work-items\/([\w-]+)$/)
    if (req.method === 'GET' && customerWorkItemMatch) return await customerWorkItemDetail(req, res, customerWorkItemMatch[1])
    if (req.method === 'GET' && url.pathname === '/v1/customer/salesmen') return await customerSalesmen(req, res)
    if (req.method === 'GET' && url.pathname === '/v1/customer/outlets') return await customerOutlets(req, res)
    const dispatchCandidatesMatch = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)\/dispatch-candidates$/)
    if (req.method === 'GET' && dispatchCandidatesMatch) return await regionalDispatchCandidates(req, res, dispatchCandidatesMatch[1])
    if (req.method === 'GET' && url.pathname === '/v1/customer/verifications') return await customerVerifications(req, res, url.searchParams.get('category'))
    const customerVerificationMatch = url.pathname.match(/^\/v1\/customer\/verifications\/([\w-]+)$/)
    if (req.method === 'GET' && customerVerificationMatch) return await customerVerificationDetail(req, res, customerVerificationMatch[1])
    const customerDetailMatch = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)$/)
    if (req.method === 'GET' && customerDetailMatch) return await customerApplicationDetail(req, res, customerDetailMatch[1])
    const customerMatch = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)\/(start-contact|contact-result|verify-info|intention|correct-info|service-type|review|retry-contact|service-mode|confirm-appointment|dispatch|assign-store|start-store|submit-store|service-fail|verify)$/)
    if (req.method === 'POST' && customerMatch) return await customerAction(req, res, customerMatch[1], customerMatch[2])
    if (req.method === 'GET' && url.pathname === '/v1/salesman/applications') return await salesmanApplications(req, res)
    const salesmanMatch = url.pathname.match(/^\/v1\/salesman\/applications\/([\w-]+)\/(start|submit|fail)$/)
    if (req.method === 'POST' && salesmanMatch) return await salesmanAction(req, res, salesmanMatch[1], salesmanMatch[2])
    if (req.method === 'GET' && url.pathname === '/v1/salesman/tasks') return await salesmanTasks(req, res, url.searchParams.get('category'))
    const salesmanTaskDetailMatch = url.pathname.match(/^\/v1\/salesman\/tasks\/([\w-]+)$/)
    if (req.method === 'GET' && salesmanTaskDetailMatch) return await salesmanTaskDetail(req, res, salesmanTaskDetailMatch[1])
    const salesmanTaskActionMatch = url.pathname.match(/^\/v1\/salesman\/tasks\/([\w-]+)\/(accept|contact|appointment|arrive|start|finish-processing|result|abnormal-close)$/)
    if (req.method === 'POST' && salesmanTaskActionMatch) return await salesmanTaskAction(req, res, salesmanTaskActionMatch[1], salesmanTaskActionMatch[2])
    return error(res, 404, '接口不存在')
  } catch (cause) {
    console.error(cause)
    return error(res, cause.status || 500, cause.message || '服务异常')
  }
})

server.listen(config.port, config.host, () => console.log(`API listening on http://${config.host}:${config.port}`))
