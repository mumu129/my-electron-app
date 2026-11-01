// src/renderer/src/pages/ProjectSettingsPage.jsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  Card, Select, Button, Tabs, Table, Checkbox, InputNumber, Space, Flex,
  Typography, Empty, Alert, Tag, App as AntApp, Divider, Collapse,
} from 'antd'
import {
  SettingOutlined, SaveOutlined, RocketOutlined, GlobalOutlined,
  ExperimentOutlined, InfoCircleOutlined, FolderOutlined,
} from '@ant-design/icons'
import { useProjects } from '../store/projectStore'
import { useExecution } from '../store/executionStore'
import usePersistentState from '../hooks/usePersistentState'

const { Text } = Typography

export default function ProjectSettingsPage({ initialProjectId }) {
  const { projects, updateStartupPlan } = useProjects()
  const { startTask, findTaskByGroup } = useExecution()
  const { message } = AntApp.useApp()

  const [currentProjectId, setCurrentProjectId] = useState(
    initialProjectId || projects[0]?.id || null
  )
  const [activeTab, setActiveTab] = useState('startup')

  // ───── 单项目预案（draft + 保存，跟原来一致） ─────
  const [draftPlan, setDraftPlan] = useState({ groups: [] })
  const [dirty, setDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)

  // ───── 全局预案（勾选即生效，自动持久化到 localStorage） ─────
  const [globalPlan, setGlobalPlan] = usePersistentState('har-global-plan', { groups: [] })

  const project = useMemo(
    () => projects.find((p) => p.id === currentProjectId),
    [projects, currentProjectId]
  )
  const startupPlan = project?.startupPlan || { groups: [] }

  useEffect(() => {
    if (!project) {
      setDraftPlan({ groups: [] })
      setDirty(false)
      return
    }
    const map = new Map((startupPlan.groups || []).map((g) => [g.groupId, g]))
    setDraftPlan({
      groups: project.groups.map((g) => {
        const ex = map.get(g.id)
        return { groupId: g.id, intervalSec: ex?.intervalSec ?? 0, enabled: ex?.enabled ?? false }
      }),
    })
    setDirty(false)
    setLastSavedAt(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  useEffect(() => {
    if (!project) return
    const validIds = new Set(project.groups.map((g) => g.id))
    const anyMissing = draftPlan.groups.some((g) => !validIds.has(g.groupId))
    if (anyMissing) {
      setDraftPlan((prev) => ({
        groups: prev.groups.filter((g) => validIds.has(g.groupId)),
      }))
    }
  }, [project?.groups, draftPlan.groups])

  // 清理全局预案中的无效项（项目/组被删）
  useEffect(() => {
    if (projects.length === 0) return
    const validIds = new Set()
    for (const p of projects) {
      for (const g of p.groups) validIds.add(`${p.id}::${g.id}`)
    }
    const valid = (globalPlan.groups || []).filter((x) => validIds.has(`${x.projectId}::${x.groupId}`))
    if (valid.length !== (globalPlan.groups || []).length) {
      setGlobalPlan({ groups: valid })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  // ───── 单项目预案：行数据 ─────
  const rows = useMemo(
    () =>
      project?.groups.map((g) => {
        const item = draftPlan.groups.find((x) => x.groupId === g.id) || {
          groupId: g.id, intervalSec: 0, enabled: false,
        }
        return { ...item, groupName: g.name, mainCount: g.requests.length, subCount: g.subGroup?.requests?.length || 0 }
      }) || [],
    [project, draftPlan.groups]
  )
  const enabledCount = draftPlan.groups.filter((g) => g.enabled).length

  // ───── 全局预案：行数据 ─────
  const globalRows = useMemo(() => {
    const planMap = new Map((globalPlan.groups || []).map((x) => [`${x.projectId}::${x.groupId}`, x]))
    return projects.map((p) => {
      const items = p.groups.map((g) => {
        const ex = planMap.get(`${p.id}::${g.id}`)
        return {
          projectId: p.id,
          groupId: g.id,
          groupName: g.name,
          mainCount: g.requests.length,
          subCount: g.subGroup?.requests?.length || 0,
          intervalSec: ex?.intervalSec ?? 0,
          enabled: ex?.enabled ?? false,
        }
      })
      return {
        projectId: p.id,
        projectName: p.name,
        items,
        enabledCount: items.filter((x) => x.enabled).length,
      }
    })
  }, [projects, globalPlan.groups])
  const enabledGlobalCount = (globalPlan.groups || []).filter((x) => x.enabled).length

  // 全局预案默认展开有勾选的项目
  const defaultExpandedProjects = useMemo(
    () => globalRows.filter((r) => r.enabledCount > 0).map((r) => r.projectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // 只在首次计算，用户展开状态不受影响
  )

  // ───── 单项目预案：操作 ─────
  const updateRow = (groupId, patch) => {
    setDraftPlan((prev) => ({
      groups: prev.groups.map((x) => (x.groupId === groupId ? { ...x, ...patch } : x)),
    }))
    setDirty(true)
  }

  const handleSave = () => {
    if (!currentProjectId) return
    updateStartupPlan(currentProjectId, draftPlan)
    message.success('启动预案已保存')
    setDirty(false)
    setLastSavedAt(Date.now())
  }

  const handleSaveAndStart = () => {
    if (!currentProjectId) return
    const enabled = draftPlan.groups.filter((g) => g.enabled)
    if (enabled.length === 0) return message.warning('预案中没有启用的组')

    updateStartupPlan(currentProjectId, draftPlan)
    setDirty(false)
    setLastSavedAt(Date.now())

    let started = 0
    let skipped = 0
    for (const item of enabled) {
      const g = project.groups.find((x) => x.id === item.groupId)
      if (!g) continue
      if (findTaskByGroup(currentProjectId, item.groupId)) {
        skipped++
        continue
      }
      startTask({
        projectId: currentProjectId,
        groupId: item.groupId,
        intervalSec: item.intervalSec || 0,
        isSoloSub: false,
      })
      started++
    }
    message.success(`已保存并启动 ${started} 个组${skipped > 0 ? `，跳过 ${skipped} 个正在运行的组` : ''}`)
  }

  // ───── 全局预案：操作 ─────
  const updateGlobalRow = (projectId, groupId, patch) => {
    const groups = [...(globalPlan.groups || [])]
    const idx = groups.findIndex((x) => x.projectId === projectId && x.groupId === groupId)
    if (idx >= 0) {
      groups[idx] = { ...groups[idx], ...patch }
    } else {
      groups.push({ projectId, groupId, intervalSec: 0, enabled: false, ...patch })
    }
    setGlobalPlan({ groups })
  }

  const handleStartGlobal = () => {
    const enabled = (globalPlan.groups || []).filter((x) => x.enabled)
    if (enabled.length === 0) return message.warning('全局预案中没有启用的组')

    let started = 0
    let skipped = 0
    let missing = 0
    for (const item of enabled) {
      const p = projects.find((x) => x.id === item.projectId)
      const g = p?.groups.find((x) => x.id === item.groupId)
      if (!g) { missing++; continue }
      if (findTaskByGroup(item.projectId, item.groupId)) { skipped++; continue }
      startTask({
        projectId: item.projectId,
        groupId: item.groupId,
        intervalSec: item.intervalSec || 0,
        isSoloSub: false,
      })
      started++
    }
    message.success(
      `已启动 ${started} 个组` +
      (skipped > 0 ? `，跳过 ${skipped} 个正在运行的组` : '') +
      (missing > 0 ? `，${missing} 个已失效` : '')
    )
  }

  if (projects.length === 0) {
    return (
      <div style={{ padding: 40 }}>
        <Empty description="暂无项目，请先在「新建项目」创建" />
      </div>
    )
  }

  // 表头列定义（单项目 / 全局共用）
  const commonColumns = (updateFn) => [
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 60,
      align: 'center',
      render: (checked, r) => (
        <Checkbox
          checked={checked}
          onChange={(e) => updateFn(r, { enabled: e.target.checked })}
        />
      ),
    },
    {
      title: '请求组',
      dataIndex: 'groupName',
      render: (name, r) => (
        <Space size={4}>
          <Text strong>{name}</Text>
          <Tag color="blue" style={{ marginLeft: 4 }}>主 {r.mainCount}</Tag>
          <Tag color="orange">副 {r.subCount}</Tag>
        </Space>
      ),
    },
    {
      title: '循环间隔（秒）',
      width: 160,
      align: 'center',
      render: (_, r) => (
        <InputNumber
          size="small"
          min={0}
          value={r.intervalSec}
          onChange={(v) => updateFn(r, { intervalSec: Number(v) || 0 })}
          disabled={!r.enabled}
          style={{ width: 110 }}
          placeholder="0=单次"
        />
      ),
    },
    {
      title: '说明',
      width: 140,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {!r.enabled ? '未启用' : r.intervalSec > 0 ? `每 ${r.intervalSec}s 一轮` : '仅执行一次'}
        </Text>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      {/* 顶部：项目选择 + 操作按钮（跟随 Tab 变化） */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
        <Flex align="center" justify="space-between" wrap gap={12}>
          <Flex align="center" gap={12}>
            <SettingOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>项目设置</Text>
            <Divider orientation="vertical" style={{ height: 20, margin: 0 }} />
            {activeTab === 'global' ? (
              <Text type="secondary">全局：跨项目勾选组</Text>
            ) : (
              <>
                <Text type="secondary">选择项目：</Text>
                <Select
                  style={{ minWidth: 240 }}
                  value={currentProjectId}
                  onChange={setCurrentProjectId}
                  options={projects.map((p) => ({
                    value: p.id,
                    label: `${p.name}（${p.groups.length} 组）`,
                  }))}
                  showSearch
                  optionFilterProp="label"
                />
              </>
            )}
          </Flex>
          <Space>
            {activeTab === 'global' ? (
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={handleStartGlobal}
                disabled={enabledGlobalCount === 0}
                style={{
                  background: enabledGlobalCount > 0 ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' : undefined,
                  border: 'none',
                }}
              >
                启动全局预案 ({enabledGlobalCount})
              </Button>
            ) : (
              <>
                {dirty && <Tag color="warning">未保存</Tag>}
                {!dirty && lastSavedAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    保存于 {new Date(lastSavedAt).toLocaleTimeString()}
                  </Text>
                )}
                <Button icon={<SaveOutlined />} onClick={handleSave} disabled={!dirty}>
                  保存预案
                </Button>
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  onClick={handleSaveAndStart}
                  disabled={enabledCount === 0}
                  style={{
                    background: enabledCount > 0 ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' : undefined,
                    border: 'none',
                  }}
                >
                  保存并启动 ({enabledCount})
                </Button>
              </>
            )}
          </Space>
        </Flex>
      </Card>

      {/* Tabs */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'startup',
              label: <span><RocketOutlined /> 项目启动预案</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="项目启动预案"
                    description="只针对当前项目。保存后，在项目详情页点「按预案启动」即可批量启动。"
                    style={{ marginBottom: 16 }}
                  />
                  {project.groups.length === 0 ? (
                    <Empty description="当前项目暂无请求组" />
                  ) : (
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="groupId"
                      dataSource={rows}
                      columns={commonColumns((r, patch) => updateRow(r.groupId, patch))}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'global',
              label: (
                <span>
                  <GlobalOutlined /> 全局预案
                  {enabledGlobalCount > 0 && <Tag color="green" style={{ marginLeft: 6 }}>{enabledGlobalCount}</Tag>}
                </span>
              ),
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="全局预案"
                    description="跨项目勾选要启动的组，勾选后自动保存。点右上角「启动全局预案」一键启动所有勾选的组。已在运行的组会自动跳过。"
                    style={{ marginBottom: 16 }}
                  />
                  {globalRows.length === 0 ? (
                    <Empty description="暂无项目" />
                  ) : (
                    <Collapse
                      defaultActiveKey={defaultExpandedProjects}
                      items={globalRows.map((row) => ({
                        key: row.projectId,
                        label: (
                          <Flex justify="space-between" align="center" style={{ width: '100%' }}>
                            <Space>
                              <FolderOutlined style={{ color: '#1677ff' }} />
                              <Text strong>{row.projectName}</Text>
                              <Tag color="blue">{row.items.length} 组</Tag>
                              {row.enabledCount > 0 && (
                                <Tag color="success">已选 {row.enabledCount}</Tag>
                              )}
                            </Space>
                          </Flex>
                        ),
                        children:
                          row.items.length === 0 ? (
                            <Empty
                              description="该项目暂无请求组"
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                          ) : (
                            <Table
                              size="small"
                              pagination={false}
                              rowKey="groupId"
                              dataSource={row.items}
                              columns={commonColumns((r, patch) =>
                                updateGlobalRow(r.projectId, r.groupId, patch)
                              )}
                            />
                          ),
                      }))}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'proxy',
              label: <span><GlobalOutlined /> 默认网络代理</span>,
              children: (
                <Empty
                  description={
                    <Flex vertical align="center" gap={8}>
                      <Text type="secondary">即将支持</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        为项目内所有组设置默认代理（组内可覆盖）
                      </Text>
                    </Flex>
                  }
                  style={{ marginTop: 40 }}
                />
              ),
            },
            {
              key: 'advanced',
              label: <span><ExperimentOutlined /> 高级设置</span>,
              children: (
                <Empty
                  description={
                    <Flex vertical align="center" gap={8}>
                      <Text type="secondary">即将支持</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        项目级默认变量、日志归档、失败通知等
                      </Text>
                    </Flex>
                  }
                  style={{ marginTop: 40 }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}