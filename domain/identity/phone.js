function normalizePhone(phone) {
  return String(phone || '').replace(/\s/g, '')
}

function validateMainlandMobile(phone) {
  return /^1\d{10}$/.test(normalizePhone(phone))
}

module.exports = {
  normalizePhone,
  validateMainlandMobile
}
