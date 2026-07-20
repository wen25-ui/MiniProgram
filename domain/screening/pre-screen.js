const { ORDER_STATUS } = require('../order/status')

const EXPENSE_TIERS = Object.freeze([
  { value: 'UNDER_79', label: '低于 79 元' },
  { value: 'FROM_79', label: '79 元以上' },
  { value: 'FROM_150', label: '150 元以上' },
  { value: 'FROM_250', label: '250 元以上' },
  { value: 'FROM_400', label: '400 元以上' }
])

const LOCAL_OPTIONS = Object.freeze([
  { value: 'LOCAL_NUMBER', label: '我当前使用本地号码' },
  { value: 'ACCEPT_LOCAL_CARD', label: '我接受新开卡' }
])

function isExpenseTier(value) {
  return EXPENSE_TIERS.some(item => item.value === value)
}

function isLocalOption(value) {
  return LOCAL_OPTIONS.some(item => item.value === value)
}

function evaluatePreScreen(application) {
  const reasons = []
  if (!application || !application.phone) reasons.push('请先完成手机号认证')
  if (!application || !isLocalOption(application.localOption)) reasons.push('请选择本地办理情况')
  if (!application || !isExpenseTier(application.expenseTier)) reasons.push('请选择个人（全家）套餐档位')
  if (!application || !Array.isArray(application.commitments) || application.commitments.length !== 3 || !application.commitments.every(Boolean)) reasons.push('请确认三年履约限制')

  return {
    passed: reasons.length === 0,
    status: reasons.length === 0 ? ORDER_STATUS.PENDING_REVIEW : ORDER_STATUS.PRE_SCREEN_REJECTED,
    reasons,
    // 返现映射与完整淘汰规则尚未确认，不能由前端给出金额或最终资格结论。
    expectedRefund: null,
    ruleVersion: 'pending-confirmation'
  }
}

module.exports = {
  EXPENSE_TIERS,
  LOCAL_OPTIONS,
  isExpenseTier,
  isLocalOption,
  evaluatePreScreen
}
