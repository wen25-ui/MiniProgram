const orderApi = require('../../api/orderApi')

Page({
  data: {
    roles: [
      { key: 'client', title: '客户', desc: '提交申请、查看办理进度和返费状态', url: '/pages/client/home/index' },
      { key: 'merchant', title: '商家', desc: '查看本店推荐客户、进度和佣金', url: '/pages/merchant/home/index' },
      { key: 'salesman', title: '业务员', desc: '接单、上门办理并提交凭证', url: '/pages/salesman/tasks/index' },
      { key: 'admin', title: '管理员', desc: '审核、派单、核销、退费和结算', url: '/pages/admin/dashboard/index' }
    ]
  },
  chooseRole(event) {
    const url = event.currentTarget.dataset.url
    wx.navigateTo({ url })
  },
  resetDemo() {
    orderApi.resetDemoData().then(() => {
      wx.showToast({ title: '已重置演示数据', icon: 'success' })
    })
  }
})
