const { getSession, hasRole, clearSession } = require('../../core/auth/session')
const { ROLE_TEXT, isKnownRole } = require('../../core/auth/roles')

const ROLE_THEME = {
  merchant: { name: '商家账户', color: '#1677c8', gradient: 'linear-gradient(135deg,#1677c8,#55b9e9)', mark: '商' },
  finance: { name: '财务账户', color: '#3756c7', gradient: 'linear-gradient(135deg,#3756c7,#7186e8)', mark: '财' },
  'customer-service': { name: '客服账户', color: '#0f7f89', gradient: 'linear-gradient(135deg,#0f7f89,#48b9b0)', mark: '服' },
  salesman: { name: '业务员账户', color: '#d06b18', gradient: 'linear-gradient(135deg,#d06b18,#ed9a43)', mark: '业' },
  boss: { name: 'BOSS 账户', color: '#365780', gradient: 'linear-gradient(135deg,#172b4d,#365780)', mark: '总' },
  admin: { name: '管理员账户', color: '#2457c5', gradient: 'linear-gradient(135deg,#142a4a,#315f9b)', mark: '管' }
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : ''
}

Page({
  data: { role: '', roleText: '', phone: '', theme: {} },
  onLoad(options) {
    const session = getSession()
    const role = isKnownRole(options.role) ? options.role : (session && session.defaultRole)
    if (!session || !role || !hasRole(session, role) || role === 'client') {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    const theme = ROLE_THEME[role] || ROLE_THEME.boss
    this.setData({ role, roleText: ROLE_TEXT[role], phone: maskPhone(session.phone), theme })
    wx.setNavigationBarTitle({ title: `${theme.name}管理` })
  },
  showPending(event) {
    wx.showToast({ title: `${event.currentTarget.dataset.name}功能待接入`, icon: 'none' })
  },
  logout() {
    wx.showModal({
      title: '确认退出登录？',
      content: '退出后需要重新输入账号和密码。',
      confirmText: '退出登录', confirmColor: '#d14343',
      success: result => {
        if (!result.confirm) return
        clearSession()
        wx.reLaunch({ url: '/pages/auth/login/index' })
      }
    })
  }
})
