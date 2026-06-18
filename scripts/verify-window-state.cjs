const assert = require('assert')
const {
  DEFAULT_WINDOW_SIZE,
  normalizeWindowSize,
} = require('../electron/windowStateManager')

assert.deepStrictEqual(
  normalizeWindowSize({ width: 1500, height: 900 }),
  { width: 1500, height: 900 },
  'valid saved size should be preserved'
)

assert.deepStrictEqual(
  normalizeWindowSize({ width: 500, height: 300 }),
  DEFAULT_WINDOW_SIZE,
  'sizes below the minimum window size should fall back to default'
)

assert.deepStrictEqual(
  normalizeWindowSize(null),
  DEFAULT_WINDOW_SIZE,
  'missing window size should fall back to default'
)

console.log('window state verification passed')
