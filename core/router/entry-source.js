const ENTRY_SOURCE_KEY = 'business_referral_entry_source_v2'
const ENTRY_SOURCE_TTL_MS = 2 * 60 * 60 * 1000
let memorySource = null

function decode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (error) {
    return value || ''
  }
}

function parseKeyValue(value) {
  return decode(value).split('&').reduce((result, item) => {
    const pair = item.split('=')
    if (pair[0] && pair[1]) result[pair[0]] = pair.slice(1).join('=')
    return result
  }, {})
}

function parseEntryOptions(options = {}) {
  const scene = parseKeyValue(options.scene)
  const inviteCode = options.inviteCode || scene.inviteCode || ''

  return {
    inviteCode,
    sourceType: inviteCode ? 'merchant_qr' : '',
    receivedAt: Date.now()
  }
}

function parseScannedEntry(scanResult = {}) {
  const raw = decode(scanResult.path || scanResult.result || '').trim()
  if (!raw) return null

  const queryMatch = raw.match(/[?&]inviteCode=([^&#]+)/i)
  if (queryMatch) return parseEntryOptions({ inviteCode: decode(queryMatch[1]) })

  const sceneMatch = raw.match(/[?&]scene=([^&#]+)/i)
  if (sceneMatch) return parseEntryOptions({ scene: decode(sceneMatch[1]) })

  if (/^[A-Za-z0-9_-]{4,128}$/.test(raw)) return parseEntryOptions({ inviteCode: raw })
  return null
}

function saveEntrySource(source, userId) {
  const value = source && Number.isInteger(userId) && userId > 0
    ? Object.assign({}, source, { userId })
    : source
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(ENTRY_SOURCE_KEY, value)
  } else {
    memorySource = value
  }
}

function getEntrySource(userId) {
  let source
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    source = wx.getStorageSync(ENTRY_SOURCE_KEY) || null
  } else {
    source = memorySource
  }
  const receivedAt = source && new Date(source.receivedAt).getTime()
  if (receivedAt && Date.now() - receivedAt >= ENTRY_SOURCE_TTL_MS) {
    clearEntrySource()
    return null
  }
  if (!source || !userId || !source.userId || source.userId === userId) return source
  return null
}

function clearEntrySource() {
  if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(ENTRY_SOURCE_KEY)
  memorySource = null
}

module.exports = {
  parseEntryOptions,
  parseScannedEntry,
  saveEntrySource,
  getEntrySource,
  clearEntrySource
}
