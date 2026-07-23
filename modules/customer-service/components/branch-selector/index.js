Component({
  properties: {
    branches: { type: Array, value: [] },
    selectedId: { type: null, value: '' },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    select(event) {
      if (this.data.disabled) return
      this.triggerEvent('select', { branchId: event.currentTarget.dataset.id })
    },
    confirm() {
      if (this.data.disabled || !this.data.selectedId) return
      this.triggerEvent('confirm', { branchId: this.data.selectedId })
    }
  }
})
