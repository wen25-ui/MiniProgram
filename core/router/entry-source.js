const ENTRY_SOURCE_KEY = 'business_referral_entry_source_v2'
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

function saveEntrySource(source) {
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(ENTRY_SOURCE_KEY, source)
  } else {
    memorySource = source
  }
}

function getEntrySource() {
  if (typeof wx !== 'undefined' && wx.getStorageSync) {
    return wx.getStorageSync(ENTRY_SOURCE_KEY) || null
  }
  return memorySource
}

module.exports = {
  parseEntryOptions,
  parseScannedEntry,
  saveEntrySource,
  getEntrySource
}
