const crypto = require('crypto')
const http = require('http')
const { URL } = require('url')
const createQrCode = require('qrcode-generator')
const db = require('./db')
const config = require('./config')

const roles = new Set(['client', 'merchant', 'salesman', 'customer-service', 'finance', 'boss', 'admin'])
const managedRoles = new Set(['merchant', 'salesman', 'customer-service'])
const expenseTiers = new Set(['UNDER_79', 'FROM_79', 'FROM_150', 'FROM_250', 'FROM_400'])
const withdrawableStatuses = new Set(['PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_STORE_SERVICE'])
const blockingStatuses = new Set(['PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED'])
const statusText = {
  PRE_SCREEN_REJECTED: '预审待补充', PENDING_REVIEW: '待客服复审', REVIEW_REJECTED: '审核未通过',
  PENDING_CONTACT: '待联系确认', PENDING_APPOINTMENT: '待确认上门时间', PENDING_DISPATCH: '预约已确认',
  CONTACT_FAILED: '暂未联系成功', CLIENT_DECLINED: '客户已放弃', PENDING_SERVICE_MODE: '待确认办理方式',
  PENDING_SERVICE: '待上门办理', IN_SERVICE: '办理中', PENDING_VERIFICATION: '待核销',
  PENDING_STORE_SERVICE: '待营业厅办理', IN_STORE_SERVICE: '营业厅办理中', SERVICE_FAILED: '办理失败',
  VERIFICATION_RETURNED: '核销资料待补充', SERVICE_COMPLETED: '服务完成', WITHDRAWN: '已撤回', CLOSED: '已结束'
}
const statusDescription = {
  PRE_SCREEN_REJECTED: '申请资料暂未满足资格要求。', PENDING_REVIEW: '申请已提交，正在等待客服复审。',
  REVIEW_REJECTED: '人工复审未通过，可查看详情后撤回申请。', PENDING_CONTACT: '客服将联系您确认办理信息。',
  CONTACT_FAILED: '本次暂未联系成功，客服稍后可再次联系。', CLIENT_DECLINED: '您已放弃本次办理，可重新提交申请。', PENDING_SERVICE_MODE: '请与客服确认上门或营业厅办理。',
  PENDING_APPOINTMENT: '正在确认上门办理时间。', PENDING_DISPATCH: '预约已确认，正在安排业务员。',
  PENDING_SERVICE: '业务员已接到任务，请等待上门。', IN_SERVICE: '业务员正在办理业务。',
  PENDING_STORE_SERVICE: '请按约定前往营业厅办理。', IN_STORE_SERVICE: '营业厅正在办理业务。', SERVICE_FAILED: '本次业务办理失败，可查看失败原因。',
  PENDING_VERIFICATION: '办理资料正在等待客服核销。', VERIFICATION_RETURNED: '办理资料已退回业务员补充。',
  SERVICE_COMPLETED: '业务办理已完成。', WITHDRAWN: '申请已撤回，可重新提交。', CLOSED: '该申请已结束。'
}
const expenseTierText = { UNDER_79: '低于 79 元', FROM_79: '79 元以上', FROM_150: '150 元以上', FROM_250: '250 元以上', FROM_400: '400 元以上' }

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
function error(res, code, message) { json(res, code, { error: message }) }
function validPhone(phone) { return /^1\d{10}$/.test(String(phone || '').replace(/\s/g, '')) }
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
  await executor.execute(
    'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? DAY))',
    [id, userId, tokenHash(token), config.sessionTtlDays]
  )
  return token
}
async function sessionFor(req, expectedRole) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw Object.assign(new Error('请先登录'), { status: 401 })
  const [rows] = await db.execute(
    `SELECT u.id, u.phone, u.login_name, u.display_name, GROUP_CONCAT(ur.role_code) AS roles, MAX(ur.salesman_code) AS salesman_code, MAX(ur.merchant_id) AS merchant_id
       FROM auth_sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > NOW(3) AND u.account_status = 'ACTIVE'
      GROUP BY u.id`, [tokenHash(token)]
  )
  if (!rows.length) throw Object.assign(new Error('登录已过期'), { status: 401 })
  const user = rows[0]
  user.roles = user.roles ? user.roles.split(',') : []
  if (expectedRole && !user.roles.includes(expectedRole)) throw Object.assign(new Error('无权访问该资源'), { status: 403 })
  await db.execute('UPDATE auth_sessions SET last_used_at = NOW(3) WHERE token_hash = ?', [tokenHash(token)])
  return user
}
async function authenticate(account, password) {
  const normalized = String(account || '').replace(/\s/g, '')
  if (!normalized || !password) throw Object.assign(new Error('请输入账号和密码'), { status: 400 })
  const [[user]] = await db.execute('SELECT id, phone, login_name, password_hash FROM users WHERE (phone = ? OR login_name = ?) AND account_status = \'ACTIVE\'', [normalized, normalized])
  if (!user || !user.password_hash || user.password_hash !== passwordHash(password)) {
    throw Object.assign(new Error('账号或密码错误'), { status: 401 })
  }
  const [roleRows] = await db.execute('SELECT role_code, salesman_code FROM user_roles WHERE user_id = ?', [user.id])
  if (!roleRows.length) throw Object.assign(new Error('该账号尚未分配身份'), { status: 403 })
  const token = await createSession(user.id)
  return { token, user: { id: user.id, phone: user.phone || user.login_name, roles: roleRows.map(row => row.role_code), defaultRole: roleRows[0].role_code, salesmanId: (roleRows.find(row => row.role_code === 'salesman') || {}).salesman_code || '' } }
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
    expenseTierText: expenseTierText[row.expense_tier] || '未填写',
    commitments: parseCommitments(row.commitments),
    ruleVersion: row.rule_version,
    submittedAt: row.screening_submitted_at
  })
}
function staffApplicationView(row) {
  return Object.assign(applicationView(row), {
    maskedPhone: `${row.phone_snapshot.slice(0, 3)}****${row.phone_snapshot.slice(-4)}`,
    localOption: row.local_option,
    localNumber: row.is_local_number === null ? null : Boolean(row.is_local_number),
    acceptLocalCard: row.accept_local_card === null ? null : Boolean(row.accept_local_card),
    expenseTier: row.expense_tier,
    fulfillment: row.voucher_remark ? { voucherRemark: row.voucher_remark } : null,
    verification: row.verification_reason ? { reason: row.verification_reason } : null
  })
}
async function changeStatus(id, from, to, action, operator, reason, extra = {}) {
  const [result] = await db.execute('UPDATE applications SET status = ?, updated_at = NOW(3) WHERE id = ? AND status = ?', [to, id, from])
  if (!result.affectedRows) throw Object.assign(new Error('申请当前状态不允许该操作'), { status: 409 })
  await db.execute(
    'INSERT INTO application_status_history (application_id, from_status, to_status, action_code, reason, operator_user_id, operator_role, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, from, to, action, reason || null, operator.id, operator.roles[0] || null, JSON.stringify(extra)]
  )
}
async function customerApplications(req, res) {
  await sessionFor(req, 'customer-service')
  const [rows] = await db.query(
    `SELECT a.*, f.voucher_remark, f.verification_reason
       FROM applications a
       LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE a.status IN ('PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED')
      ORDER BY a.updated_at ASC`
  )
  json(res, 200, { applications: rows.map(staffApplicationView) })
}
async function customerAction(req, res, id, action) {
  const user = await sessionFor(req, 'customer-service')
  const body = await readBody(req)
  if (action === 'review') {
    const approve = body.decision === 'APPROVE'
    if (!approve && !String(body.reason || '').trim()) throw Object.assign(new Error('驳回时请填写原因'), { status: 400 })
    await changeStatus(id, 'PENDING_REVIEW', approve ? 'PENDING_CONTACT' : 'REVIEW_REJECTED', approve ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED', user, body.reason)
    await db.execute('INSERT INTO application_reviews (application_id, reviewer_user_id, decision, reason) VALUES (?, ?, ?, ?)', [id, user.id, approve ? 'APPROVE' : 'REJECT', body.reason || null])
  } else if (action === 'contact-result') {
    const result = String(body.result || '')
    const target = { CONTACTED: 'PENDING_SERVICE_MODE', UNREACHABLE: 'CONTACT_FAILED', CLIENT_DECLINED: 'CLIENT_DECLINED' }[result]
    if (!target) throw Object.assign(new Error('请选择有效的联系结果'), { status: 400 })
    if (result !== 'CONTACTED' && !String(body.reason || '').trim()) throw Object.assign(new Error('请填写联系结果说明'), { status: 400 })
    await changeStatus(id, 'PENDING_CONTACT', target, `CONTACT_${result}`, user, body.reason)
    await db.execute('UPDATE applications SET contact_result = ?, contact_reason = ? WHERE id = ?', [result, body.reason || null, id])
    await db.execute('INSERT INTO application_contact_records (application_id, operator_user_id, result, remark) VALUES (?, ?, ?, ?)', [id, user.id, result, body.reason || null])
  } else if (action === 'retry-contact') {
    await changeStatus(id, 'CONTACT_FAILED', 'PENDING_CONTACT', 'CONTACT_RETRY', user)
  } else if (action === 'service-mode') {
    const mode = String(body.serviceMode || '')
    const target = { HOME_SERVICE: 'PENDING_APPOINTMENT', STORE_SERVICE: 'PENDING_STORE_SERVICE' }[mode]
    if (!target) throw Object.assign(new Error('请选择上门办理或营业厅办理'), { status: 400 })
    await changeStatus(id, 'PENDING_SERVICE_MODE', target, 'SERVICE_MODE_CONFIRMED', user, null, { serviceMode: mode })
    await db.execute('UPDATE applications SET service_mode = ? WHERE id = ?', [mode, id])
  } else if (action === 'confirm-appointment') {
    if (!String(body.appointmentTime || '').trim()) throw Object.assign(new Error('请填写已确认的上门时间'), { status: 400 })
    await changeStatus(id, 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'APPOINTMENT_CONFIRMED', user, null, { appointmentTime: body.appointmentTime })
    await db.execute('UPDATE applications SET appointment_time = ? WHERE id = ?', [body.appointmentTime, id])
    await db.execute('INSERT INTO application_appointments (application_id, appointment_time, confirmed_by_user_id) VALUES (?, ?, ?)', [id, body.appointmentTime, user.id])
  } else if (action === 'dispatch') {
    const [[salesman]] = await db.execute("SELECT u.id, u.display_name FROM users u JOIN user_roles r ON r.user_id = u.id WHERE r.role_code = 'salesman' AND r.salesman_code = ?", [body.salesmanId])
    if (!salesman) throw Object.assign(new Error('请选择有效的业务员'), { status: 400 })
    await changeStatus(id, 'PENDING_DISPATCH', 'PENDING_SERVICE', 'DISPATCHED', user, null, { salesmanId: body.salesmanId })
    await db.execute('UPDATE applications SET assigned_salesman_user_id = ? WHERE id = ?', [salesman.id, id])
    await db.execute('INSERT INTO application_dispatches (application_id, salesman_user_id, dispatcher_user_id) VALUES (?, ?, ?)', [id, salesman.id, user.id])
  } else if (action === 'start-store') {
    await changeStatus(id, 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'STORE_SERVICE_STARTED', user)
  } else if (action === 'submit-store') {
    if (!String(body.voucherRemark || '').trim()) throw Object.assign(new Error('请填写营业厅办理结果与凭证说明'), { status: 400 })
    const [[current]] = await db.execute('SELECT status, service_mode FROM applications WHERE id = ?', [id])
    if (!current || current.service_mode !== 'STORE_SERVICE' || !['IN_STORE_SERVICE', 'VERIFICATION_RETURNED'].includes(current.status)) throw Object.assign(new Error('当前申请不能提交营业厅办理凭证'), { status: 409 })
    await changeStatus(id, current.status, 'PENDING_VERIFICATION', 'STORE_FULFILLMENT_SUBMITTED', user)
    await db.execute('INSERT INTO fulfillment_submissions (application_id, submitted_by_user_id, identity_verified, voucher_remark) VALUES (?, ?, 1, ?)', [id, user.id, body.voucherRemark.trim()])
  } else if (action === 'service-fail') {
    if (!String(body.reason || '').trim()) throw Object.assign(new Error('请填写办理失败原因'), { status: 400 })
    const [[current]] = await db.execute('SELECT status FROM applications WHERE id = ?', [id])
    if (!current || current.status !== 'IN_STORE_SERVICE') throw Object.assign(new Error('当前申请不能标记为办理失败'), { status: 409 })
    await changeStatus(id, current.status, 'SERVICE_FAILED', 'STORE_SERVICE_FAILED', user, body.reason)
    await db.execute('UPDATE applications SET service_failure_reason = ? WHERE id = ?', [body.reason.trim(), id])
  } else if (action === 'verify') {
    const approve = body.decision === 'APPROVE'
    if (!approve && !String(body.reason || '').trim()) throw Object.assign(new Error('退回时请填写原因'), { status: 400 })
    await changeStatus(id, 'PENDING_VERIFICATION', approve ? 'SERVICE_COMPLETED' : 'VERIFICATION_RETURNED', approve ? 'FULFILLMENT_VERIFIED' : 'FULFILLMENT_RETURNED', user, body.reason)
    await db.execute('UPDATE fulfillment_submissions SET verification_status = ?, verification_reason = ?, verifier_user_id = ?, verified_at = NOW(3) WHERE application_id = ? ORDER BY submitted_at DESC LIMIT 1', [approve ? 'APPROVED' : 'RETURNED', body.reason || null, user.id, id])
  } else throw Object.assign(new Error('未知客服操作'), { status: 404 })
  json(res, 200, { ok: true })
}
async function salesmanApplications(req, res) {
  const user = await sessionFor(req, 'salesman')
  const [rows] = await db.execute(
    `SELECT a.*, f.voucher_remark, f.verification_reason
       FROM applications a LEFT JOIN fulfillment_submissions f ON f.id = (SELECT id FROM fulfillment_submissions WHERE application_id = a.id ORDER BY submitted_at DESC LIMIT 1)
      WHERE a.assigned_salesman_user_id = ? AND a.status IN ('PENDING_SERVICE', 'IN_SERVICE', 'VERIFICATION_RETURNED', 'PENDING_VERIFICATION')
      ORDER BY a.appointment_time ASC`, [user.id]
  )
  json(res, 200, { applications: rows.map(staffApplicationView) })
}
async function salesmanAction(req, res, id, action) {
  const user = await sessionFor(req, 'salesman')
  const body = await readBody(req)
  const [[application]] = await db.execute('SELECT assigned_salesman_user_id FROM applications WHERE id = ?', [id])
  if (!application || application.assigned_salesman_user_id !== user.id) throw Object.assign(new Error('无权操作该申请'), { status: 403 })
  if (action === 'start') {
    await changeStatus(id, 'PENDING_SERVICE', 'IN_SERVICE', 'SERVICE_STARTED', user)
  } else if (action === 'submit') {
    if (!body.identityVerified) throw Object.assign(new Error('请先确认已完成实名核实'), { status: 400 })
    if (!String(body.voucherRemark || '').trim()) throw Object.assign(new Error('请填写办理凭证说明'), { status: 400 })
    const [[current]] = await db.execute('SELECT status FROM applications WHERE id = ?', [id])
    if (!['IN_SERVICE', 'VERIFICATION_RETURNED'].includes(current.status)) throw Object.assign(new Error('当前申请不能提交凭证'), { status: 409 })
    await changeStatus(id, current.status, 'PENDING_VERIFICATION', 'FULFILLMENT_SUBMITTED', user)
    await db.execute('INSERT INTO fulfillment_submissions (application_id, salesman_user_id, identity_verified, voucher_remark) VALUES (?, ?, 1, ?)', [id, user.id, body.voucherRemark.trim()])
  } else if (action === 'fail') {
    if (!String(body.reason || '').trim()) throw Object.assign(new Error('请填写办理失败原因'), { status: 400 })
    await changeStatus(id, 'IN_SERVICE', 'SERVICE_FAILED', 'HOME_SERVICE_FAILED', user, body.reason)
    await db.execute('UPDATE applications SET service_failure_reason = ? WHERE id = ?', [body.reason.trim(), id])
  } else throw Object.assign(new Error('未知业务员操作'), { status: 404 })
  json(res, 200, { ok: true })
}
async function submitScreening(req, res) {
  const user = await sessionFor(req, 'client')
  const body = await readBody(req)
  const inviteCode = String(body.source && body.source.inviteCode || '').trim()
  if (!inviteCode) throw Object.assign(new Error('请扫描商家提供的二维码后再提交申请'), { status: 400 })
  const [[invite]] = await db.execute(
    "SELECT id, merchant_id, source_type FROM merchant_invites WHERE invite_code = ? AND source_type = 'merchant_qr' AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW(3))",
    [inviteCode]
  )
  if (!invite) throw Object.assign(new Error('商家二维码无效、已停用或已过期，请重新扫码'), { status: 400 })
  const [[activeApplication]] = await db.execute(`SELECT id FROM applications WHERE client_user_id = ? AND status IN (${Array.from(blockingStatuses).map(() => '?').join(',')}) LIMIT 1`, [user.id, ...blockingStatuses])
  if (activeApplication) throw Object.assign(new Error('已有进行中的申请，请先查看或撤回原申请'), { status: 409 })
  const applicationPhone = String(body.phone || '').replace(/\s/g, '')
  if (!validPhone(applicationPhone)) throw Object.assign(new Error('请输入正确的申请手机号'), { status: 400 })
  const commitments = Array.isArray(body.commitments) ? body.commitments : []
  const localNumber = typeof body.localNumber === 'boolean' ? body.localNumber : null
  const acceptLocalCard = typeof body.acceptLocalCard === 'boolean' ? body.acceptLocalCard : null
  const localOption = localNumber === true ? 'LOCAL_NUMBER' : (acceptLocalCard === true ? 'ACCEPT_LOCAL_CARD' : null)
  const reasons = []
  if (localNumber === null) reasons.push('请选择当前手机号是否为本地号码')
  else if (localNumber === false && acceptLocalCard === null) reasons.push('请选择是否接受新开卡')
  else if (localNumber === false && acceptLocalCard !== true) reasons.push('当前不接受新开卡，暂不满足办理条件')
  if (!expenseTiers.has(body.expenseTier)) reasons.push('请选择个人（全家）套餐档位')
  if (commitments.length !== 3 || !commitments.every(Boolean)) reasons.push('请确认三年内不销户、不转网、不降套餐')
  const passed = reasons.length === 0
  const status = passed ? 'PENDING_REVIEW' : 'PRE_SCREEN_REJECTED'
  const id = crypto.randomUUID()
  await db.execute(
    `INSERT INTO applications (id, client_user_id, merchant_id, merchant_invite_id, source_type, phone_snapshot, attribution_status, local_option, is_local_number, accept_local_card, expense_tier, commitments, pre_screen_passed, pre_screen_status, rule_version, status, screening_submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'screening-v3', ?, NOW(3))`,
    [id, user.id, invite.merchant_id, invite.id, invite.source_type, applicationPhone, localNumber ? 'USER_CONFIRMED_LOCAL' : 'USER_CONFIRMED_NON_LOCAL', localOption, localNumber, acceptLocalCard, body.expenseTier || null, JSON.stringify(commitments), passed ? 1 : 0, status, status]
  )
  await db.execute('INSERT INTO application_status_history (application_id, to_status, action_code, operator_user_id, operator_role) VALUES (?, ?, ?, ?, ?)', [id, status, 'PRE_SCREEN_SUBMITTED', user.id, 'client'])
  json(res, 201, { id, status, passed, reasons })
}
async function listMyApplications(req, res) {
  const user = await sessionFor(req, 'client')
  const [rows] = await db.execute('SELECT id, status, appointment_time, refund_status, updated_at FROM applications WHERE client_user_id = ? ORDER BY updated_at DESC', [user.id])
  json(res, 200, { applications: rows.map(applicationView) })
}
async function getMyApplication(req, res, id) {
  const user = await sessionFor(req, 'client')
  const [[row]] = await db.execute('SELECT * FROM applications WHERE id = ? AND client_user_id = ?', [id, user.id])
  if (!row) throw Object.assign(new Error('申请不存在'), { status: 404 })
  json(res, 200, { application: clientApplicationDetail(row) })
}
async function withdrawMyApplication(req, res, id) {
  const user = await sessionFor(req, 'client')
  const [[row]] = await db.execute('SELECT status FROM applications WHERE id = ? AND client_user_id = ?', [id, user.id])
  if (!row) throw Object.assign(new Error('申请不存在'), { status: 404 })
  if (!withdrawableStatuses.has(row.status)) throw Object.assign(new Error('申请当前阶段不可撤回'), { status: 409 })
  await changeStatus(id, row.status, 'WITHDRAWN', 'APPLICATION_WITHDRAWN', user, '用户主动撤回申请')
  json(res, 200, { ok: true })
}
async function merchantDashboard(req, res) {
  const user = await sessionFor(req, 'merchant')
  if (!user.merchant_id) throw Object.assign(new Error('商家账号未绑定门店'), { status: 403 })
  const [[[merchant]], [[applicationStats]], [[billStats]], [recentRows]] = await Promise.all([
    db.execute('SELECT id, name, contact_name, contact_phone FROM merchants WHERE id = ?', [user.merchant_id]),
    db.execute(`SELECT COUNT(*) total,
      SUM(status IN ('PENDING_REVIEW','PENDING_CONTACT','CONTACT_FAILED','PENDING_SERVICE_MODE','PENDING_APPOINTMENT','PENDING_DISPATCH','PENDING_SERVICE','IN_SERVICE','PENDING_STORE_SERVICE','IN_STORE_SERVICE','PENDING_VERIFICATION','VERIFICATION_RETURNED')) processing,
      SUM(status = 'SERVICE_COMPLETED') completed
      FROM applications WHERE merchant_id = ?`, [user.merchant_id]),
    db.execute(`SELECT COALESCE(SUM(commission_amount),0) expected_commission,
      COALESCE(SUM(CASE WHEN status = 'REFUND_POSTED' THEN commission_amount ELSE 0 END),0) settled_commission
      FROM paper_bills WHERE merchant_id = ? AND status <> 'VOIDED'`, [user.merchant_id]),
    db.execute('SELECT * FROM applications WHERE merchant_id = ? ORDER BY updated_at DESC LIMIT 5', [user.merchant_id])
  ])
  json(res, 200, { merchant, stats: Object.assign({}, applicationStats, billStats), applications: recentRows.map(staffApplicationView) })
}
async function merchantApplications(req, res) {
  const user = await sessionFor(req, 'merchant')
  if (!user.merchant_id) throw Object.assign(new Error('商家账号未绑定门店'), { status: 403 })
  const [rows] = await db.execute('SELECT * FROM applications WHERE merchant_id = ? ORDER BY updated_at DESC', [user.merchant_id])
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
    db.query(`SELECT COUNT(*) total_applications, SUM(status = 'SERVICE_COMPLETED') completed_applications FROM applications`),
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
      SUM(status IN ('PENDING_REVIEW','PENDING_CONTACT','CONTACT_FAILED','PENDING_SERVICE_MODE','PENDING_APPOINTMENT','PENDING_DISPATCH','PENDING_SERVICE','IN_SERVICE','PENDING_STORE_SERVICE','IN_STORE_SERVICE','PENDING_VERIFICATION','VERIFICATION_RETURNED')) processing,
      SUM(status = 'SERVICE_COMPLETED') completed,
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
}

async function adminAccounts(req, res, role) {
  await sessionFor(req, 'admin')
  if (!managedRoles.has(role)) throw Object.assign(new Error('不支持管理该角色'), { status: 400 })
  const [rows] = await db.execute(
    `SELECT u.id, u.phone, u.display_name AS displayName, u.account_status AS accountStatus,
            ur.role_code AS role, ur.salesman_code AS salesmanCode, ur.merchant_id AS merchantId,
            m.name AS merchantName, m.contact_name AS contactName, m.contact_phone AS contactPhone,
            u.created_at AS createdAt
       FROM user_roles ur JOIN users u ON u.id = ur.user_id
       LEFT JOIN merchants m ON m.id = ur.merchant_id
      WHERE ur.role_code = ? ORDER BY u.created_at DESC`, [role]
  )
  json(res, 200, { accounts: rows })
}

async function createManagedAccount(req, res, role) {
  const admin = await sessionFor(req, 'admin')
  const body = await readBody(req)
  validateManagedAccount(body, role)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    if (role === 'salesman') {
      const [[duplicateCode]] = await connection.execute("SELECT user_id FROM user_roles WHERE role_code = 'salesman' AND salesman_code = ? LIMIT 1", [body.salesmanCode.trim()])
      if (duplicateCode) throw Object.assign(new Error('业务员工号已存在'), { status: 409 })
    }
    let merchantId = null
    if (role === 'merchant') {
      const [merchantResult] = await connection.execute(
        'INSERT INTO merchants (name, contact_name, contact_phone) VALUES (?, ?, ?)',
        [body.displayName.trim(), String(body.contactName || '').trim() || null, String(body.phone).trim()]
      )
      merchantId = merchantResult.insertId
    }
    const [userResult] = await connection.execute(
      "INSERT INTO users (phone, password_hash, display_name, account_status) VALUES (?, ?, ?, 'ACTIVE')",
      [String(body.phone).trim(), passwordHash(body.password), body.displayName.trim()]
    )
    await connection.execute(
      'INSERT INTO user_roles (user_id, role_code, merchant_id, salesman_code) VALUES (?, ?, ?, ?)',
      [userResult.insertId, role, merchantId, role === 'salesman' ? body.salesmanCode.trim() : null]
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
    const [[target]] = await connection.execute('SELECT merchant_id FROM user_roles WHERE user_id = ? AND role_code = ?', [id, role])
    if (!target) throw Object.assign(new Error('账号不存在'), { status: 404 })
    if (role === 'salesman') {
      const [[duplicateCode]] = await connection.execute("SELECT user_id FROM user_roles WHERE role_code = 'salesman' AND salesman_code = ? AND user_id <> ? LIMIT 1", [body.salesmanCode.trim(), id])
      if (duplicateCode) throw Object.assign(new Error('业务员工号已存在'), { status: 409 })
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
      await connection.execute('UPDATE merchants SET name = ?, contact_name = ?, contact_phone = ?, status = ? WHERE id = ?', [body.displayName.trim(), String(body.contactName || '').trim() || null, String(body.phone).trim(), accountStatus, target.merchant_id])
    } else if (role === 'salesman') {
      await connection.execute('UPDATE user_roles SET salesman_code = ? WHERE user_id = ? AND role_code = ?', [body.salesmanCode.trim(), id, role])
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
    if (req.method === 'POST' && url.pathname === '/v1/admin/accounts') return await createManagedAccount(req, res, url.searchParams.get('role'))
    const adminAccountMatch = url.pathname.match(/^\/v1\/admin\/accounts\/(merchant|salesman|customer-service)\/(\d+)$/)
    if (req.method === 'PUT' && adminAccountMatch) return await updateManagedAccount(req, res, adminAccountMatch[1], adminAccountMatch[2])
    if (req.method === 'DELETE' && adminAccountMatch) return await disableManagedAccount(req, res, adminAccountMatch[1], adminAccountMatch[2])
    if (req.method === 'GET' && url.pathname === '/v1/customer/applications') return await customerApplications(req, res)
    const customerMatch = url.pathname.match(/^\/v1\/customer\/applications\/([\w-]+)\/(review|contact-result|retry-contact|service-mode|confirm-appointment|dispatch|start-store|submit-store|service-fail|verify)$/)
    if (req.method === 'POST' && customerMatch) return await customerAction(req, res, customerMatch[1], customerMatch[2])
    if (req.method === 'GET' && url.pathname === '/v1/salesman/applications') return await salesmanApplications(req, res)
    const salesmanMatch = url.pathname.match(/^\/v1\/salesman\/applications\/([\w-]+)\/(start|submit|fail)$/)
    if (req.method === 'POST' && salesmanMatch) return await salesmanAction(req, res, salesmanMatch[1], salesmanMatch[2])
    return error(res, 404, '接口不存在')
  } catch (cause) {
    console.error(cause)
    return error(res, cause.status || 500, cause.message || '服务异常')
  }
})

server.listen(config.port, config.host, () => console.log(`API listening on http://${config.host}:${config.port}`))
