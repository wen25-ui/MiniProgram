const { ORDER_STATUS } = require('../constants/status')

const orders = [
  {
    id: 'O20260717001',
    merchantId: 'm_demo_001',
    merchantName: '城南合作门店',
    customerName: '赵先生',
    customerPhone: '13912345678',
    address: '南山区科技园 8 栋',
    appointmentTime: '2026-07-18 10:00',
    packageLevel: '全家每月 399 元以上',
    localQualified: true,
    longTermAccepted: true,
    status: ORDER_STATUS.WAIT_REVIEW,
    visitMarked: false,
    salesmanId: '',
    salesmanName: '',
    expectedRefund: 600,
    commissionRate: 0.1,
    expectedCommission: 60,
    lockedCommission: 0,
    settledCommission: 0,
    refundStatus: '未生成',
    commissionStatus: '未生成',
    voucherImage: '',
    rejectReason: '',
    verifyRemark: '',
    createdAt: '2026-07-17 09:20',
    updatedAt: '2026-07-17 09:20',
    timeline: [
      { status: ORDER_STATUS.WAIT_REVIEW, text: '客户提交申请，等待公司审核', time: '2026-07-17 09:20' }
    ]
  },
  {
    id: 'O20260716002',
    merchantId: 'm_demo_001',
    merchantName: '城南合作门店',
    customerName: '陈女士',
    customerPhone: '13788889999',
    address: '福田区中心路 18 号',
    appointmentTime: '2026-07-17 15:30',
    packageLevel: '全家每月 299-398 元',
    localQualified: true,
    longTermAccepted: true,
    status: ORDER_STATUS.WAIT_ACCEPT,
    visitMarked: false,
    salesmanId: 's_demo_001',
    salesmanName: '张业务',
    expectedRefund: 500,
    commissionRate: 0.1,
    expectedCommission: 50,
    lockedCommission: 0,
    settledCommission: 0,
    refundStatus: '未生成',
    commissionStatus: '预计',
    voucherImage: '',
    rejectReason: '',
    verifyRemark: '',
    createdAt: '2026-07-16 11:05',
    updatedAt: '2026-07-16 14:10',
    timeline: [
      { status: ORDER_STATUS.WAIT_REVIEW, text: '客户提交申请，等待公司审核', time: '2026-07-16 11:05' },
      { status: ORDER_STATUS.WAIT_DISPATCH, text: '审核通过，等待派单', time: '2026-07-16 13:40' },
      { status: ORDER_STATUS.WAIT_ACCEPT, text: '已指派给张业务，等待接单', time: '2026-07-16 14:10' }
    ]
  }
]

module.exports = {
  orders
}
