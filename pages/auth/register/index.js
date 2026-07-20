const { validateMainlandMobile } = require('../../../domain/identity/phone')
const { registerClient } = require('../../../services/auth-service')
const { goToRoleHome } = require('../../../core/router/role-router')
const { parseEntryOptions, saveEntrySource } = require('../../../core/router/entry-source')

function createCaptcha() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

Page({
  data: {
    phone: '',
    captcha: '',
    captchaText: createCaptcha(),
    smsCode: '',
    password: '',
    confirmPassword: '',
    message: '',
    submitting: false
  },
  onLoad(options) {
    const source = parseEntryOptions(options)
    if (source.sourceType) saveEntrySource(source)
  },
  onPhoneInput(event) { this.setData({ phone: event.detail.value }) },
  onCaptchaInput(event) { this.setData({ captcha: event.detail.value }) },
  onSmsCodeInput(event) { this.setData({ smsCode: event.detail.value }) },
  onPasswordInput(event) { this.setData({ password: event.detail.value }) },
  onConfirmPasswordInput(event) { this.setData({ confirmPassword: event.detail.value }) },
  refreshCaptcha() {
    this.setData({ captcha: '', captchaText: createCaptcha(), message: '' })
  },
  sendSmsCode() {
    if (!validateMainlandMobile(this.data.phone)) {
      this.setData({ message: '请输入正确的手机号' })
      return
    }
    this.setData({ message: '短信验证暂未启用，可直接设置密码完成注册。' })
  },
  submitRegister() {
    if (this.data.submitting) return
    const { phone, password, confirmPassword } = this.data
    let message = ''
    if (!validateMainlandMobile(phone)) message = '请输入正确的手机号'
    else if (password.length < 6) message = '账号密码不能少于 6 位'
    else if (password !== confirmPassword) message = '两次输入的密码不一致'
    if (message) {
      this.setData({ message })
      return
    }
    this.setData({ submitting: true, message: '' })
    registerClient(phone, password).then(session => {
      wx.showToast({ title: '注册成功', icon: 'success' })
      goToRoleHome(session.defaultRole)
    }).catch(error => this.setData({ submitting: false, message: error.message }))
  }
})
