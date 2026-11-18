import React, { useMemo, useState } from 'react'
import { Alert, Button, ConfigProvider, Input, Modal, Pagination, Radio, Select, Space, Spin } from 'antd'
import ReactQuill from 'react-quill-new'

const previewModules = { toolbar: false }
const editModules = { toolbar: [['bold', 'italic', 'underline'], [{ color: [] }], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'clean']] }
const fieldLabels = { name: '名称', accountName: '账户名称', username: '用户名', password: '密码', email: '邮箱', loginUrl: '登录地址', note: '备注', url: '网址', loginTargets: '登录目标', parentId: '所属分类 ID' }

function VersionPreview({ item }) {
  if (!item) return <p className="sync-deleted">此版本已删除该条目</p>
  if (item.type === 'note') return <ReactQuill theme="snow" value={item.content} readOnly modules={previewModules} />
  return <dl className="sync-fields">{Object.entries(item).filter(([key]) => !['id', 'type', 'createdAt', 'updatedAt', 'useCount'].includes(key)).map(([key, value]) => (
    <React.Fragment key={key}><dt>{fieldLabels[key] || key}</dt><dd>{key === 'password'
      ? <Input.Password value={String(value || '')} readOnly aria-label="版本密码" />
      : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}</dd></React.Fragment>
  ))}</dl>
}

function ConflictItem({ item, resolution, onChange }) {
  const canKeepBoth = Boolean(item.local && item.remote)
  return <section className="sync-conflict">
    <h3>{item.label}：{item.name}</h3>
    <div className="sync-versions">
      <div><h4>本地版本</h4><VersionPreview item={item.local} /></div>
      <div><h4>远端 / 导入版本</h4><VersionPreview item={item.remote} /></div>
    </div>
    <Radio.Group aria-label={`${item.name}的冲突处理方式`} value={resolution?.choice} onChange={event => onChange({ choice: event.target.value, ...(event.target.value === 'manual' ? { content: item.local.content } : {}) })}>
      <Radio value="local">{item.local ? '保留本地' : '确认本地删除'}</Radio>
      <Radio value="remote">{item.remote ? '使用远端 / 导入版本' : '确认远端删除'}</Radio>
      {canKeepBoth && <Radio value="both">保留两个版本</Radio>}
      {canKeepBoth && item.type === 'note' && <Radio value="manual">手动合并</Radio>}
    </Radio.Group>
    {resolution?.choice === 'manual' && <div className="sync-manual-editor">
      <p>以本地正文为起点编辑；原有富文本格式会保留。</p>
      <ReactQuill theme="snow" value={resolution.content} modules={editModules} onChange={(html, delta, source, editor) => {
        if (source === 'user') onChange({ choice: 'manual', content: editor.getContents() })
      }} />
    </div>}
  </section>
}

