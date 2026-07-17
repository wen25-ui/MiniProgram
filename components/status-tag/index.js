const { STATUS_TEXT, STATUS_TONE } = require('../../constants/status')

Component({
  properties: {
    status: {
      type: String,
      value: ''
    }
  },
  data: {
    text: '',
    tone: 'muted'
  },
  observers: {
    status(status) {
      this.setData({
        text: STATUS_TEXT[status] || status || '未知',
        tone: STATUS_TONE[status] || 'muted'
      })
    }
  }
})
