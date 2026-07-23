const { taskStatusText } = require('../../task-model')

Component({
  properties: {
    taskInfo: { type: Object, value: {} }
  },
  data: { statusText: '任务信息待同步' },
  observers: {
    'taskInfo.status'(status) { this.setData({ statusText: taskStatusText(status) }) }
  }
})
