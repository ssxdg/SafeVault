# SafeVault Sort, Notepad Reorder, And Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist usage-based account/URL ordering, add draggable notepad tabs, and add three exported/imported UI themes.

**Architecture:** Move pure data normalization into a testable CommonJS module, then let Electron file IO call that module. React keeps current app state shape, adds `theme`, passes a theme setter to the title bar, and reorders notepads by replacing the `notepads` array. CSS uses root-level variables selected by `data-theme`.

**Tech Stack:** Electron 30, React 18, Vite 5, plain Node verification scripts, CSS variables.

---

## File Structure

- Create `electron/dataNormalizer.js`
  - Owns `normalizeData`, `normalizeNoteContent`, `normalizeTheme`, and stable usage sorting.
  - Has no dependency on Electron APIs, so it can be tested with Node.

- Create `scripts/verify-normalize-data.cjs`
  - Uses Node `assert`.
  - Imports `electron/dataNormalizer.js`.
  - Verifies theme normalization, theme export shape, account sorting, URL sorting, and equal-count stability.

- Modify `electron/fileManager.js`
  - Imports `normalizeData`.
  - Keeps Electron-specific `app`, `dialog`, and filesystem work.
  - Continues exporting `readData`, `writeData`, `exportData`, and `importData`.

- Modify `src/App.jsx`
  - Adds `theme` to default data.
  - Normalizes missing theme in the renderer fallback path.
  - Adds `setTheme` and `reorderNotepads`.
  - Applies `data-theme` to `.app`.
  - Passes `theme` and `onThemeChange` to `TitleBar`.
  - Passes `onReorderNotepads` to `NotesPad`.

- Modify `src/components/TitleBar.jsx`
  - Accepts `theme` and `onThemeChange`.
  - Renders a small theme selector before window control buttons.

- Modify `src/components/NotesPad.jsx`
  - Accepts `onReorderNotepads`.
  - Adds drag start, drag over, drop, and drag end handlers.
  - Flushes pending editor content before reorder.

- Modify `src/styles/global.css`
  - Adds theme variables for `secure`, `compact`, and `warm`.
  - Replaces major hardcoded app colors with variables.
  - Adds theme selector and notepad drag-over styling.

---

### Task 1: Testable Data Normalization

**Files:**
- Create: `electron/dataNormalizer.js`
- Create: `scripts/verify-normalize-data.cjs`
- Modify: `electron/fileManager.js`

- [ ] **Step 1: Write the failing normalization verification script**

Create `scripts/verify-normalize-data.cjs`:

```js
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
```

- [ ] **Step 2: Run the script to verify it fails**

Run:

```powershell
node scripts/verify-normalize-data.cjs
```

Expected:

```text
Error: Cannot find module '../electron/dataNormalizer'
```

- [ ] **Step 3: Create the pure normalization module**

Create `electron/dataNormalizer.js`:

```js
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
```

- [ ] **Step 4: Wire `fileManager.js` to the new module**

In `electron/fileManager.js`, replace the local `normalizNoteContent`, `defaultData`, and `normalizeData` definitions with:

```js
const { normalizeData } = require('./dataNormalizer')
```

Keep the rest of the file unchanged except for ensuring `readData()` returns `normalizeData(null)` in the catch branch:

```js
async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return normalizeData(parsed)
  } catch {
    return normalizeData(null)
  }
}
```

- [ ] **Step 5: Run the verification script to verify it passes**

Run:

```powershell
node scripts/verify-normalize-data.cjs
```

Expected:

```text
normalize-data verification passed
```

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add electron/dataNormalizer.js electron/fileManager.js scripts/verify-normalize-data.cjs
git commit -m "feat: normalize vault data ordering and theme"
```

---

### Task 2: Theme State And Title Bar Selector

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/TitleBar.jsx`
- Create: `scripts/verify-theme-wiring.cjs`

- [ ] **Step 1: Write a failing static check for renderer theme wiring**

Create `scripts/verify-theme-wiring.cjs`:

```js
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
```

- [ ] **Step 2: Run the check to verify it fails**

Run:

