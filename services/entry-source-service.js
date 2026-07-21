const { getSession } = require('../core/auth/session')
const { getEntrySource, saveEntrySource, clearEntrySource } = require('../core/router/entry-source')
const { request } = require('./api-client')

function requireSession() {
  const session = getSession()
  if (!session || !session.token || !session.userId) throw new Error('请先登录')
  return session
}

function bindEntrySource(source) {
  const session = requireSession()
  return request('/v1/client/entry-source', {
    method: 'POST', session, data: { inviteCode: source.inviteCode }
  }).then(result => {
    if (result.source) saveEntrySource(result.source, session.userId)
    return result
  })
}

function fetchEntrySource() {
  const session = requireSession()
  const local = getEntrySource(session.userId)
  // An unbound value can come from opening/scanning the merchant QR before login.
  // User-bound cache is only a mirror; the server remains the cross-device source of truth.
  if (local && local.inviteCode && !local.userId) {
    return bindEntrySource(local).catch(() => request('/v1/client/entry-source', { session }))
  }
  return request('/v1/client/entry-source', { session }).then(result => {
    if (result.source) saveEntrySource(result.source, session.userId)
    else clearEntrySource()
    return result
  })
}

module.exports = { fetchEntrySource, bindEntrySource }
