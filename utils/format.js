const { STATUS_TEXT } = require('../constants/status')

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function money(value) {
  const amount = Number(value || 0)
  return '¥' + amount.toFixed(0)
}

function statusText(status) {
  return STATUS_TEXT[status] || status
}

function nowText() {
  const date = new Date()
  const pad = n => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function previewOrder(order) {
  return Object.assign({}, order, {
    maskedPhone: maskPhone(order.customerPhone),
    statusLabel: statusText(order.status),
    expectedRefundText: money(order.expectedRefund),
    expectedCommissionText: money(order.expectedCommission),
    lockedCommissionText: money(order.lockedCommission),
    settledCommissionText: money(order.settledCommission)
  })
}

module.exports = {
  maskPhone,
  money,
  statusText,
  nowText,
  previewOrder
}
