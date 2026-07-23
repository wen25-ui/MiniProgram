const { isKnownRole } = require('./roles')

const SESSION_KEY = 'business_referral_session_v2'
let memorySession = null

function getStorage() {
  if (typeof wx !== 'undefined' && wx.getStorageSync && wx.setStorageSync) {
    return {
      get: () => wx.getStorageSync(SESSION_KEY),
      set: value => wx.setStorageSync(SESSION_KEY, value),
      remove: () => wx.removeStorageSync(SESSION_KEY)
    }
  }

  return {
    get: () => memorySession,
    set: value => { memorySession = value },
    remove: () => { memorySession = null }
  }
}

function normalizeSession(session) {
  if (!session || !session.phone || !Array.isArray(session.roles) || typeof session.token !== 'string' || !session.token) return null
  const roles = session.roles.filter(isKnownRole)
  if (!roles.length) return null

  const normalized = {
    phone: session.phone,
    roles,
    defaultRole: isKnownRole(session.defaultRole) ? session.defaultRole : roles[0],
    authenticatedAt: session.authenticatedAt || ''
  }
  if (typeof session.salesmanId === 'string' && session.salesmanId) normalized.salesmanId = session.salesmanId
  if (Number.isInteger(Number(session.branchId)) && Number(session.branchId) > 0) normalized.branchId = Number(session.branchId)
  if (typeof session.branchName === 'string') normalized.branchName = session.branchName
  normalized.canFieldService = Boolean(session.canFieldService)
  // Legacy only: retained so older cached sessions remain readable.
  if (typeof session.salesmanType === 'string' && session.salesmanType) normalized.salesmanType = session.salesmanType
  normalized.token = session.token
  if (Number.isInteger(session.userId) && session.userId > 0) normalized.userId = session.userId
  return normalized
}

function getSession() {
  return normalizeSession(getStorage().get())
}

function saveSession(session) {
  const normalized = normalizeSession(session)
  if (!normalized) throw new Error('登录会话无效')
  getStorage().set(normalized)
  return normalized
}

function clearSession() {
  getStorage().remove()
}

function hasRole(session, role) {
  return Boolean(session && session.roles && session.roles.indexOf(role) >= 0)
}

module.exports = {
  getSession,
  saveSession,
  clearSession,
  hasRole
}
