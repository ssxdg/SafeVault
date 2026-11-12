const { randomUUID, createHash } = require('crypto')
const { repairDuplicateIds } = require('./dataNormalizer')
const Delta = require('quill-delta')

// 规范化对象键和 Quill 相邻文本段；格式、嵌入对象仍属于正文的一部分。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonical(value[key])
  }
  if (Array.isArray(result.ops)) {
    result.ops = result.ops.reduce((ops, operation) => {
      const op = { ...operation }
      if (op.attributes && !Object.keys(op.attributes).length) delete op.attributes
      const previous = ops[ops.length - 1]
      if (previous && typeof previous.insert === 'string' && typeof op.insert === 'string'
        && JSON.stringify(previous.attributes) === JSON.stringify(op.attributes)) previous.insert += op.insert
      else ops.push(op)
      return ops
    }, [])
  }
  return result
}

function contentEqual(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

function businessFields(item) {
  if (!item) return null
  const { createdAt, updatedAt, useCount, ...fields } = item
  return fields
}

function sameItem(left, right) {
  return contentEqual(businessFields(left), businessFields(right))
}

// 在共同基线上比较富文本操作；不同位置的修改可组合，同位置不同正文/格式才交给用户。
function mergeNoteContent(base, local, remote) {
  if (![base, local, remote].every(content => Array.isArray(content?.ops))) return null
  try {
    const origin = new Delta(base.ops)
    const plainText = base.ops.map(op => typeof op.insert === 'string' ? op.insert : '\uFFFC').join('')
    const blockFormats = ['header', 'list', 'blockquote', 'code-block', 'table']
    const localChange = origin.diff(new Delta(local.ops))
    const remoteChange = origin.diff(new Delta(remote.ops))
    const ranges = change => {
      let offset = 0
      const result = []
      for (const op of change.ops) {
        if (op.insert !== undefined) result.push({ start: offset, end: offset, kind: 'insert', op })
        else if (typeof op.delete === 'number') {
          result.push({ start: offset, end: offset + op.delete, kind: 'delete', op })
          offset += op.delete
        } else if (typeof op.retain === 'number') {
          if (op.attributes) {
            const restrictive = Boolean(op.attributes['code-block'])
            // 代码块作用于整行，可能移除该行的图片或行内格式，范围必须覆盖整段而非只有换行符。
            const start = restrictive ? (offset === 0 ? 0 : plainText.lastIndexOf('\n', offset - 1) + 1) : offset
            const lineEnd = restrictive ? plainText.indexOf('\n', offset + op.retain - 1) : -1
            const end = restrictive ? (lineEnd < 0 ? plainText.length : lineEnd + 1) : offset + op.retain
            result.push({ start, end, kind: 'format', restrictive, op })
          }
          offset += op.retain
        } else return null
      }
      return result
    }
    const localRanges = ranges(localChange)
    const remoteRanges = ranges(remoteChange)
    if (!localRanges || !remoteRanges) return null
    const sharedInserts = new Set()
    for (const l of localRanges) {
      for (const r of remoteRanges) {
        if (l.kind === 'insert' && r.kind === 'insert') {
          if (l.start !== r.start) continue
          if (!contentEqual(l.op, r.op)) return null
          sharedInserts.add(r.op)
          continue
        }
        const overlaps = l.kind === 'insert' ? (r.restrictive ? l.start >= r.start : l.start > r.start) && l.start < r.end
          : r.kind === 'insert' ? (l.restrictive ? r.start >= l.start : r.start > l.start) && r.start < l.end
            : Math.max(l.start, r.start) < Math.min(l.end, r.end)
        if (!overlaps) continue
        if (l.kind === 'format' && r.kind === 'format') {
          if (l.restrictive || r.restrictive) {
            if (contentEqual(l.op, r.op)) continue
            return null
          }
          // 标题、列表、引用、表格等主段落格式互斥；Quill 会在显示时丢弃其中一种。
          const localBlock = blockFormats.find(key => l.op.attributes[key])
          const remoteBlock = blockFormats.find(key => r.op.attributes[key])
          if (localBlock && remoteBlock && localBlock !== remoteBlock) return null
          const clashes = Object.keys(l.op.attributes).some(key => Object.hasOwn(r.op.attributes, key)
            && !contentEqual(l.op.attributes[key], r.op.attributes[key]))
          if (!clashes) continue
        }
        if (l.kind === 'delete' && r.kind === 'delete' && l.start === r.start && l.end === r.end) continue
        return null
      }
    }
    // 同一新增片段双方都已有时只保留一份，其余远端操作转换到本地修改后的坐标。
    const remainingRemote = new Delta(remoteChange.ops.filter(op => !sharedInserts.has(op)))
    const merged = origin.compose(localChange).compose(localChange.transform(remainingRemote, true))
    // 插入或删除换行也会改变段落归属，最终检查必须覆盖这类不带格式 retain 的结构变化。
    const lineAttributes = new Set([...blockFormats, 'align', 'direction', 'indent'])
    let unsupportedInCode = false
    for (const op of merged.ops) {
      if (typeof op.insert !== 'string') { unsupportedInCode = true; continue }
      const parts = op.insert.split('\n')
      for (let index = 0; index < parts.length; index++) {
        if (parts[index].length && Object.entries(op.attributes || {}).some(([key, value]) =>
          !lineAttributes.has(key) && value !== null && value !== false
        )) unsupportedInCode = true
        if (index === parts.length - 1) continue
        const attributes = op.attributes || {}
        if (blockFormats.filter(key => attributes[key]).length > 1) return null
        if (attributes['code-block'] && unsupportedInCode) return null
        unsupportedInCode = false
      }
    }
    return { ops: merged.ops }
  } catch {
    // 无法安全比较的旧格式或嵌入对象按冲突处理，保留两个原始版本供选择。
    return null
  }
}

const itemKey = item => `${item.type}:${item.id}`
const fingerprint = item => createHash('sha256').update(JSON.stringify(canonical(businessFields(item)))).digest('hex')

function flatten(data) {
  // 本地、远端和历史基线均可能来自旧导入，比较前统一修复，绝不以 Map 覆盖重复条目。
  const source = repairDuplicateIds(data)
  const records = []
  for (const tab of source?.tabs || []) {
    const { accounts, urls, ...fields } = tab
    records.push({ ...fields, type: 'tab' })
    for (const account of accounts || []) records.push({ ...account, type: 'account', parentId: tab.id })
    for (const url of urls || []) records.push({ ...url, type: 'url', parentId: tab.id })
  }
  for (const note of source?.notepads || []) records.push({ ...note, type: 'note' })
  const keys = records.map(itemKey)
  if (new Set(keys).size !== keys.length) throw new Error('数据存在重复 ID，请先通过文件备份核对，已停止自动合并。')
  return records
}

// 旧版导入曾重新生成 ID；仅在名称匹配唯一时建立别名，多个同名项全部保留。
function alignLegacyIds(local, remote, base) {
  const identity = item => JSON.stringify([item.type, item.parentId || '', item.name ?? item.accountName])
  const known = new Set(base.map(itemKey))
  function align(source, target, type) {
    for (const item of source.filter(record => record.type === type)) {
      if (target.some(record => itemKey(record) === itemKey(item))) continue
      const matches = target.filter(record => identity(record) === identity(item))
      if (matches.length !== 1 || source.filter(record => identity(record) === identity(item)).length !== 1) continue
      const other = matches[0]
      if (source.some(record => itemKey(record) === itemKey(other))) continue
      if (known.has(itemKey(item)) && known.has(itemKey(other))) continue
      // 基线 ID 优先，避免旧版 ID 被误当成“删除旧条目并新建条目”。
      const change = known.has(itemKey(item)) ? other : item
      const collection = change === item ? source : target
      const oldId = change.id
      change.id = change === item ? other.id : item.id
      if (type === 'tab') {
        for (const child of collection) if (child.parentId === oldId) child.parentId = change.id
      }
    }
  }
  for (const type of ['tab', 'note', 'account', 'url']) {
    align(local, base, type)
    align(remote, base, type)
    align(remote, local, type)
  }
}

function mergeVaultData(local, remote, base = null, resolutions = {}) {
  const localItems = flatten(local)
  const remoteItems = flatten(remote)
  const baseItems = flatten(base)
  alignLegacyIds(localItems, remoteItems, baseItems)
  const localMap = new Map(localItems.map(item => [itemKey(item), item]))
  const remoteMap = new Map(remoteItems.map(item => [itemKey(item), item]))
  const baseMap = new Map(baseItems.map(item => [itemKey(item), item]))
  const tombstones = new Map()
  for (const data of [base, local, remote]) {
    for (const tombstone of data?.syncTombstones || []) tombstones.set(itemKey(tombstone), { ...tombstone })
  }
  const merged = []
  const conflicts = []
  const stats = { skipped: 0, added: 0, updated: 0, deleted: 0 }
  const keys = new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()])
  const labels = { note: '记事本', account: '账号', url: '网址', tab: '分类' }
  for (const key of keys) {
    const l = localMap.get(key)
    const r = remoteMap.get(key)
    const b = baseMap.get(key)
    const tombstone = tombstones.get(key)
    let value = l || r
    let conflict = false
    if (l && r && sameItem(l, r)) {
      value = { ...l, useCount: Math.max(l.useCount || 0, r.useCount || 0) }
      stats.skipped++
    } else if (!l || !r) {
      const survivor = l || r
      if (b || tombstone) {
        if (!survivor || (b ? sameItem(survivor, b) : tombstone.hash === fingerprint(survivor))) value = null
        else conflict = true
      } else stats.added++
    } else if (b) {
      value = { ...l }
      for (const field of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
        if (['createdAt', 'updatedAt', 'useCount'].includes(field)) continue
        if (contentEqual(l[field], r[field]) || contentEqual(r[field], b[field])) continue
        if (contentEqual(l[field], b[field])) value[field] = r[field]
        else if (l.type === 'note' && field === 'content') {
          const content = mergeNoteContent(b.content, l.content, r.content)
          if (content) value.content = content
          else conflict = true
        } else conflict = true
      }
      stats.updated++
    } else conflict = true

    if (conflict) {
      const decision = resolutions[key]
      if (decision?.choice === 'local') value = l
      else if (decision?.choice === 'remote') value = r
      else if (decision?.choice === 'manual' && l?.type === 'note' && r && Array.isArray(decision.content?.ops)) {
        value = { ...l, content: decision.content, updatedAt: new Date().toISOString() }
      } else if (decision?.choice === 'both' && l && r) {
        value = l
        const copy = { ...r, id: randomUUID() }
        if (copy.name) copy.name += '（远端副本）'
        if (copy.accountName) copy.accountName += '（远端副本）'
        merged.push(copy)
        if (r.type === 'tab') {
          for (const child of remoteItems.filter(item => item.parentId === r.id)) {
            merged.push({ ...child, id: randomUUID(), parentId: copy.id })
          }
        }
      } else {
        conflicts.push({ key, type: (l || r || b).type, label: labels[(l || r || b).type],
          name: (l || r || b).name || (l || r || b).accountName || '未命名', local: l || null, remote: r || null })
        value = l
      }
    }
    if (value) {
      merged.push(structuredClone(value))
      tombstones.delete(key)
    } else if (!conflict || resolutions[key]) {
      const original = b || l || r
      tombstones.set(key, { type: original.type, id: original.id, hash: fingerprint(original), deletedAt: new Date().toISOString() })
      stats.deleted++
    }
  }
  // 子条目被明确保留时保留其所属分类，避免分类删除顺带吞掉已解决的内容。
  for (const child of [...merged]) {
    if (!child.parentId || merged.some(item => item.type === 'tab' && item.id === child.parentId)) continue
    const parentKey = `tab:${child.parentId}`
    const parent = localMap.get(parentKey) || remoteMap.get(parentKey) || baseMap.get(parentKey)
    if (parent) { merged.push(structuredClone(parent)); tombstones.delete(parentKey) }
  }
  const clean = item => {
    const { type, parentId, ...fields } = item
    return fields
  }
  const tabs = merged.filter(item => item.type === 'tab').map(tab => ({ ...clean(tab),
    accounts: merged.filter(item => item.type === 'account' && item.parentId === tab.id).map(clean),
    urls: merged.filter(item => item.type === 'url' && item.parentId === tab.id).map(clean),
  }))
  const notepads = merged.filter(item => item.type === 'note').map(clean)
  return { data: { ...local, tabs, notepads, syncTombstones: [...tombstones.values()],
    activeNotepadId: notepads.some(item => item.id === local.activeNotepadId) ? local.activeNotepadId : notepads[0]?.id || null }, conflicts, stats }
}

// 编辑器保存只应用相对上次确认快照的变化，保护排队期间插件写入的新数据。
function mergeVaultWriteData(next, current, base) {
  if (contentEqual(current, base)) return { data: next, conflicts: [] }
  const result = mergeVaultData(next, current, base)
  const baseline = new Map(flatten(base).map(item => [itemKey(item), item]))
  const resolutions = {}
  for (const conflict of result.conflicts) {
    const original = baseline.get(conflict.key)
    if (sameItem(conflict.remote, original)) resolutions[conflict.key] = { choice: 'local' }
    else if (sameItem(conflict.local, original)) resolutions[conflict.key] = { choice: 'remote' }
  }
  return mergeVaultData(next, current, base, resolutions)
}

// 基线同时允许放在首参数内，兼容只转发一个参数的旧版 Electron preload。
function getWriteSnapshots(input, baseData) {
  const { __saveBase, ...data } = input || {}
  return { data, base: baseData || __saveBase }
}

module.exports = { mergeVaultData, mergeVaultWriteData, getWriteSnapshots, contentEqual }
