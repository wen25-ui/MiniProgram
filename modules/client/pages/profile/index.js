const { getSession, clearSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : ''
}

Page({
  data: { phone: '', maskedPhone: '' },
  onShow() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    this.setData({ phone: session.phone, maskedPhone: maskPhone(session.phone) })
  },
  showPending(event) {
    wx.showToast({ title: `${event.currentTarget.dataset.name}功能待接入`, icon: 'none' })
  },
  logout() {
    wx.showModal({
      title: '确认退出登录？',
      content: '退出后需要重新输入账号和密码。',
      confirmText: '退出登录',
      confirmColor: '#d14343',
      success: result => {
        if (!result.confirm) return
        clearSession()
        wx.reLaunch({ url: '/pages/auth/login/index' })
      }
    })
  }
})
