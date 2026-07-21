const { getSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')
const { getEntrySource, parseScannedEntry, saveEntrySource } = require('../../../../core/router/entry-source')
const { fetchEntrySource, bindEntrySource } = require('../../../../services/entry-source-service')

const BLOCKING_STATUSES = new Set(['PENDING_REVIEW', 'PENDING_CONTACT', 'CONTACT_FAILED', 'PENDING_SERVICE_MODE', 'PENDING_APPOINTMENT', 'PENDING_DISPATCH', 'PENDING_SERVICE', 'IN_SERVICE', 'PENDING_STORE_SERVICE', 'IN_STORE_SERVICE', 'PENDING_VERIFICATION', 'VERIFICATION_RETURNED'])

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : ''
}

Page({
  data: {
    maskedPhone: '', screening: null, applicationId: '', hasMerchantInvite: false,
    summary: '请扫描商家提供的专属二维码，扫码后方可填写办理资料。',
    statusText: '等待扫码'
  },
  onShow() {
    const session = getSession()
    if (!session || session.defaultRole !== ROLES.CLIENT) {
      wx.reLaunch({ url: '/pages/auth/register/index' })
      return
    }
    const source = getEntrySource(session.userId)
    this.setData({ maskedPhone: maskPhone(session.phone), hasMerchantInvite: Boolean(source && source.inviteCode) })
    fetchEntrySource().then(result => {
      const syncedSource = result.source || null
      this.scheduleEntryExpiry(syncedSource)
      const hasMerchantInvite = Boolean(syncedSource && syncedSource.inviteCode)
      const state = { hasMerchantInvite }
      if (!this.data.screening) {
        state.statusText = hasMerchantInvite ? '已扫码' : '等待扫码'
        state.summary = hasMerchantInvite
          ? '已识别商家二维码，可以继续填写本次办理资料。'
          : '请扫描商家提供的专属二维码，扫码后方可填写办理资料。'
      }
      this.setData(state)
    }).catch(error => this.setData({ summary: error.message }))
    request('/v1/applications/me', { session }).then(response => {
      const applications = response.applications || []
      const screening = applications.find(item => BLOCKING_STATUSES.has(item.status)) || null
      this.setData({
        screening: screening || null,
        applicationId: screening ? screening.id : '',
        summary: screening ? (screening.statusDescription || '申请已提交，请留意后续业务进度。') : (this.data.hasMerchantInvite ? '已识别商家二维码，可以继续填写本次办理资料。' : '请扫描商家提供的专属二维码，扫码后方可填写办理资料。'),
        statusText: screening ? (screening.statusText || '处理中') : (this.data.hasMerchantInvite ? '已扫码' : '等待扫码')
      })
    }).catch(error => this.setData({ summary: error.message }))
  },
  goScreening() {
    if (this.data.applicationId) {
      wx.navigateTo({ url: `/modules/client/pages/application-detail/index?id=${this.data.applicationId}` })
      return
    }
    if (this.data.hasMerchantInvite) {
      wx.navigateTo({ url: '/modules/client/pages/qualification/index' })
      return
    }
    this.scanMerchantQr()
  },
  rescanMerchantQr() {
    wx.showModal({
      title: '重新扫描商家二维码？',
      content: '扫描成功后将使用新的商家信息，原扫码商家会被替换。',
      confirmText: '重新扫描',
      success: result => { if (result.confirm) this.scanMerchantQr() }
    })
  },
  scanMerchantQr() {
    wx.scanCode({
      scanType: ['qrCode'],
      success: result => {
        const source = parseScannedEntry(result)
        if (!source || !source.inviteCode) {
          wx.showModal({ title: '无法识别二维码', content: '请扫描商家提供的小程序专属二维码。', showCancel: false })
          return
        }
        const session = getSession()
        saveEntrySource(source, session && session.userId)
        this.setData({ hasMerchantInvite: true, statusText: '已扫码', summary: '已识别商家二维码，可以填写本次办理资料。' })
        bindEntrySource(source)
          .then(result => {
            this.scheduleEntryExpiry(result.source)
            wx.navigateTo({ url: '/modules/client/pages/qualification/index' })
          })
          .catch(error => wx.showToast({ title: error.message, icon: 'none' }))
      },
      fail: error => {
        if (String(error.errMsg || '').includes('cancel')) return
        wx.showToast({ title: '扫码失败，请重试', icon: 'none' })
      }
    })
  },
  scheduleEntryExpiry(source) {
    if (this.entryExpiryTimer) clearTimeout(this.entryExpiryTimer)
    this.entryExpiryTimer = null
    if (!source) return
    const expiresAt = new Date(source.expiresAt || new Date(source.receivedAt).getTime() + 2 * 60 * 60 * 1000).getTime()
    if (!expiresAt) return
    const delay = Math.max(0, expiresAt - Date.now()) + 1000
    this.entryExpiryTimer = setTimeout(() => {
      this.entryExpiryTimer = null
      this.onShow()
    }, delay)
  },
  onHide() {
    if (this.entryExpiryTimer) clearTimeout(this.entryExpiryTimer)
    this.entryExpiryTimer = null
  },
  onUnload() {
    if (this.entryExpiryTimer) clearTimeout(this.entryExpiryTimer)
  },
  goApplications() { wx.navigateTo({ url: '/modules/client/pages/orders/index' }) },
  goProfile() { wx.navigateTo({ url: '/modules/client/pages/profile/index' }) }
})