```powershell
node scripts/verify-theme-wiring.cjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Add theme data and handlers in `App.jsx`**

In `createDefaultData`, add:

```js
theme: 'secure',
```

In the load effect, after notepad normalization and before `setData(loaded)`, add:

```js
if (!['secure', 'compact', 'warm'].includes(loaded.theme)) {
  loaded.theme = 'secure'
}
```

Add a handler near `reorderTabs`:

```js
const setTheme = useCallback((theme) => {
  if (!['secure', 'compact', 'warm'].includes(theme)) return
  updateData({ ...data, theme })
}, [data, updateData])
```

Add notepad reorder handler near other notepad handlers:

```js
const reorderNotepads = useCallback((newNotepads) => {
  setData(prev => {
    const nextActiveId = newNotepads.some(note => note.id === prev.activeNotepadId)
      ? prev.activeNotepadId
      : newNotepads[0]?.id || null
    const newData = { ...prev, notepads: newNotepads, activeNotepadId: nextActiveId }
    scheduleSave(newData)
    return newData
  })
}, [scheduleSave])
```

Change the root app div:

```jsx
<div className="app" data-theme={data.theme || 'secure'}>
```

Change the title bar call:

```jsx
<TitleBar theme={data.theme || 'secure'} onThemeChange={setTheme} />
```

Pass the reorder handler to `NotesPad`:

```jsx
onReorderNotepads={reorderNotepads}
```

- [ ] **Step 4: Add theme selector in `TitleBar.jsx`**

Add above `function TitleBar`:

```js
const THEME_OPTIONS = [
  { value: 'secure', label: 'Secure' },
  { value: 'compact', label: 'Compact' },
  { value: 'warm', label: 'Warm' },
]
```

Change the component signature:

```js
function TitleBar({ theme = 'secure', onThemeChange }) {
```

Inside `.titlebar-controls`, before the always-on-top button, add:

```jsx
<select
  className="theme-select"
  value={theme}
  onChange={(event) => onThemeChange?.(event.target.value)}
  title="Theme"
>
  {THEME_OPTIONS.map(option => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>
```

- [ ] **Step 5: Run the static check**

Run:

```powershell
node scripts/verify-theme-wiring.cjs
```

Expected:

```text
theme wiring verification passed
```

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add src/App.jsx src/components/TitleBar.jsx scripts/verify-theme-wiring.cjs
git commit -m "feat: add vault theme selector"
```

---

### Task 3: Draggable Notepad Tabs

**Files:**
- Modify: `src/components/NotesPad.jsx`
- Modify: `src/styles/global.css`
- Create: `scripts/verify-notepad-reorder.cjs`

- [ ] **Step 1: Write a failing static check for notepad drag wiring**

Create `scripts/verify-notepad-reorder.cjs`:

```js
const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('src/components/NotesPad.jsx', 'utf-8')
const css = fs.readFileSync('src/styles/global.css', 'utf-8')

assert(source.includes('onReorderNotepads'), 'NotesPad should accept reorder callback')
assert(source.includes('handleDragStart'), 'NotesPad should define drag start handler')
assert(source.includes('handleDrop'), 'NotesPad should define drop handler')
assert(source.includes('flushPendingSave()'), 'NotesPad should flush pending save before reorder')
assert(source.includes('draggable={editingId !== note.id}'), 'notepad tabs should be draggable outside rename mode')
assert(css.includes('.notepad-tab.drag-over'), 'drag-over style should exist')

console.log('notepad reorder verification passed')
```

- [ ] **Step 2: Run the check to verify it fails**

Run:

```powershell
node scripts/verify-notepad-reorder.cjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Add drag state and handlers in `NotesPad.jsx`**

Add `onReorderNotepads` to the prop list:

```js
onReorderNotepads,
```

Add state and ref next to rename state:

```js
const [dragOverId, setDragOverId] = useState(null)
const dragIdRef = useRef(null)
```

Add handlers before `handleDelete`:

```js
const handleDragStart = (e, noteId) => {
  if (editingId === noteId) return
  dragIdRef.current = noteId
  e.dataTransfer.effectAllowed = 'move'
}

const handleDragOver = (e, noteId) => {
  e.preventDefault()
  if (dragIdRef.current && dragIdRef.current !== noteId) {
    setDragOverId(noteId)
  }
}

const handleDrop = (e, targetId) => {
  e.preventDefault()
  const sourceId = dragIdRef.current
  dragIdRef.current = null
  setDragOverId(null)
  if (!sourceId || sourceId === targetId) return

  flushPendingSave()
  const nextNotepads = [...notepads]
  const fromIndex = nextNotepads.findIndex(note => note.id === sourceId)
  const toIndex = nextNotepads.findIndex(note => note.id === targetId)
  if (fromIndex === -1 || toIndex === -1) return

  const [moved] = nextNotepads.splice(fromIndex, 1)
  nextNotepads.splice(toIndex, 0, moved)
  onReorderNotepads?.(nextNotepads)
}

const handleDragEnd = () => {
  dragIdRef.current = null
  setDragOverId(null)
}
```

Update the notepad tab `className`:

```jsx
className={`notepad-tab${activeNote?.id === note.id ? ' active' : ''}${dragOverId === note.id ? ' drag-over' : ''}`}
```

Add drag props to the tab div:

```jsx
draggable={editingId !== note.id}
onDragStart={(e) => handleDragStart(e, note.id)}
onDragOver={(e) => handleDragOver(e, note.id)}
onDrop={(e) => handleDrop(e, note.id)}
onDragEnd={handleDragEnd}
```

- [ ] **Step 4: Add CSS drag feedback**

Add near the `.notepad-tab.active` rule in `src/styles/global.css`:

```css
.notepad-tab.drag-over {
  box-shadow: inset 3px 0 0 var(--accent), inset 0 -2px 0 var(--accent);
  background: var(--active-bg);
}
```

If variables are not introduced yet, temporarily use:

```css
.notepad-tab.drag-over {
  box-shadow: inset 3px 0 0 #2563EB, inset 0 -2px 0 #2563EB;
  background: #EFF6FF;
}
```

Task 4 will replace these hardcoded values with variables.

- [ ] **Step 5: Run the static check**

Run:

```powershell
node scripts/verify-notepad-reorder.cjs
```

Expected:

```text
notepad reorder verification passed
```

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git add src/components/NotesPad.jsx src/styles/global.css scripts/verify-notepad-reorder.cjs
git commit -m "feat: add notepad tab reordering"
```

---

### Task 4: CSS Theme Variables And Visual Polish

**Files:**
- Modify: `src/styles/global.css`
- Create: `scripts/verify-theme-css.cjs`

- [ ] **Step 1: Write a failing static check for theme CSS**

Create `scripts/verify-theme-css.cjs`:

```js
const assert = require('assert')
const fs = require('fs')

const css = fs.readFileSync('src/styles/global.css', 'utf-8')

assert(css.includes('.app[data-theme="secure"]'), 'secure theme variables missing')
assert(css.includes('.app[data-theme="compact"]'), 'compact theme variables missing')
assert(css.includes('.app[data-theme="warm"]'), 'warm theme variables missing')
assert(css.includes('--app-bg'), 'theme background variable missing')
assert(css.includes('--sidebar-bg'), 'sidebar variable missing')
assert(css.includes('--accent'), 'accent variable missing')
assert(css.includes('.theme-select'), 'theme selector styles missing')
assert(css.includes('background: var(--app-bg)'), 'app should use app background variable')
assert(css.includes('background: var(--sidebar-bg)'), 'sidebar should use sidebar variable')

console.log('theme css verification passed')
```

- [ ] **Step 2: Run the check to verify it fails**

Run:

```powershell
node scripts/verify-theme-css.cjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 3: Add theme variables near the top of CSS**

After the scrollbar rules, add:

```css
.app {
  --app-bg: #F7FBFA;
  --surface: #FFFFFF;
  --surface-muted: #EEF7F5;
  --sidebar-bg: #102C29;
  --sidebar-hover: #17433E;
  --sidebar-active: #17433E;
  --titlebar-bg: #102C29;
  --text: #173F3A;
  --text-muted: #5F7974;
  --border: #D8E8E5;
  --accent: #0D9488;
  --accent-strong: #0F766E;
  --active-bg: #E3F6F2;
  --danger: #DC2626;
  --success: #16A34A;
  --warning: #D97706;
  --shadow-sm: 0 1px 2px rgba(16, 44, 41, 0.08);
  --shadow-md: 0 8px 20px rgba(16, 44, 41, 0.08);
}

.app[data-theme="compact"] {
  --app-bg: #F6F7FB;
  --surface: #FFFFFF;
  --surface-muted: #EEF2F7;
  --sidebar-bg: #182033;
  --sidebar-hover: #283450;
  --sidebar-active: #283450;
  --titlebar-bg: #182033;
  --text: #172033;
  --text-muted: #5C6678;
  --border: #DCE2EE;
  --accent: #2563EB;
  --accent-strong: #1D4ED8;
  --active-bg: #EAF1FF;
  --shadow-sm: 0 1px 1px rgba(24, 32, 51, 0.08);
  --shadow-md: 0 4px 12px rgba(24, 32, 51, 0.08);
}

.app[data-theme="warm"] {
  --app-bg: #FCFBF7;
  --surface: #FFFDF8;
  --surface-muted: #F8F0E2;
  --sidebar-bg: #2D2419;
  --sidebar-hover: #433424;
  --sidebar-active: #433424;
  --titlebar-bg: #2D2419;
  --text: #332819;
  --text-muted: #7A6A55;
  --border: #E7DCC7;
  --accent: #D97706;
  --accent-strong: #B45309;
  --active-bg: #FFF4DC;
  --shadow-sm: 0 1px 2px rgba(45, 36, 25, 0.08);
  --shadow-md: 0 8px 20px rgba(45, 36, 25, 0.08);
}
```

- [ ] **Step 4: Replace major hardcoded colors with variables**

Make these targeted replacements:

```css
.app { background: var(--app-bg); }
.titlebar { background: var(--titlebar-bg); }
.sidebar { background: var(--sidebar-bg); }
.sidebar-tab:hover { background: var(--sidebar-hover); }
.sidebar-tab.active { background: var(--sidebar-active); border-left-color: var(--accent); }
.content-area { background: var(--app-bg); }
.content-header { background: color-mix(in srgb, var(--surface) 94%, transparent); border-bottom-color: var(--border); }
.search-input { border-color: var(--border); background: var(--surface-muted); color: var(--text); }
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
.view-toggle { background: var(--surface-muted); border-color: var(--border); }
.view-btn.active { color: var(--accent); box-shadow: var(--shadow-sm); }
.btn-primary { background: var(--accent); box-shadow: var(--shadow-sm); }
.btn-primary:hover { background: var(--accent-strong); box-shadow: var(--shadow-md); }
.btn-secondary { background: var(--surface); border-color: var(--border); color: var(--accent); }
.card { background: var(--surface); border-color: var(--border); box-shadow: var(--shadow-sm); border-radius: 8px; }
.card:hover { border-color: var(--accent); box-shadow: var(--shadow-md); transform: translateY(-1px); }
.card-title { color: var(--text); }
.row-value { color: var(--text); }
.row-value.url-link { color: var(--accent); }
.notepad { background: var(--app-bg); }
.notepad-tabbar { background: var(--surface); border-bottom-color: var(--border); }
.notepad-tab { background: var(--surface-muted); border-right-color: var(--border); color: var(--text-muted); }
.notepad-tab:hover { background: var(--active-bg); color: var(--text); }
.notepad-tab.active { background: var(--surface); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
.notepad-add-tab { background: var(--surface-muted); border-right-color: var(--border); color: var(--text-muted); }
.notepad-add-tab:hover { background: var(--active-bg); color: var(--accent); }
.notepad-editor-wrap, .notepad-editor-wrap .ql-editor { background: var(--app-bg); color: var(--text); }
.notepad-editor-wrap .ql-toolbar.ql-snow { background: var(--surface); border-bottom-color: var(--border); }
.bottombar { background: var(--surface); border-top-color: var(--border); }
```

- [ ] **Step 5: Add theme selector styles**

Add near title bar styles:

```css
.theme-select {
  height: 28px;
  min-width: 92px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #E2E8F0;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}

.theme-select:hover,
.theme-select:focus {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.14);
}

.theme-select option {
  color: #111827;
  background: #FFFFFF;
}
```

- [ ] **Step 6: Run the CSS check**

Run:

```powershell
node scripts/verify-theme-css.cjs
```

Expected:

```text
theme css verification passed
```

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add src/styles/global.css scripts/verify-theme-css.cjs
git commit -m "style: add safevault themes"
```

---

### Task 5: Build And End-To-End Verification

**Files:**
- Modify only if verification exposes a bug.

- [ ] **Step 1: Run all verification scripts**

Run:

```powershell
node scripts/verify-normalize-data.cjs
node scripts/verify-theme-wiring.cjs
node scripts/verify-notepad-reorder.cjs
node scripts/verify-theme-css.cjs
```

Expected:

```text
normalize-data verification passed
theme wiring verification passed
notepad reorder verification passed
theme css verification passed
```

- [ ] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected:

```text
vite build
...
electron-builder
...
```

If electron-builder fails because of existing Windows signing, symlink, or packaging environment issues, record the exact error and run this fallback to verify renderer compilation:

```powershell
npx vite build
```

- [ ] **Step 3: Start dev app for manual verification**

Run:

```powershell
npm run dev
```

Expected:

```text
Local: http://localhost:7331/
```

Manual checks:

- Open the app.
- Switch theme to Compact and Warm, then close and reopen; selected theme should persist.
- Export data and inspect the JSON; it should contain `"theme": "compact"` or `"theme": "warm"`.
- Use a sample data file with different `useCount` values; after restart, higher counts appear first.
- Drag notepad tabs; order should change and remain after restart.
- Edit a notepad, immediately drag the tab, then return to it; content should remain.

- [ ] **Step 4: Commit verification fixes only if needed**

If Task 5 required code changes, run:

```powershell
git add <changed-files>
git commit -m "fix: complete safevault optimization verification"
```

If no code changes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Account and URL restart sorting: Task 1.
- Equal-count stable order: Task 1 verification.
- Notepad drag ordering: Task 3.
- Three switchable themes: Tasks 2 and 4.
- Theme import/export persistence: Task 1 normalizes and preserves top-level `theme`; Task 2 saves renderer state into app data.
- UI polish: Task 4.
- Verification: Task 5.

Forbidden-token scan:

- No open-ended implementation steps are intentionally left in this plan.

Type consistency:

- Theme values are `secure`, `compact`, and `warm` in data normalization, renderer state, title bar selector, and CSS selectors.
- Notepad reorder callback is consistently named `onReorderNotepads` in `App.jsx` and `NotesPad.jsx`.
