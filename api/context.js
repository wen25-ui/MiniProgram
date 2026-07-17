const { merchants, salesmen, demoClient } = require('../mock/users')

function getDemoContext() {
  return {
    merchant: merchants[0],
    salesmen,
    salesman: salesmen[0],
    client: demoClient
  }
}

module.exports = {
  getDemoContext
}
