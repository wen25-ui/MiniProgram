const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getBranch } = require('../../api')

Page({
  data: { branch: null, members: [], loading: true, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) return wx.reLaunch({ url: '/pages/auth/login/index' })
    this.setData({ loading: true, message: '' })
    getBranch().then(branch => {
      const members = (branch.members || branch.teamMembers || branch.salesmen || []).map(item => Object.assign({}, item, {
        taskCount: Number(item.currentTaskCount === undefined ? (item.taskCount || item.activeTaskCount || 0) : item.currentTaskCount)
      }))
      this.setData({ branch, members, loading: false })
    }).catch(error => this.setData({ loading: false, message: error.message }))
  }
})
