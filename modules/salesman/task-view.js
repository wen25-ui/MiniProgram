const SOURCE_TEXT = { BRANCH_ASSIGN: '网点分配', SALESMAN_GRAB: '抢单获得', TRANSFER: '转接获得' }

const STATUS_GROUPS = {
  WAIT_ASSIGN: ['PENDING_ACCEPT', 'WAIT_ASSIGN', 'ACCEPTED', 'WAITING_CONTACT', 'CONTACT_FAILED', 'WAITING_TIME_CONFIRMATION'],
  PROCESSING: ['WAITING_HOME_SERVICE', 'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION', 'PROCESSING'],
  VERIFYING: ['VERIFYING'],
  DOCUMENT_PENDING: ['WAITING_RESULT_UPLOAD', 'DOCUMENT_PENDING', 'VERIFICATION_RETURNED'],
  AUDITING: ['PENDING_VERIFICATION', 'AUDITING'],
  FINISHED: ['COMPLETED', 'FINISHED']
}

const STATUS_TEXT = {
  WAIT_ASSIGN: '待处理', PROCESSING: '办理中', VERIFYING: '实名核验',
  DOCUMENT_PENDING: '待提交', AUDITING: '审核中', FINISHED: '完成', FAILED: '失败'
}

function statusView(status) {
  const code = Object.keys(STATUS_GROUPS).find(key => STATUS_GROUPS[key].includes(status)) || 'FAILED'
  return { code, text: STATUS_TEXT[code] }
}

function taskView(item) {
  const state = statusView(item.status)
  const source = item.orderSource || item.assignType || item.taskSource || 'BRANCH_ASSIGN'
  return Object.assign({}, item, {
    salesmanStatus: state.code,
    salesmanStatusText: state.text,
    source,
    sourceText: SOURCE_TEXT[source] || SOURCE_TEXT.BRANCH_ASSIGN,
    projectName: item.projectName || item.businessType || item.serviceType || '业务返现办理',
    branchName: item.branchName || item.storeName || '暂未绑定网点',
    contacts: item.contacts || [],
    history: item.history || []
  })
}

module.exports = { SOURCE_TEXT, STATUS_GROUPS, STATUS_TEXT, statusView, taskView }
