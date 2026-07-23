const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const {
  getReviews, getReviewQuestions, saveReviewAnswer, getApplication,
  startContact, saveContactResult, getCustomerTags, addCustomerTag, deleteCustomerTag,
  getCustomerNotes, addCustomerNote, getBranchCandidates, assignBranch
} = require('../../api')

const PRESET_TAGS = ['高意向', '价格敏感', '需回访', '无效客户']
const CONTACTED_STATUSES = ['VERIFYING', 'VERIFIED', 'CONFIRMED', 'DISPATCHING', 'ASSIGNED', 'PROCESSING', 'COMPLETED', 'SERVICE_COMPLETED']
const ASSIGNED_STATUSES = ['ASSIGNED', 'PROCESSING', 'COMPLETED', 'SERVICE_COMPLETED']

function normalizeOptions(value) {
  let options = value
  if (typeof options === 'string') {
    try { options = JSON.parse(options) } catch (_) { options = [] }
  }
  return (Array.isArray(options) ? options : []).map(option => typeof option === 'object'
    ? { label: String(option.label || option.value || ''), value: String(option.value || option.label || '') }
    : { label: String(option), value: String(option) })
}

function inputType(value) {
  const type = String(value || '').toUpperCase()
  if (['MULTIPLE', 'MULTI', 'CHECKBOX'].includes(type)) return 'multiple'
  if (['TEXT', 'TEXTAREA', 'INPUT'].includes(type)) return 'text'
  return 'single'
}

function hasAnswer(question) {
  if (Array.isArray(question.answer)) return question.answer.length > 0
  return String(question.answer === undefined || question.answer === null ? '' : question.answer).trim() !== ''
}

function answerMatches(answer, expected) {
  if (Array.isArray(answer)) return answer.map(String).includes(String(expected))
  return String(answer) === String(expected)
}

