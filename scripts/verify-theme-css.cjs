const assert = require('assert')
const fs = require('fs')

const css = fs.readFileSync('src/styles/global.css', 'utf-8')

assert(css.includes('.app[data-theme="secure"]'), 'secure theme variables missing')
assert(css.includes('.app[data-theme="compact"]'), 'compact theme variables missing')
assert(css.includes('.app[data-theme="warm"]'), 'warm theme variables missing')
assert(css.includes('.app[data-theme="custom"]'), 'custom theme selector missing')
assert(css.includes('--app-bg'), 'theme background variable missing')
assert(css.includes('--sidebar-bg'), 'sidebar variable missing')
assert(css.includes('--accent'), 'accent variable missing')
assert(css.includes('.theme-select'), 'theme selector styles missing')
assert(css.includes('background: var(--app-bg)'), 'app should use app background variable')
assert(css.includes('background: var(--sidebar-bg)'), 'sidebar should use sidebar variable')

console.log('theme css verification passed')
