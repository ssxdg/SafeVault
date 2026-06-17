const EMPTY_DELTA = { ops: [{ insert: '\n' }] }
const VALID_THEMES = new Set(['secure', 'compact', 'warm'])

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : 'secure'
}

function normalizeNoteContent(content) {
  if (!content) return EMPTY_DELTA
  if (typeof content === 'object' && Array.isArray(content.ops)) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.ops)) return parsed
    } catch {}
    return { ops: [{ insert: `${content}\n` }] }
  }
  return EMPTY_DELTA
}

function normalizeUseCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function stableSortByUseCount(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item: { ...item, useCount: normalizeUseCount(item?.useCount) },
      index,
    }))
    .sort((a, b) => {
      const countDiff = b.item.useCount - a.item.useCount
      return countDiff || a.index - b.index
    })
    .map(({ item }) => item)
}

const defaultData = {
  schemaVersion: 2,
  theme: 'secure',
  tabs: [
    { id: 'default-tab', name: 'Default', accounts: [], urls: [] },
  ],
  notepads: [
    { id: 'default-note', name: 'Untitled', content: EMPTY_DELTA, createdAt: '', updatedAt: '' },
  ],
  activeNotepadId: 'default-note',
}

function normalizeTabs(tabs) {
  const sourceTabs = Array.isArray(tabs) && tabs.length > 0 ? tabs : defaultData.tabs
  return sourceTabs.map((tab, index) => ({
    id: tab.id || `tab-${Date.now()}-${index}`,
    name: tab.name || `Tab ${index + 1}`,
    accounts: stableSortByUseCount(tab.accounts),
    urls: stableSortByUseCount(tab.urls),
  }))
}

function normalizeNotepads(data) {
  if (Array.isArray(data?.notepads) && data.notepads.length > 0) {
    return data.notepads.map((note, index) => ({
      id: note.id || `note-${Date.now()}-${index}`,
      name: note.name || `Note ${index + 1}`,
      content: normalizeNoteContent(note.content),
      createdAt: note.createdAt || '',
      updatedAt: note.updatedAt || '',
    }))
  }

  const legacyText = typeof data?.notes === 'string' ? data.notes : ''
  return [{
    id: 'default-note',
    name: 'Untitled',
    content: normalizeNoteContent(legacyText),
    createdAt: '',
    updatedAt: '',
  }]
}

function normalizeData(data) {
  const source = data && typeof data === 'object' ? data : {}
  const tabs = normalizeTabs(source.tabs)
  const notepads = normalizeNotepads(source)
  const activeNotepadId = notepads.some(note => note.id === source.activeNotepadId)
    ? source.activeNotepadId
    : notepads[0].id

  return {
    schemaVersion: 2,
    theme: normalizeTheme(source.theme),
    tabs,
    notepads,
    activeNotepadId,
  }
}

module.exports = {
  EMPTY_DELTA,
  normalizeData,
  normalizeNoteContent,
  normalizeTheme,
  stableSortByUseCount,
}
