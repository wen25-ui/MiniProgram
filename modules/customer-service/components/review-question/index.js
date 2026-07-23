function optionValue(option) {
  return typeof option === 'object' ? option.value : option
}

Component({
  properties: {
    question: { type: Object, value: {} },
    index: { type: Number, value: 0 },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    chooseSingle(event) {
      if (this.data.disabled) return
      this.triggerEvent('answer', { questionId: this.data.question.id, answer: event.currentTarget.dataset.value })
    },
    toggleMultiple(event) {
      if (this.data.disabled) return
      const value = event.currentTarget.dataset.value
      const current = Array.isArray(this.data.question.answer) ? this.data.question.answer : []
      const answer = current.includes(value) ? current.filter(item => item !== value) : current.concat(value)
      this.triggerEvent('answer', { questionId: this.data.question.id, answer })
    },
    finishText(event) {
      if (this.data.disabled) return
      this.triggerEvent('answer', { questionId: this.data.question.id, answer: event.detail.value.trim() })
    },
    isSelected(option) {
      const value = optionValue(option)
      return Array.isArray(this.data.question.answer)
        ? this.data.question.answer.includes(value)
        : this.data.question.answer === value
    }
  }
})
