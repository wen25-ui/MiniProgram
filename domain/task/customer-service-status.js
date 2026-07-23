const CUSTOMER_SERVICE_TASK_STATUS = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  PROCESSING: 'PROCESSING',
  WAIT_DISPATCH: 'WAIT_DISPATCH',
  COMPLETED: 'COMPLETED',
  TRANSFERRED: 'TRANSFERRED',
  TIMEOUT: 'TIMEOUT'
})

const CUSTOMER_SERVICE_TASK_STATUS_TEXT = Object.freeze({
  ASSIGNED: '待联系',
  PROCESSING: '处理中',
  WAIT_DISPATCH: '待派遣',
  COMPLETED: '完成',
  TRANSFERRED: '已转移',
  TIMEOUT: '超时'
})

const CUSTOMER_SERVICE_TASK_TRANSITIONS = Object.freeze({
  ASSIGNED: ['PROCESSING', 'TIMEOUT', 'TRANSFERRED'],
  PROCESSING: ['WAIT_DISPATCH', 'TIMEOUT', 'TRANSFERRED'],
  WAIT_DISPATCH: ['COMPLETED', 'TIMEOUT', 'TRANSFERRED'],
  TIMEOUT: ['PROCESSING', 'TRANSFERRED'],
  COMPLETED: [],
  TRANSFERRED: []
})

const CUSTOMER_SERVICE_TASK_ACTIVE_STATUSES = Object.freeze([
  'ASSIGNED',
  'PROCESSING',
  'WAIT_DISPATCH',
  'TIMEOUT'
])

const CUSTOMER_SERVICE_TASK_FILTERS = Object.freeze([
  'ALL',
  'ASSIGNED',
  'PROCESSING',
  'WAIT_DISPATCH',
  'TIMEOUT'
])

function canTransitionCustomerServiceTask(from, to) {
  return (CUSTOMER_SERVICE_TASK_TRANSITIONS[from] || []).includes(to)
}

function customerServiceTaskStatusForApplication(applicationStatus) {
  if (applicationStatus === 'PENDING') return 'ASSIGNED'
  if (['CONFIRMED', 'DISPATCHING'].includes(applicationStatus)) return 'WAIT_DISPATCH'
  if (['CONTACTING', 'VERIFYING', 'VERIFIED', 'INVALID_INFO', 'CORRECTING'].includes(applicationStatus)) return 'PROCESSING'
  return null
}

module.exports = {
  CUSTOMER_SERVICE_TASK_STATUS,
  CUSTOMER_SERVICE_TASK_STATUS_TEXT,
  CUSTOMER_SERVICE_TASK_TRANSITIONS,
  CUSTOMER_SERVICE_TASK_ACTIVE_STATUSES,
  CUSTOMER_SERVICE_TASK_FILTERS,
  canTransitionCustomerServiceTask,
  customerServiceTaskStatusForApplication
}
