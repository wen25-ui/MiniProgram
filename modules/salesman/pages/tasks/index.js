const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { getSalesmanApplications, startService, submitFulfillment, failHomeService } = require('../../../../services/client-application-service')

Page({
  data: { applications: [], verified: {}, remarks: {}, failureReasons: {}, message: '' },
  onShow() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.SALESMAN)) {
      wx.reLaunch({ url: '/pages/auth/login/index' })
      return
    }
    this.session = session
    this.refresh()
  },
  refresh() {
    getSalesmanApplications().then(applications => this.setData({ applications, message: '' })).catch(error => this.setData({ message: error.message }))
  },
  toggleVerified(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ [`verified.${id}`]: !this.data.verified[id] })
  },
  onRemarkInput(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ [`remarks.${id}`]: event.detail.value })
  },
  onFailureReasonInput(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ [`failureReasons.${id}`]: event.detail.value })
  },
  operate(event) {
    const { id, action } = event.currentTarget.dataset
    try {
      let task
      if (action === 'start') task = startService(id)
      if (action === 'submit') task = submitFulfillment(id, this.data.verified[id], this.data.remarks[id])
      if (action === 'fail') task = failHomeService(id, this.data.failureReasons[id])
      task.then(() => this.refresh()).catch(error => this.setData({ message: error.message }))
    } catch (error) {
      this.setData({ message: error.message })
    }
  }
})
