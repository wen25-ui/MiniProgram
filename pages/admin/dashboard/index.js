const orderApi = require('../../../api/orderApi')
const { money } = require('../../../utils/format')

Page({
  data: {
    dashboard: {},
    menus: [
      { title: '待审核客户', desc: '审核通过或驳回', url: '/pages/admin/review/index' },
      { title: '指派业务员', desc: '审核通过后派单', url: '/pages/admin/dispatch/index' },
      { title: '办理进度', desc: '查看全量订单状态', url: '/pages/admin/progress/index' },
      { title: '核销凭证', desc: '确认核销或退回修改', url: '/pages/admin/verify/index' },
      { title: '客户返费记录', desc: '标记客户已退费', url: '/pages/admin/refunds/index' },
      { title: '商家佣金记录', desc: '标记佣金已结算', url: '/pages/admin/commissions/index' }
    ]
  },
  onShow() {
    orderApi.getDashboard().then(data => {
      this.setData({
        dashboard: Object.assign({}, data, {
          lockedCommissionText: money(data.lockedCommission),
          settledCommissionText: money(data.settledCommission)
        })
      })
    })
  },
  openMenu(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url })
  }
})
