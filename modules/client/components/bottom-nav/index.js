const ITEMS = [
  { key: 'home', label: '首页', icon: '⌂', url: '/modules/client/pages/home/index' },
  { key: 'progress', label: '业务进度', icon: '◷', url: '/modules/client/pages/orders/index' },
  { key: 'profile', label: '用户管理', icon: '♙', url: '/modules/client/pages/profile/index' }
]

Component({
  properties: { current: { type: String, value: 'home' } },
  data: { items: ITEMS },
  methods: {
    switchTab(event) {
      const item = this.data.items.find(entry => entry.key === event.currentTarget.dataset.key)
      if (!item || item.key === this.properties.current) return
      wx.redirectTo({ url: item.url })
    }
  }
})
