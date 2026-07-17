const { ORDER_STATUS } = require('../constants/status')
const storage = require('../services/storage')
const { getDemoContext } = require('./context')
const { nowText, previewOrder } = require('../utils/format')

function respond(data) {
  return new Promise(resolve => {
    setTimeout(() => resolve(data), 180)
  })
}

function getAllOrders() {
  return storage.getOrders()
}

function saveAllOrders(orders) {
  storage.saveOrders(orders)
  return orders
}

function appendTimeline(order, status, text) {
  const time = nowText()
  order.updatedAt = time
  order.timeline = order.timeline || []
  order.timeline.push({ status, text, time })
}

function updateOrder(orderId, updater) {
  const orders = getAllOrders()
  const index = orders.findIndex(item => item.id === orderId)
  if (index === -1) return null
  const order = orders[index]
  updater(order)
  orders[index] = order
  saveAllOrders(orders)
  return previewOrder(order)
}

function makeOrderId() {
  const count = getAllOrders().length + 1
  return 'O' + Date.now().toString().slice(-8) + String(count).padStart(3, '0')
}

function listOrders(filter = {}) {
  let orders = getAllOrders()
  if (filter.merchantId) {
    orders = orders.filter(order => order.merchantId === filter.merchantId)
  }
  if (filter.salesmanId) {
    orders = orders.filter(order => order.salesmanId === filter.salesmanId)
  }
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
    orders = orders.filter(order => statuses.indexOf(order.status) >= 0)
  }
  return respond(orders.map(previewOrder))
}

function getOrder(orderId) {
  const order = getAllOrders().find(item => item.id === orderId)
  return respond(order ? previewOrder(order) : null)
}

function getCurrentClientOrder() {
  const currentId = storage.getCurrentOrderId()
  const orders = getAllOrders()
  const order = orders.find(item => item.id === currentId) || orders[0]
  return respond(order ? previewOrder(order) : null)
}

function submitApplication(payload) {
  const context = getDemoContext()
  const expectedRefund = payload.packageLevel && payload.packageLevel.indexOf('399') >= 0 ? 600 : 500
  const order = {
    id: makeOrderId(),
    merchantId: context.merchant.id,
    merchantName: context.merchant.name,
    customerName: payload.customerName,
    customerPhone: payload.phone,
    address: payload.address,
    appointmentTime: payload.appointmentTime,
    packageLevel: payload.packageLevel,
    localQualified: payload.localQualified,
    longTermAccepted: payload.longTermAccepted,
    status: ORDER_STATUS.WAIT_REVIEW,
    visitMarked: false,
    salesmanId: '',
    salesmanName: '',
    expectedRefund,
    commissionRate: 0.1,
    expectedCommission: Math.round(expectedRefund * 0.1),
    lockedCommission: 0,
    settledCommission: 0,
    refundStatus: '未生成',
    commissionStatus: '预计',
    voucherImage: '',
    rejectReason: '',
    verifyRemark: '',
    createdAt: nowText(),
    updatedAt: nowText(),
    timeline: []
  }
  appendTimeline(order, ORDER_STATUS.WAIT_REVIEW, '客户提交申请，等待公司审核')
  const orders = getAllOrders()
  orders.unshift(order)
  saveAllOrders(orders)
  storage.setCurrentOrderId(order.id)
  return respond(previewOrder(order))
}

function reviewOrder(orderId, approved, reason = '') {
  return respond(updateOrder(orderId, order => {
    order.status = approved ? ORDER_STATUS.WAIT_DISPATCH : ORDER_STATUS.REVIEW_REJECTED
    order.rejectReason = approved ? '' : reason || '资料暂不符合办理要求'
    appendTimeline(
      order,
      order.status,
      approved ? '管理员审核通过，等待派单' : '管理员审核驳回'
    )
  }))
}

