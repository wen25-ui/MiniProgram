const TASK_STATUS_TEXT = {
  ASSIGNED: '已分配',
  PROCESSING: '处理中',
  WAIT_DISPATCH: '待派遣',
  COMPLETED: '完成',
  TRANSFERRED: '已转移',
  TIMEOUT: '超时'
}

const TASK_FILTERS = [
  { key: 'ALL', label: '全部' },
  { key: 'ASSIGNED', label: '待联系' },
  { key: 'PROCESSING', label: '处理中' },
  { key: 'WAIT_DISPATCH', label: '待派遣' },
  { key: 'TIMEOUT', label: '异常' }
]

function taskStatusText(status) {
  return TASK_STATUS_TEXT[status] || status || '状态待同步'
}

module.exports = { TASK_STATUS_TEXT, TASK_FILTERS, taskStatusText }
