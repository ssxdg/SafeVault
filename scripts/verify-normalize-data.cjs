const assert = require('assert')
const { normalizeData } = require('../electron/dataNormalizer')

const input = {
  schemaVersion: 2,
  theme: 'compact',
  tabs: [
    {
      id: 'tab-1',
      name: 'Main',
      accounts: [
        { id: 'a-low', accountName: 'Low', useCount: 1 },
        { id: 'a-high', accountName: 'High', useCount: 7 },
        { id: 'a-tie-1', accountName: 'Tie 1', useCount: 3 },
        { id: 'a-tie-2', accountName: 'Tie 2', useCount: 3 },
      ],
      urls: [
        { id: 'u-missing', name: 'Missing' },
        { id: 'u-high', name: 'High', useCount: 4 },
        { id: 'u-zero', name: 'Zero', useCount: 0 },
      ],
    },
  ],
  notepads: [
    { id: 'note-1', name: 'Note', content: 'hello', createdAt: '', updatedAt: '' },
  ],
  activeNotepadId: 'note-1',
}

const normalized = normalizeData(input)

assert.strictEqual(normalized.schemaVersion, 2)
assert.strictEqual(normalized.theme, 'compact')
assert.deepStrictEqual(
  normalized.tabs[0].accounts.map(item => item.id),
  ['a-high', 'a-tie-1', 'a-tie-2', 'a-low']
)
assert.deepStrictEqual(
  normalized.tabs[0].urls.map(item => item.id),
  ['u-high', 'u-missing', 'u-zero']
)
assert.deepStrictEqual(normalized.notepads[0].content, { ops: [{ insert: 'hello\n' }] })

const invalidTheme = normalizeData({ schemaVersion: 2, theme: 'unknown', tabs: [] })
assert.strictEqual(invalidTheme.theme, 'secure')
assert.strictEqual(invalidTheme.tabs.length, 1)
assert.strictEqual(invalidTheme.activeNotepadId, invalidTheme.notepads[0].id)

const missingData = normalizeData(null)
assert.strictEqual(missingData.theme, 'secure')
assert.strictEqual(missingData.tabs.length, 1)

console.log('normalize-data verification passed')