function dispatchOrder(orderId, salesmanId) {
  const salesman = getDemoContext().salesmen.find(item => item.id === salesmanId) || getDemoContext().salesman
  return respond(updateOrder(orderId, order => {
    order.status = ORDER_STATUS.WAIT_ACCEPT
    order.salesmanId = salesman.id
    order.salesmanName = salesman.name
    appendTimeline(order, ORDER_STATUS.WAIT_ACCEPT, '管理员已指派给' + salesman.name)
  }))
}

function acceptOrder(orderId) {
  return respond(updateOrder(orderId, order => {
    order.status = ORDER_STATUS.WAIT_VISIT
    appendTimeline(order, ORDER_STATUS.WAIT_VISIT, '业务员已接单')
  }))
}

function markVisited(orderId) {
  return respond(updateOrder(orderId, order => {
    order.visitMarked = true
    appendTimeline(order, ORDER_STATUS.WAIT_VISIT, '业务员已上门')
  }))
}

function markProcessing(orderId) {
  return respond(updateOrder(orderId, order => {
    order.status = ORDER_STATUS.PROCESSING
    appendTimeline(order, ORDER_STATUS.PROCESSING, '业务员标记办理中')
  }))
}

function submitVoucher(orderId, voucherImage) {
  return respond(updateOrder(orderId, order => {
    order.status = ORDER_STATUS.WAIT_VERIFY
    order.voucherImage = voucherImage || '/mock-assets/voucher-placeholder.png'
    appendTimeline(order, ORDER_STATUS.WAIT_VERIFY, '业务员提交凭证，等待公司核销')
  }))
}

function verifyOrder(orderId, approved, remark = '') {
  return respond(updateOrder(orderId, order => {
    if (approved) {
      order.status = ORDER_STATUS.WAIT_REFUND
      order.lockedCommission = order.expectedCommission
      order.refundStatus = '待退费'
      order.commissionStatus = '已锁定'
      appendTimeline(order, ORDER_STATUS.WAIT_REFUND, '公司确认核销，生成客户返费和商家佣金')
    } else {
      order.status = ORDER_STATUS.PROCESSING
      order.verifyRemark = remark || '凭证需补充'
      appendTimeline(order, ORDER_STATUS.PROCESSING, '公司退回凭证修改')
    }
  }))
}

function markRefunded(orderId) {
  return respond(updateOrder(orderId, order => {
    order.status = ORDER_STATUS.REFUNDED
    order.refundStatus = '已退费'
    appendTimeline(order, ORDER_STATUS.REFUNDED, '管理员标记客户已退费')
  }))
}

function settleCommission(orderId) {
  return respond(updateOrder(orderId, order => {
    order.settledCommission = order.lockedCommission || order.expectedCommission
    order.commissionStatus = '已结算'
    appendTimeline(order, order.status, '管理员标记商家佣金已结算')
  }))
}

function getDashboard() {
  const orders = getAllOrders()
  const locked = orders.reduce((sum, order) => sum + Number(order.lockedCommission || 0), 0)
  const settled = orders.reduce((sum, order) => sum + Number(order.settledCommission || 0), 0)
  return respond({
    totalOrders: orders.length,
    waitReview: orders.filter(order => order.status === ORDER_STATUS.WAIT_REVIEW).length,
    waitDispatch: orders.filter(order => order.status === ORDER_STATUS.WAIT_DISPATCH).length,
    waitVerify: orders.filter(order => order.status === ORDER_STATUS.WAIT_VERIFY).length,
    waitRefund: orders.filter(order => order.status === ORDER_STATUS.WAIT_REFUND).length,
    lockedCommission: locked,
    settledCommission: settled
  })
}

function resetDemoData() {
  return respond(storage.resetDemoData().map(previewOrder))
}

module.exports = {
  listOrders,
  getOrder,
  getCurrentClientOrder,
  submitApplication,
  reviewOrder,
  dispatchOrder,
  acceptOrder,
  markVisited,
  markProcessing,
  submitVoucher,
  verifyOrder,
  markRefunded,
  settleCommission,
  getDashboard,
  resetDemoData
}
