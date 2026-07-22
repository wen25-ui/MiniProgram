const { ORDER_STATUS } = require('./status')

const CLIENT_PROGRESS = Object.freeze({
  [ORDER_STATUS.PENDING]: { label: '待审核', description: '申请已提交，等待客服审核。' },
  [ORDER_STATUS.CONTACTING]: { label: '联系确认中', description: '客服正在联系您核实申请信息。' },
  [ORDER_STATUS.VERIFYING]: { label: '信息核实中', description: '客服正在核实您提交的信息。' },
  [ORDER_STATUS.VERIFIED]: { label: '信息核实完成', description: '信息已核实，等待确认办理意愿和方式。' },
  [ORDER_STATUS.INVALID_INFO]: { label: '信息待更正', description: '部分申请信息需要进一步确认。' },
  [ORDER_STATUS.CORRECTING]: { label: '信息修正中', description: '客服正在协助更正申请信息。' },
  [ORDER_STATUS.CONFIRMED]: { label: '已确认办理', description: '办理方式已确认，等待安排任务。' },
  [ORDER_STATUS.CANCELLED]: { label: '已取消', description: '本次申请已取消，您可以重新提交申请。' },
  [ORDER_STATUS.DISPATCHING]: { label: '派单中', description: '正在分配办理网点或工作人员。' },
  [ORDER_STATUS.ASSIGNED]: { label: '已派单', description: '任务已分配，等待工作人员处理。' },
  [ORDER_STATUS.PROCESSING]: { label: '处理中', description: '工作人员正在处理业务。' },
  [ORDER_STATUS.COMPLETED]: { label: '已完成', description: '业务办理已完成。' },
  [ORDER_STATUS.PRE_SCREEN_REJECTED]: { label: '预审待补充', description: '请补充预审资料后再次提交。' },
  [ORDER_STATUS.PENDING_REVIEW]: { label: '待客服复审', description: '客服将核实活动资格、合约记录及欠费情况。' },
  [ORDER_STATUS.REVIEW_REJECTED]: { label: '审核未通过', description: '本次申请未通过人工审核。' },
  [ORDER_STATUS.PENDING_CONTACT]: { label: '待联系确认', description: '客服或营业厅将联系您确认后续安排。' },
  [ORDER_STATUS.CONTACT_FAILED]: { label: '暂未联系成功', description: '客服本次暂未联系到您，稍后可再次联系。' },
  [ORDER_STATUS.CLIENT_DECLINED]: { label: '已放弃办理', description: '本次申请已经结束，您可以重新提交申请。' },
  [ORDER_STATUS.PENDING_SERVICE_MODE]: { label: '待确认办理方式', description: '请与客服确认选择上门办理或营业厅办理。' },
  [ORDER_STATUS.PENDING_APPOINTMENT]: { label: '待确认上门时间', description: '请留意客服的预约确认通知。' },
  [ORDER_STATUS.PENDING_DISPATCH]: { label: '预约已确认', description: '正在安排上门业务员。' },
  [ORDER_STATUS.PENDING_SERVICE]: { label: '待上门办理', description: '请按已确认的预约时间等候上门。' },
  [ORDER_STATUS.IN_SERVICE]: { label: '办理中', description: '业务员正在为您办理。' },
  [ORDER_STATUS.PENDING_STORE_SERVICE]: { label: '待营业厅办理', description: '请按与客服确认的安排前往营业厅办理。' },
  [ORDER_STATUS.IN_STORE_SERVICE]: { label: '营业厅办理中', description: '营业厅正在为您办理业务。' },
  [ORDER_STATUS.SERVICE_FAILED]: { label: '办理失败', description: '本次办理未成功，请查看失败原因或联系客服。' },
  [ORDER_STATUS.PENDING_VERIFICATION]: { label: '待核销', description: '办理凭证正在等待客服核销。' },
  [ORDER_STATUS.VERIFICATION_RETURNED]: { label: '核销资料待补充', description: '业务员将补充办理资料。' },
  [ORDER_STATUS.SERVICE_COMPLETED]: { label: '服务完成', description: '办理已完成，返现入账以纸面账单确认结果为准。' },
  [ORDER_STATUS.WITHDRAWN]: { label: '已撤回', description: '该申请已由您撤回，可重新提交新的资格申请。' },
  [ORDER_STATUS.CLOSED]: { label: '已结束', description: '该申请的业务流程已结束。' }
})

function getClientProgress(status) {
  return CLIENT_PROGRESS[status] || { label: '处理中', description: '申请正在处理中。' }
}

function getRefundText(refundStatus) {
  const text = {
    NOT_RECORDED: '未登记',
    RECORDED: '已登记纸面账单',
    PENDING_CONFIRMATION: '待入账确认',
    REFUND_POSTED: '返现完成入账'
  }
  return text[refundStatus] || '暂未生成'
}

module.exports = {
  getClientProgress,
  getRefundText
}
