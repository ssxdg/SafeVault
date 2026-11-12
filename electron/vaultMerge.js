const { randomUUID, createHash } = require('crypto')
const { repairDuplicateIds } = require('./dataNormalizer')

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
    } else if (l.type === 'note' && !contentEqual(l.content, r.content)) {
      // 用户要求同名正文有差异必须确认，禁止以时间或单边变化为由静默覆盖。
      conflict = true
    } else if (b) {
      value = { ...l }
      for (const field of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
        if (['createdAt', 'updatedAt', 'useCount'].includes(field)) continue
        if (contentEqual(l[field], r[field]) || contentEqual(r[field], b[field])) continue
        if (contentEqual(l[field], b[field])) value[field] = r[field]
        else conflict = true
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
