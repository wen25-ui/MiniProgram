const { getSession, hasRole, clearSession } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { listAccounts, createAccount, updateAccount, deleteAccount, listOutlets } = require('../../../../services/admin-service')

const TABS = [
  { role: 'merchant', label: '商家' },
  { role: 'salesman', label: '业务员' },
  { role: 'customer-service', label: '客服' }
]

function emptyForm() {
  return { id: '', displayName: '', contactName: '', phone: '', salesmanCode: '', salesmanType: 'HOME_VISIT', serviceRegion: '', assignedMerchantId: '', password: '', accountStatus: 'ACTIVE' }
}

Page({
  data: { tabs: TABS, role: 'merchant', accounts: [], outlets: [], outletIndex: 0, selectedOutletName: '', loading: true, saving: false, message: '', showForm: false, editing: false, form: emptyForm() },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.ADMIN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.refresh()
  },
  chooseRole(event) {
    this.setData({ role: event.currentTarget.dataset.role, showForm: false, form: emptyForm(), message: '' })
    this.refresh()
  },
  refresh() {
    this.setData({ loading: true })
    const task = this.data.role === 'salesman' ? Promise.all([listAccounts(this.data.role), listOutlets()]) : Promise.all([listAccounts(this.data.role), Promise.resolve([])])
    task.then(([accounts, outlets]) => this.setData({ accounts, outlets, loading: false, message: '' }))
      .catch(error => this.setData({ loading: false, message: error.message }))
  },
  addAccount() { this.setData({ showForm: true, editing: false, form: emptyForm(), message: '' }) },
  editAccount(event) {
    const item = this.data.accounts.find(entry => String(entry.id) === String(event.currentTarget.dataset.id))
    if (!item) return
    const outletIndex = Math.max(0, this.data.outlets.findIndex(outlet => String(outlet.id) === String(item.assignedMerchantId)))
    this.setData({ showForm: true, editing: true, outletIndex, selectedOutletName: item.assignedMerchantName || '', form: { id: item.id, displayName: item.merchantName || item.displayName || '', contactName: item.contactName || '', phone: item.phone || '', salesmanCode: item.salesmanCode || '', salesmanType: item.salesmanType || 'HOME_VISIT', serviceRegion: item.serviceRegion || '', assignedMerchantId: item.assignedMerchantId || '', password: '', accountStatus: item.accountStatus || 'ACTIVE' }, message: '' })
  },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }) },
  changeStatus(event) { this.setData({ 'form.accountStatus': event.detail.value ? 'ACTIVE' : 'DISABLED' }) },
  changeSalesmanType(event) {
    const salesmanType = event.detail.value
    const firstOutlet = this.data.outlets[0]
    this.setData({
      'form.salesmanType': salesmanType,
      'form.assignedMerchantId': salesmanType === 'BRANCH' ? (this.data.form.assignedMerchantId || firstOutlet && firstOutlet.id || '') : '',
      selectedOutletName: salesmanType === 'BRANCH' ? (this.data.selectedOutletName || firstOutlet && firstOutlet.name || '') : '',
      outletIndex: salesmanType === 'BRANCH' ? this.data.outletIndex : 0
    })
  },
  changeOutlet(event) {
    const outletIndex = Number(event.detail.value)
    const outlet = this.data.outlets[outletIndex]
    this.setData({ outletIndex, selectedOutletName: outlet ? outlet.name : '', 'form.assignedMerchantId': outlet ? outlet.id : '' })
  },
  cancelForm() { this.setData({ showForm: false, form: emptyForm(), message: '' }) },
  save() {
    if (this.data.saving) return
    const form = this.data.form
    this.setData({ saving: true, message: '' })
    const task = this.data.editing ? updateAccount(this.data.role, form.id, form) : createAccount(this.data.role, form)
    task.then(() => {
      wx.showToast({ title: this.data.editing ? '修改成功' : '创建成功', icon: 'success' })
      this.setData({ saving: false, showForm: false, form: emptyForm() })
      this.refresh()
    }).catch(error => this.setData({ saving: false, message: error.message }))
  },
  remove(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({ title: '确认删除账号？', content: '删除后账号将被停用并立即退出登录，历史业务记录会保留。', confirmText: '确认删除', confirmColor: '#c43d3d', success: result => {
      if (!result.confirm) return
      deleteAccount(this.data.role, id).then(() => { wx.showToast({ title: '账号已删除', icon: 'success' }); this.refresh() })
        .catch(error => this.setData({ message: error.message }))
    } })
  },
  logout() { clearSession(); wx.reLaunch({ url: '/pages/auth/login/index' }) }
})
