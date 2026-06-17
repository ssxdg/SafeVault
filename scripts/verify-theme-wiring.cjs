const assert = require('assert')
const fs = require('fs')

const appSource = fs.readFileSync('src/App.jsx', 'utf-8')
const titleBarSource = fs.readFileSync('src/components/TitleBar.jsx', 'utf-8')

assert(appSource.includes("theme: 'secure'"), 'default data should include secure theme')
assert(appSource.includes('const setTheme'), 'App should expose setTheme handler')
assert(appSource.includes('data-theme={data.theme ||'), 'app root should apply data-theme')
assert(appSource.includes('onReorderNotepads={reorderNotepads}'), 'App should pass notepad reorder handler')
assert(titleBarSource.includes('THEME_OPTIONS'), 'TitleBar should define theme options')
assert(titleBarSource.includes('onThemeChange'), 'TitleBar should call onThemeChange')

console.log('theme wiring verification passed')
