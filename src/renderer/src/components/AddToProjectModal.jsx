// src/renderer/src/components/AddToProjectModal.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Select, AutoComplete, App as AntApp, Radio } from 'antd'
import { useProjects } from '../store/projectStore'

export default function AddToProjectModal({ open, onClose, entries, onAdded }) {
  const { projects, createGroup, addRequestsToGroup, addRequestsToSubGroup } = useProjects()
  const { message } = AntApp.useApp()
  const [projectId, setProjectId] = useState()
  const [groupName, setGroupName] = useState('')
  const [targetLevel, setTargetLevel] = useState('main')

  const list = Array.isArray(entries) ? entries : []
  const prevOpenRef = useRef(false)

  // 💡 [修复] 只在 open 从 false → true 时重置一次
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setProjectId(projects[0]?.id)
      setGroupName('')
      setTargetLevel('main')
    }
    prevOpenRef.current = open
  }, [open, projects])

  const currentProject = projects.find((p) => p.id === projectId)

  const groupOptions = useMemo(
    () => (currentProject?.groups || []).map((g) => ({
      value: g.name,
      label: `${g.name}（主:${g.requests.length} 副:${g.subGroup?.requests?.length || 0}）`,
    })),
    [currentProject]
  )

  const handleOk = () => {
    try {
      if (!projectId) { message.warning('请选择项目'); return }
      const name = (groupName || '').trim()
      if (!name) { message.warning('请输入请求组名称'); return }
      if (list.length === 0) { message.warning('没有可添加的请求'); return }
      const project = projects.find((p) => p.id === projectId)
      if (!project) { message.error('项目不存在'); onClose(); return }

      let group = project.groups.find((g) => g.name === name)
      if (!group) group = createGroup(projectId, name)
      if (!group) throw new Error('创建请求组失败')

      if (targetLevel === 'main') addRequestsToGroup(projectId, group.id, list)
      else addRequestsToSubGroup(projectId, group.id, list)

      message.success(`已添加 ${list.length} 条请求到「${project.name} / ${name} (${targetLevel === 'main' ? '主组' : '副组'})」`)
      onAdded?.()
      onClose()   // 💡 只在成功路径关闭
    } catch (e) {
      console.error('[AddToProjectModal] 出错:', e)
      message.error(String(e?.message || e))
    }
  }

  return (
    <Modal
      title={`添加 ${list.length} 条请求`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 8, color: '#595959' }}>选择项目</div>
        <Select style={{ width: '100%' }} placeholder="选择项目" value={projectId} onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          notFoundContent="还没有项目，请先到「新建项目」创建" />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, color: '#595959' }}>请求组名称</div>
        <AutoComplete style={{ width: '100%' }} placeholder="选择已有请求组或输入新名称"
          value={groupName} onChange={setGroupName} options={groupOptions}
          filterOption={(input, option) => (option?.value || '').toLowerCase().includes(input.toLowerCase())} />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, color: '#595959' }}>添加到该组的层级：</div>
        <Radio.Group value={targetLevel} onChange={e => setTargetLevel(e.target.value)} buttonStyle="solid">
          <Radio.Button value="main">主组 (正常顺序执行)</Radio.Button>
          <Radio.Button value="sub">副组 (条件触发执行)</Radio.Button>
        </Radio.Group>
      </div>
    </Modal>
  )
}