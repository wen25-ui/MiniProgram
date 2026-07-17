const { orders: seedOrders } = require('../mock/orders')

const ORDER_KEY = 'business_referral_orders_v1'
const CURRENT_ORDER_KEY = 'business_referral_current_order_id_v1'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getOrders() {
  const cached = wx.getStorageSync(ORDER_KEY)
  if (cached && Array.isArray(cached)) {
    return cached
  }
  const initial = clone(seedOrders)
  wx.setStorageSync(ORDER_KEY, initial)
  return initial
}

function saveOrders(orders) {
  wx.setStorageSync(ORDER_KEY, orders)
  return orders
}

function setCurrentOrderId(orderId) {
  wx.setStorageSync(CURRENT_ORDER_KEY, orderId)
}

function getCurrentOrderId() {
  return wx.getStorageSync(CURRENT_ORDER_KEY)
}

function resetDemoData() {
  wx.removeStorageSync(ORDER_KEY)
  wx.removeStorageSync(CURRENT_ORDER_KEY)
  return getOrders()
}

module.exports = {
  getOrders,
  saveOrders,
  setCurrentOrderId,
  getCurrentOrderId,
  resetDemoData
}
