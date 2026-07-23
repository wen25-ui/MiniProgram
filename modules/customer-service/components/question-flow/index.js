function hasAnswer(question) {
  if (Array.isArray(question.answer)) return question.answer.length > 0
  return String(question.answer === undefined || question.answer === null ? '' : question.answer).trim() !== ''
}

function answerMatches(answer, expected) {
  if (Array.isArray(answer)) return answer.map(String).includes(String(expected))
  return String(answer) === String(expected)
}

Component({
  properties: {
    questions: { type: Array, value: [] },
    disabled: { type: Boolean, value: false }
  },
  data: { visibleQuestions: [] },
  observers: {
    questions() { this.refresh() }
  },
  methods: {
    refresh() {
      const questions = this.data.questions || []
      if (!questions.length) {
        this.setData({ visibleQuestions: [] })
        return this.triggerEvent('progress', { complete: true, visibleCount: 0 })
      }
      const visibleIds = new Set([questions[0].id])
      questions.forEach((question, index) => {
        if (index === 0) return
        if (question.parentId || question.parent_id) {
          const parentId = question.parentId || question.parent_id
          const expected = question.parentAnswer === undefined ? question.parent_answer : question.parentAnswer
          const parent = questions.find(item => String(item.id) === String(parentId))
          if (parent && visibleIds.has(parent.id) && hasAnswer(parent) && answerMatches(parent.answer, expected)) visibleIds.add(question.id)
        } else {
          const previous = questions[index - 1]
          if (visibleIds.has(previous.id) && hasAnswer(previous)) visibleIds.add(question.id)
        }
      })
      const visibleQuestions = questions.filter(question => visibleIds.has(question.id)).map(question => Object.assign({}, question, {
        answered: hasAnswer(question),
        options: (question.options || []).map(option => Object.assign({}, option, {
          selected: Array.isArray(question.answer) && question.answer.includes(option.value)
        }))
      }))
      const complete = visibleQuestions.every(hasAnswer)
      this.setData({ visibleQuestions })
      this.triggerEvent('progress', { complete, visibleCount: visibleQuestions.length })
    },
    answer(event) { this.triggerEvent('answer', event.detail) }
  }
})
