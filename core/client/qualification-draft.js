const DRAFT_KEY = 'business_referral_qualification_draft_v1'

function saveQualificationDraft(draft) {
  if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(DRAFT_KEY, draft)
}

function getQualificationDraft(userId, inviteCode) {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return null
  const draft = wx.getStorageSync(DRAFT_KEY) || null
  if (!draft || draft.userId !== userId || draft.inviteCode !== inviteCode) return null
  return draft
}

function clearQualificationDraft() {
  if (typeof wx !== 'undefined' && wx.removeStorageSync) wx.removeStorageSync(DRAFT_KEY)
}

module.exports = { saveQualificationDraft, getQualificationDraft, clearQualificationDraft }