Page({
  data: {
    id: '', customerId: '', listCustomerName: '', listProjectName: '', application: null, loading: true, submitting: false, message: '',
    contacted: false, contactStarted: false, contactFormVisible: false, contactReason: '',
    questions: [], visibleQuestions: [], reviewComplete: false,
    tags: [], presetTags: PRESET_TAGS.map(label => ({ label, selected: false, id: null })), customTag: '',
    notes: [], newNote: '', outlets: [], outletMatchText: '', selectedBranchId: '', assigned: false, canAssignBranch: false
  },
  onLoad(options) {
    this.setData({
      id: options.id || '', customerId: options.customerId || '',
      listCustomerName: decodeURIComponent(options.customerName || ''),
      listProjectName: decodeURIComponent(options.projectName || '')
    })
    this.loadDetail()
  },
  loadDetail() {
    const session = getSession()
    if (!session || !hasRole(session, ROLES.CUSTOMER_SERVICE)) {
      return wx.reLaunch({ url: '/pages/auth/login/index' })
    }
    if (!this.data.id) return this.setData({ loading: false, message: '缺少订单编号' })
    this.setData({ loading: true, message: '' })
    Promise.all([getApplication(this.data.id), getReviewQuestions(), this.resolveCustomerId()]).then(([application, questionRows, customerId]) => {
      const questions = questionRows.map((question, index) => {
        const options = normalizeOptions(question.options)
        return {
          id: question.id,
          title: question.title,
          inputType: options.length ? inputType(question.type) : 'text',
          options,
          parentId: question.parentId || question.parent_id || null,
          parentAnswer: question.parentAnswer === undefined ? question.parent_answer : question.parentAnswer,
          sort: Number(question.sort === undefined ? index : question.sort),
          answer: question.answer === undefined ? '' : question.answer,
          answered: question.answer !== undefined && question.answer !== null && String(question.answer) !== ''
        }
      }).sort((left, right) => left.sort - right.sort)
      const contacted = CONTACTED_STATUSES.includes(application.status) || (application.contactResult === 'CONTACTED')
      this.setData({
        application: Object.assign({}, application, {
          customerName: this.data.listCustomerName || application.customerName || application.name || '未填写',
          projectName: this.data.listProjectName || application.projectName || (application.merchant && application.merchant.name) || '业务返现办理'
        }),
        customerId: String(customerId || ''),
        questions,
        contacted,
        contactStarted: application.status === 'CONTACTING',
        assigned: ASSIGNED_STATUSES.includes(application.status),
        canAssignBranch: ['CONFIRMED', 'DISPATCHING'].includes(application.status),
        loading: false
      }, () => {
        this.refreshVisibleQuestions()
        if (customerId) this.loadPrivateData()
        if (!this.data.assigned) this.loadOutlets()
      })
    }).catch(error => this.setData({ loading: false, submitting: false, message: error.message }))
  },
  resolveCustomerId() {
    if (this.data.customerId) return Promise.resolve(this.data.customerId)
    return getReviews('ALL').then(rows => {
      const current = rows.find(item => String(item.orderId || item.id) === String(this.data.id))
      return current && (current.customerId || (current.customer && current.customer.id))
    })
  },
  refreshVisibleQuestions() {
    const questions = this.data.questions
    if (!questions.length) return this.setData({ visibleQuestions: [], reviewComplete: true })
    const visibleIds = new Set([questions[0].id])
    questions.forEach((question, index) => {
      if (index === 0) return
      if (question.parentId) {
        const parent = questions.find(item => String(item.id) === String(question.parentId))
        if (parent && visibleIds.has(parent.id) && hasAnswer(parent) && answerMatches(parent.answer, question.parentAnswer)) visibleIds.add(question.id)
      } else {
        const previous = questions[index - 1]
        if (visibleIds.has(previous.id) && hasAnswer(previous)) visibleIds.add(question.id)
      }
    })
    const visibleQuestions = questions.filter(question => visibleIds.has(question.id)).map(question => Object.assign({}, question, {
      answered: hasAnswer(question),
      options: question.options.map(option => Object.assign({}, option, {
        selected: Array.isArray(question.answer) && question.answer.includes(option.value)
      }))
    }))
    this.setData({ visibleQuestions, reviewComplete: visibleQuestions.length > 0 && visibleQuestions.every(hasAnswer) })
  },
  beginContact() {
    if (this.data.submitting) return
    const application = this.data.application
    const prepare = application.status === 'PENDING' ? startContact(this.data.id) : Promise.resolve()
    this.setData({ submitting: true, message: '' })
    prepare.then(() => new Promise((resolve, reject) => wx.makePhoneCall({ phoneNumber: String(application.phone || ''), success: resolve, fail: reject })))
      .then(() => this.setData({ submitting: false, contactStarted: true }))
      .catch(error => this.setData({ submitting: false, message: error.message || '未能打开拨号界面' }))
  },
  contactSuccess() {
    this.run(saveContactResult(this.data.id, 'CONTACTED'), '已记录联系成功', () => this.loadDetail())
  },
  showContactFail() { this.setData({ contactFormVisible: true }) },
  onContactReasonInput(event) { this.setData({ contactReason: event.detail.value }) },
  submitContactFail() {
    const reason = this.data.contactReason.trim()
    if (!reason) return wx.showToast({ title: '请填写未联系成功原因', icon: 'none' })
    this.run(saveContactResult(this.data.id, 'UNREACHABLE', reason), '已转为待重联', () => wx.navigateBack())
  },
  onQuestionAnswer(event) {
    const { questionId, answer } = event.detail
    const questions = this.data.questions.map(question => String(question.id) === String(questionId)
      ? Object.assign({}, question, { answer, answered: hasAnswer({ answer }) })
      : question)
    this.setData({ questions }, () => this.refreshVisibleQuestions())
    if (!hasAnswer({ answer })) return
    const storedAnswer = Array.isArray(answer) ? JSON.stringify(answer) : String(answer)
    saveReviewAnswer(this.data.id, questionId, storedAnswer)
      .catch(error => this.setData({ message: error.message }))
  },
  loadPrivateData() {
    Promise.all([getCustomerTags(this.data.customerId), getCustomerNotes(this.data.customerId)]).then(([tags, notes]) => {
      this.setData({ tags, notes, presetTags: PRESET_TAGS.map(label => {
        const existing = tags.find(item => item.tag === label)
        return { label, selected: Boolean(existing), id: existing ? existing.id : null }
      }) })
    }).catch(error => this.setData({ message: error.message }))
  },
  togglePresetTag(event) {
    const value = event.currentTarget.dataset.value
    const existing = this.data.tags.find(item => item.tag === value)
    const task = existing ? deleteCustomerTag(this.data.customerId, existing.id) : addCustomerTag(this.data.customerId, value)
    this.run(task, existing ? '标签已移除' : '标签已添加', () => this.loadPrivateData())
  },
  onCustomTagInput(event) { this.setData({ customTag: event.detail.value }) },
  addCustomTag() {
    const tag = this.data.customTag.trim()
    if (!tag) return wx.showToast({ title: '请输入标签内容', icon: 'none' })
    this.run(addCustomerTag(this.data.customerId, tag), '标签已添加', () => {
      this.setData({ customTag: '' })
      this.loadPrivateData()
    })
  },
  onNoteInput(event) { this.setData({ newNote: event.detail.value }) },
  submitNote() {
    const content = this.data.newNote.trim()
    if (!content) return wx.showToast({ title: '请输入备注内容', icon: 'none' })
    this.run(addCustomerNote(this.data.customerId, content), '备注已保存', () => {
      this.setData({ newNote: '' })
      this.loadPrivateData()
    })
  },
  loadOutlets() {
    getBranchCandidates(this.data.id).then(result => {
      const matchText = { SAME_DISTRICT: '同区推荐', NEIGHBOR_DISTRICT: '相邻区域推荐', CHENGDU_FALLBACK: '成都范围推荐' }[result.matchLevel] || '可派遣网点'
      const outlets = (result.candidates || []).map(item => Object.assign({}, item, {
        // TODO: 后端候选接口统一返回 branchId 后移除 merchant id 兼容回退。
        branchId: item.branchId || item.id,
        addressText: item.address || item.serviceRegion || '地址待完善',
        distanceText: item.distance === undefined || item.distance === null ? '距离待地图服务接入' : `${item.distance}公里`
      }))
      this.setData({ outlets, outletMatchText: matchText })
    }).catch(error => this.setData({ message: error.message }))
  },
  chooseOutlet(event) { this.setData({ selectedBranchId: event.currentTarget.dataset.id }) },
  assignOutlet() {
    if (!this.data.canAssignBranch) return wx.showToast({ title: '审核完成接口待后端补充', icon: 'none' })
    if (!this.data.selectedBranchId) return wx.showToast({ title: '请选择办理网点', icon: 'none' })
    this.run(assignBranch(this.data.id, this.data.selectedBranchId), '已指派网点', () => {
      wx.redirectTo({ url: '/modules/customer-service/pages/follow-up/index' })
    })
  },
  run(task, title, completed) {
    if (this.data.submitting) return
    this.setData({ submitting: true, message: '' })
    task.then(() => {
      wx.showToast({ title, icon: 'success' })
      this.setData({ submitting: false })
      if (completed) completed()
    }).catch(error => this.setData({ submitting: false, message: error.message }))
  }
})
