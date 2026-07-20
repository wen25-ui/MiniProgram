const { getSession } = require('./core/auth/session')

App({
  globalData: {
    session: null
  },
  onLaunch() {
    this.globalData.session = getSession()
  }
})
