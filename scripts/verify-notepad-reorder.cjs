const assert = require('assert')
const fs = require('fs')

const source = fs.readFileSync('src/components/NotesPad.jsx', 'utf-8')
const css = fs.readFileSync('src/styles/global.css', 'utf-8')

assert(source.includes('onReorderNotepads'), 'NotesPad should accept reorder callback')
assert(source.includes('handleDragStart'), 'NotesPad should define drag start handler')
assert(source.includes('handleDrop'), 'NotesPad should define drop handler')
assert(source.includes('flushPendingSave()'), 'NotesPad should flush pending save before reorder')
assert(source.includes('draggable={editingId !== note.id}'), 'notepad tabs should be draggable outside rename mode')
assert(source.includes('quill.keyboard.addBinding({ key: 9 }'), 'NotesPad should bind Tab to editor indentation')
assert(css.includes('.notepad-tab.drag-over'), 'drag-over style should exist')

console.log('notepad reorder verification passed')
