const { salesmen } = require('../mock/users')

function getAvailableSalesmen() {
  // 原型期由 mock 数据提供；员工目录接入后替换为受服务端权限控制的接口。
  return salesmen.map(item => ({ id: item.id, name: item.name }))
}

function findSalesman(id) {
  return getAvailableSalesmen().find(item => item.id === id) || null
}

module.exports = {
  getAvailableSalesmen,
  findSalesman
}
