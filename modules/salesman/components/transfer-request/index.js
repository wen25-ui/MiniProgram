Component({
  properties: {
    request: { type: Object, value: {} },
    operatingId: { type: String, value: '' }
  },
  methods: {
    decide(event) {
      if (this.data.operatingId) return
      this.triggerEvent('decide', {
        transferId: this.data.request.id,
        decision: event.currentTarget.dataset.decision
      })
    }
  }
})
