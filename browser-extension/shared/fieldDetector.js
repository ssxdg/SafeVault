(function exposeFieldDetector(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.SafeVaultFieldDetector = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFieldDetector() {
  function isUsable(input) {
    const type = String(input?.type || 'text').toLowerCase()
    if (!input || input.disabled || input.hidden || type === 'hidden') return false
    if (typeof input.getAttribute === 'function' && input.getAttribute('aria-hidden') === 'true') return false
    if (typeof getComputedStyle === 'function' && input?.nodeType === 1) {
      const style = getComputedStyle(input)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
    }
    return true
  }

  function getFormKey(input, index) {
    if (input.form) return input.form
    if (input.formId) return `form:${input.formId}`
    return 'unowned'
  }

  function usernameScore(input) {
    if (!isUsable(input)) return -1
    const type = String(input.type || 'text').toLowerCase()
    if (!['text', 'email', 'tel'].includes(type)) return -1
    const autocomplete = String(input.autocomplete || '').toLowerCase()
    const identity = `${input.name || ''} ${input.id || ''}`.toLowerCase()
    if (autocomplete.includes('one-time-code') || /(^|\s)(otp|totp|code|pin)($|\s)/.test(identity)) return -1
    if (autocomplete.includes('username')) return 100
    if (type === 'email' || autocomplete.includes('email')) return 80
    if (/user|login|account|email|phone|mobile/.test(identity)) return 60
    if (/search|query|keyword/.test(identity)) return -1
    return 10
  }

  function passwordScore(input) {
    if (!isUsable(input) || String(input.type || '').toLowerCase() !== 'password') return -1
    const autocomplete = String(input.autocomplete || '').toLowerCase()
    if (autocomplete.includes('current-password')) return 100
    if (autocomplete.includes('new-password')) return 20
    return 70
  }

  function isNewPassword(input) {
    if (!isUsable(input) || String(input.type || '').toLowerCase() !== 'password') return false
    const autocomplete = String(input.autocomplete || '').toLowerCase()
    const identity = `${input.name || ''} ${input.id || ''}`.toLowerCase()
    return autocomplete.includes('new-password') || /new|confirm|repeat/.test(identity)
  }

  function detectLoginForms(source) {
    const inputs = Array.from(source || [])
    const groups = new Map()
    inputs.forEach((input, index) => {
      const key = getFormKey(input, index)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(input)
    })

    return [...groups.entries()].map(([formKey, fields]) => {
      const usernameField = fields
        .map(field => ({ field, score: usernameScore(field) }))
        .filter(item => item.score >= 0)
        .sort((left, right) => right.score - left.score)[0]?.field || null
      const passwordFields = fields
        .map(field => ({ field, score: passwordScore(field) }))
        .filter(item => item.score >= 0)
        .sort((left, right) => right.score - left.score)
        .map(item => item.field)
      const newPasswordFields = passwordFields.filter(isNewPassword)
      const passwordField = passwordFields.find(field => !isNewPassword(field)) || null
      let kind = 'unknown'
      if ((passwordField && newPasswordFields.length > 0) || newPasswordFields.length >= 2) kind = 'password-change'
      else if (usernameField && passwordField) kind = 'login'
      else if (usernameField) kind = 'username-step'
      else if (passwordField) kind = 'password-step'
      return { formKey, kind, usernameField, passwordField, newPasswordFields }
    }).filter(form => form.kind !== 'unknown')
  }

  return { detectLoginForms }
})
