const { ROLE_HOME_PATHS, isKnownRole } = require('../auth/roles')

function getRoleHomePath(role) {
  return isKnownRole(role) ? ROLE_HOME_PATHS[role] : ''
}

function goToRoleHome(role) {
  const url = getRoleHomePath(role)
  if (!url) throw new Error('未知角色')
  wx.reLaunch({ url })
}

module.exports = {
  getRoleHomePath,
  goToRoleHome
}
