const { getSession } = require('./core/auth/session')

const NAVIGATION_METHODS = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack']

function installNavigationLoading() {
  let activeToken = 0
  let fallbackTimer = null

  NAVIGATION_METHODS.forEach(method => {
    if (typeof wx[method] !== 'function') return
    const original = wx[method].bind(wx)
    wx[method] = options => {
      activeToken += 1
      const token = activeToken
      const startedAt = Date.now()
      const settings = options || {}
      const originalComplete = settings.complete
      if (fallbackTimer) clearTimeout(fallbackTimer)
      wx.showNavigationBarLoading()
      wx.showLoading({ title: '页面加载中…', mask: true })

      const hide = immediate => {
        const delay = immediate ? 0 : Math.max(0, 180 - (Date.now() - startedAt))
        setTimeout(() => {
          if (token !== activeToken) return
          if (fallbackTimer) clearTimeout(fallbackTimer)
          fallbackTimer = null
          wx.hideNavigationBarLoading()
          wx.hideLoading()
        }, delay)
      }

      fallbackTimer = setTimeout(() => hide(true), 10000)
      try {
        return original(Object.assign({}, settings, {
          complete(result) {
            hide(false)
            if (typeof originalComplete === 'function') originalComplete(result)
          }
        }))
      } catch (error) {
        hide(true)
        throw error
      }
    }
  })
}

App({
  globalData: {
    session: null
  },
  onLaunch() {
    installNavigationLoading()
    this.globalData.session = getSession()
  }
})
