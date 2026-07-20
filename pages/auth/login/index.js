const { login } = require('../../../services/auth-service')
const { goToRoleHome } = require('../../../core/router/role-router')
const { parseEntryOptions, saveEntrySource } = require('../../../core/router/entry-source')

Page({
  data: {
    account: '', password: '', message: '', submitting: false,
    loginStatus: '正在验证账号信息…', loginProgress: 35
  },
  onLoad(options) {
    const source = parseEntryOptions(options)
    if (source.sourceType) saveEntrySource(source)
  },
  onAccountInput(event) { this.setData({ account: event.detail.value }) },
  onPasswordInput(event) { this.setData({ password: event.detail.value }) },
  preventTouchMove() {},
  scanCode() {
    wx.scanCode({ success: result => this.setData({ message: result.result ? '扫码信息已识别，请继续登录。' : '' }) })
  },
  goRegister() {
    wx.navigateTo({ url: '/pages/auth/register/index' })
  },
  onUnload() {
    if (this.loginTimer) clearTimeout(this.loginTimer)
  },
  submitLogin() {
    if (this.data.submitting) return
    this.setData({
      submitting: true,
      message: '',
      loginStatus: '正在验证账号信息…',
      loginProgress: 35
    })
    login(this.data.account, this.data.password).then(session => {
      this.setData({ loginStatus: '登录成功，正在进入系统…', loginProgress: 100 })
      this.loginTimer = setTimeout(() => {
        this.loginTimer = null
        goToRoleHome(session.defaultRole)
      }, 450)
    }).catch(error => {
      this.setData({ submitting: false, message: error.message, loginProgress: 0 })
    })
  }
})
