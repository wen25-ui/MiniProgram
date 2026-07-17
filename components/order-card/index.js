Component({
  properties: {
    order: {
      type: Object,
      value: {}
    },
    showMerchant: {
      type: Boolean,
      value: false
    },
    showSalesman: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onTap() {
      this.triggerEvent('taporder', { id: this.properties.order.id })
    }
  }
})