function GitSyncDialog({ model, onCancel, onResolve, onPassword, onRestore }) {
  const [resolutions, setResolutions] = useState({})
  const [password, setPassword] = useState('')
  const [snapshotId, setSnapshotId] = useState()
  const [conflictPage, setConflictPage] = useState(1)
  // 弹窗在当前主题节点内渲染，组件库颜色跟随已有主题变量，不引入另一套配色。
  const tokens = useMemo(() => {
    const style = getComputedStyle(document.querySelector('.app'))
    const color = name => style.getPropertyValue(name).trim()
    return { colorPrimary: color('--accent'), colorBgElevated: color('--surface'), colorBgContainer: color('--input-bg'),
      colorText: color('--text'), colorTextSecondary: color('--text-muted'), colorBorder: color('--border'), fontFamily: '"Microsoft YaHei", sans-serif' }
  }, [])
  const working = model.stage === 'working'
  const passwordLabel = model.mode === 'import' ? '备份密码' : '远端主密码'
  const unresolved = (model.conflicts || []).filter(item => !resolutions[item.key]).length
  // 每页仅挂载少量富文本预览；选择统一保存在弹窗中，翻页不会丢失。
  const conflictPageSize = 5
  const visibleConflicts = (model.conflicts || []).slice((conflictPage - 1) * conflictPageSize, conflictPage * conflictPageSize)
  const handleResolveAll = choice => {
    // 批量选择覆盖全部分页，仍由“确认合并”统一提交，允许随后逐项调整。
    setResolutions(Object.fromEntries(model.conflicts.map(item => [item.key, { choice }])))
  }
  let footer = null
  if (model.stage === 'conflicts') footer = <>
    <Button onClick={onCancel}>取消同步</Button>
    <Button type="primary" disabled={unresolved > 0} onClick={() => onResolve(resolutions)}>确认合并{unresolved > 0 ? `（剩余 ${unresolved} 项）` : ''}</Button>
  </>
  if (model.stage === 'password') footer = <><Button onClick={onCancel}>取消</Button><Button type="primary" disabled={!password} onClick={() => { onPassword(password); setPassword('') }}>继续</Button></>
  if (model.stage === 'history') footer = <><Button onClick={onCancel}>关闭</Button><Button danger disabled={!snapshotId} onClick={() => onRestore(snapshotId)}>确认恢复所选备份</Button></>
  return <ConfigProvider theme={{ token: tokens }}><Modal open title={model.stage === 'history' ? '同步备份与恢复' : '数据同步'}
    getContainer={false} width={960} centered className="git-sync-dialog" footer={footer} zIndex={2200}
    closable={!working} mask={{ closable: false }} keyboard={!working} onCancel={onCancel}>
    {working && <div className="sync-progress" role="status" aria-live="polite"><Spin /><p>{model.message}</p><p>正在处理加密数据，请稍候。</p></div>}
    {model.stage === 'conflicts' && <>
      <Alert type="warning" showIcon title={`有 ${model.conflicts.length} 项冲突需要处理`} description={`一致数据已跳过 ${model.stats?.skipped || 0} 项，单边和可安全合并的修改会自动处理。以下条目无法安全自动合并，或缺少共同基线，需要你选择。确认前不会覆盖本地数据。`} />
      <div className="sync-conflict-actions">
        <Space wrap>
          <Button onClick={() => handleResolveAll('local')}>全部使用本地数据</Button>
          <Button onClick={() => handleResolveAll('remote')}>{model.mode === 'import' ? '全部使用导入数据' : '全部使用远程数据'}</Button>
        </Space>
        <Pagination size="small" current={conflictPage} pageSize={conflictPageSize} total={model.conflicts.length}
          hideOnSinglePage showSizeChanger={false} onChange={setConflictPage} />
      </div>
      <p className="sync-help">批量选择适用于全部冲突，可继续逐项调整；所选版本已删除的条目将按删除处理。选择后点击“确认合并”保存。</p>
      <div className="sync-conflicts">{visibleConflicts.map(item => <ConflictItem key={item.key} item={item} resolution={resolutions[item.key]} onChange={value => setResolutions(previous => ({ ...previous, [item.key]: value }))} />)}</div>
    </>}
    {model.stage === 'password' && <>
      <p className="sync-help">{model.message || '远端主密码与本机不同，请输入远端主密码。密码仅用于本次解密。'}</p>
      <Input.Password autoFocus aria-label={passwordLabel} placeholder={`请输入${passwordLabel}`} value={password} onChange={event => setPassword(event.target.value)} onPressEnter={() => { if (password) { onPassword(password); setPassword('') } }} />
    </>}
    {model.stage === 'history' && <>
      <Alert type="warning" showIcon title="恢复会替换当前本地数据" description="恢复前会再创建一份加密备份。恢复后不会自动上传，需重新同步并处理差异。" />
      <p className="sync-help">{model.snapshots?.length ? '选择恢复时间（设备本地时间）：' : '暂无同步备份；首次合并写入前会自动创建。'}</p>
      {Boolean(model.snapshots?.length) && <Select className="sync-snapshot-select" aria-label="选择同步前备份" value={snapshotId} onChange={setSnapshotId} placeholder="请选择备份" options={model.snapshots.map(item => ({ value: item.id, label: new Date(item.createdAt).toLocaleString('zh-CN') }))} />}
    </>}
  </Modal></ConfigProvider>
}

export default GitSyncDialog
