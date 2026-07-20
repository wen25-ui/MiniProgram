const ROLES = Object.freeze({
  CLIENT: 'client',
  MERCHANT: 'merchant',
  SALESMAN: 'salesman',
  CUSTOMER_SERVICE: 'customer-service',
  FINANCE: 'finance',
  BOSS: 'boss',
  ADMIN: 'admin'
})

const ROLE_TEXT = Object.freeze({
  [ROLES.CLIENT]: '用户端',
  [ROLES.MERCHANT]: '商家端',
  [ROLES.SALESMAN]: '业务员端',
  [ROLES.CUSTOMER_SERVICE]: '客服端',
  [ROLES.FINANCE]: '财务端',
  [ROLES.BOSS]: 'BOSS 端',
  [ROLES.ADMIN]: '后台管理端'
})

const ROLE_HOME_PATHS = Object.freeze({
  [ROLES.CLIENT]: '/modules/client/pages/home/index',
  [ROLES.MERCHANT]: '/modules/merchant/pages/home/index',
  [ROLES.SALESMAN]: '/modules/salesman/pages/home/index',
  [ROLES.CUSTOMER_SERVICE]: '/modules/customer-service/pages/home/index',
  [ROLES.FINANCE]: '/modules/finance/pages/home/index',
  [ROLES.BOSS]: '/modules/boss/pages/home/index',
  [ROLES.ADMIN]: '/modules/admin/pages/accounts/index'
})

function isKnownRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_TEXT, role)
}

module.exports = {
  ROLES,
  ROLE_TEXT,
  ROLE_HOME_PATHS,
  isKnownRole
}
