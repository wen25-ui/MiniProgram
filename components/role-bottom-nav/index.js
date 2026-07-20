const NAV_ITEMS = {
  merchant: [
    { key: 'home', label: '经营概览', icon: '店', url: '/modules/merchant/pages/home/index' },
    { key: 'applications', label: '客户申请', icon: '客', url: '/modules/merchant/pages/applications/index' },
    { key: 'profile', label: '用户管理', icon: '人', url: '/pages/account/index?role=merchant' }
  ],
  finance: [
    { key: 'home', label: '财务概览', icon: '财', url: '/modules/finance/pages/home/index' },
    { key: 'bills', label: '纸面账单', icon: '账', url: '/modules/finance/pages/bills/index' },
    { key: 'profile', label: '用户管理', icon: '人', url: '/pages/account/index?role=finance' }
  ],
  'customer-service': [
    { key: 'home', label: '客服工作台', icon: '服', url: '/modules/customer-service/pages/home/index' },
    { key: 'review', label: '处理中心', icon: '办', url: '/modules/customer-service/pages/review/index' },
    { key: 'profile', label: '用户管理', icon: '人', url: '/pages/account/index?role=customer-service' }
  ],
  salesman: [
    { key: 'home', label: '任务概览', icon: '览', url: '/modules/salesman/pages/home/index' },
    { key: 'tasks', label: '上门任务', icon: '任', url: '/modules/salesman/pages/tasks/index' },
    { key: 'profile', label: '用户管理', icon: '人', url: '/pages/account/index?role=salesman' }
  ],
  boss: [
    { key: 'home', label: '经营看板', icon: '总', url: '/modules/boss/pages/home/index' },
    { key: 'profile', label: '用户管理', icon: '人', url: '/pages/account/index?role=boss' }
  ],
  admin: [
    { key: 'accounts', label: '账号管理', icon: '管', url: '/modules/admin/pages/accounts/index' },
    { key: 'profile', label: '管理员中心', icon: '我', url: '/pages/account/index?role=admin' }
  ]
}

const ROLE_COLORS = {
  merchant: '#1677c8', finance: '#3756c7',
  'customer-service': '#0f7f89', salesman: '#d06b18', boss: '#365780', admin: '#2457c5'
}

Component({
  properties: {
    role: { type: String, value: '' },
    current: { type: String, value: 'home' }
  },
  data: { items: [], activeColor: '#1677c8' },
  observers: {
    role(role) { this.setData({ items: NAV_ITEMS[role] || [], activeColor: ROLE_COLORS[role] || '#1677c8' }) }
  },
  methods: {
    switchPage(event) {
      const item = this.data.items.find(entry => entry.key === event.currentTarget.dataset.key)
      if (!item || item.key === this.properties.current) return
      wx.redirectTo({ url: item.url })
    }
  }
})
