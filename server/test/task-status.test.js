const test = require('node:test')
const assert = require('node:assert/strict')
const { canTransitionTask } = require('../../domain/task/status')

test('上门任务正常状态链合法', () => {
  const chain = ['PENDING_ACCEPT', 'ACCEPTED', 'WAITING_CONTACT', 'CONTACTED', 'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'WAITING_HOME_SERVICE', 'WAITING_START_CONFIRMATION', 'PROCESSING', 'WAITING_RESULT_UPLOAD', 'COMPLETED']
  chain.slice(0, -1).forEach((status, index) => assert.equal(canTransitionTask(status, chain[index + 1]), true))
})

test('到店任务正常状态链合法', () => {
  const chain = ['PENDING_ACCEPT', 'ACCEPTED', 'WAITING_CONTACT', 'CONTACTED', 'WAITING_TIME_CONFIRMATION', 'TIME_CONFIRMED', 'WAITING_CUSTOMER_ARRIVAL', 'WAITING_START_CONFIRMATION', 'PROCESSING', 'WAITING_RESULT_UPLOAD', 'COMPLETED']
  chain.slice(0, -1).forEach((status, index) => assert.equal(canTransitionTask(status, chain[index + 1]), true))
})

test('联系失败可以重试但不能直接完成', () => {
  assert.equal(canTransitionTask('WAITING_CONTACT', 'CONTACT_FAILED'), true)
  assert.equal(canTransitionTask('CONTACT_FAILED', 'CONTACT_FAILED'), true)
  assert.equal(canTransitionTask('CONTACT_FAILED', 'CONTACTED'), true)
  assert.equal(canTransitionTask('CONTACT_FAILED', 'COMPLETED'), false)
})

test('未联系、未约时、未完成办理不能跳到完成', () => {
  ;['WAITING_CONTACT', 'WAITING_TIME_CONFIRMATION', 'PROCESSING'].forEach(status => {
    assert.equal(canTransitionTask(status, 'COMPLETED'), false)
  })
})

test('上传办理结果后可直接完成，异常结束不可恢复为完成', () => {
  assert.equal(canTransitionTask('WAITING_RESULT_UPLOAD', 'COMPLETED'), true)
  assert.equal(canTransitionTask('ABNORMAL_CLOSED', 'COMPLETED'), false)
})
