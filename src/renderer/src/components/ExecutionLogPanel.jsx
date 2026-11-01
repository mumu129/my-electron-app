// src/renderer/src/components/ExecutionLogPanel.jsx
import React, { useMemo, useState } from 'react'
import {
  Drawer, Segmented, Collapse, Tag, Button, Space, Flex, Typography, Empty,
  Popconfirm, Badge, List,
} from 'antd'
import {
  DeleteOutlined, StopOutlined, ClearOutlined,
  PauseCircleOutlined, CaretRightOutlined,
} from '@ant-design/icons'
import { useExecution } from '../store/executionStore'

const { Text } = Typography

const STATUS_TAG = {
  running: { color: 'processing', label: '运行中' },
  paused: { color: 'warning', label: '暂停' },
  stopping: { color: 'default', label: '停止中' },
  stopped: { color: 'default', label: '已停止' },
}

export default function ExecutionLogPanel({ open, onClose }) {
  const {
    tasks, pauseTask, resumeTask, stopTask, removeTask,
    clearAllLogs, clearTaskLogs,
  } = useExecution()
  const [filterProjectId, setFilterProjectId] = useState('all')

  const taskList = useMemo(() => Object.values(tasks), [tasks])

  const projects = useMemo(() => {
    const map = new Map()
    for (const t of taskList) if (!map.has(t.projectId)) map.set(t.projectId, t.projectName)
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [taskList])

  const filteredTasks = useMemo(() => {
    let list = taskList
    if (filterProjectId !== 'all') list = list.filter((t) => t.projectId === filterProjectId)
    return list.sort((a, b) => {
      const aR = a.status === 'running' || a.status === 'paused' || a.status === 'stopping'
      const bR = b.status === 'running' || b.status === 'paused' || b.status === 'stopping'
      if (aR !== bR) return aR ? -1 : 1
      return b.startedAt - a.startedAt
    })
  }, [taskList, filterProjectId])

  const runningCount = taskList.filter((t) => t.status === 'running').length

  const segOptions = [
    { value: 'all', label: `全部 (${taskList.length})` },
    ...projects.map((p) => ({
      value: p.id,
      label: `${p.name} (${taskList.filter((t) => t.projectId === p.id).length})`,
    })),
  ]

  const collapseItems = filteredTasks.map((task) => {
    const cfg = STATUS_TAG[task.status] || STATUS_TAG.running
    const isRunning = task.status === 'running' || task.status === 'paused'
    const isStopped = task.status === 'stopped'

    const header = (
      <Flex justify="space-between" align="center" style={{ width: '100%' }}>
        <Space wrap>
          <Text strong>{task.projectName}</Text>
          <Text type="secondary">/</Text>
          <Text strong style={{ color: '#1677ff' }}>{task.groupName}</Text>
          <Tag color={cfg.color}>{cfg.label}</Tag>
          {task.isSoloSub && <Tag color="purple">单测副组</Tag>}
          {task.intervalSec > 0 && <Tag>每 {task.intervalSec}s</Tag>}
          <Text type="secondary" style={{ fontSize: 12 }}>
            轮次 {task.rounds} · 日志 {task.logs.length}
          </Text>
        </Space>
        <Space onClick={(e) => e.stopPropagation()}>
          {isRunning && task.status === 'running' && (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => pauseTask(task.id)}>暂停</Button>
          )}
          {isRunning && task.status === 'paused' && (
            <Button size="small" icon={<CaretRightOutlined />} onClick={() => resumeTask(task.id)}>继续</Button>
          )}
          {!isStopped && (
            <Button size="small" danger icon={<StopOutlined />}
              onClick={() => stopTask(task.id)} disabled={task.status === 'stopping'}>
              {task.status === 'stopping' ? '停止中' : '停止'}
            </Button>
          )}
          {task.logs.length > 0 && (
            <Button size="small" onClick={() => clearTaskLogs(task.id)}>清空</Button>
          )}
          {isStopped && (
            <Popconfirm title="移除此任务？" onConfirm={() => removeTask(task.id)} okText="移除" cancelText="取消">
              <Button size="small" danger icon={<DeleteOutlined />}>移除</Button>
            </Popconfirm>
          )}
        </Space>
      </Flex>
    )

    const body = task.logs.length === 0 ? (
      <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    ) : (
      <div style={{ maxHeight: 380, overflow: 'auto', background: '#1e1e1e', borderRadius: 4, padding: 8, fontFamily: 'Consolas, monospace', fontSize: 12 }}>
        {task.logs.map((log) => (
          <div key={log.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #333' }}>
            <Flex gap={8} align="center" style={{ marginBottom: 2 }}>
              <Text style={{ color: '#888' }}>[{log.time}]</Text>
              {log.source === 'main' && <Tag color="blue" style={{ margin: 0 }}>主</Tag>}
              {log.source === 'sub' && <Tag color="purple" style={{ margin: 0 }}>副</Tag>}
              {log.source === 'sub-retry' && <Tag color="orange" style={{ margin: 0 }}>重</Tag>}
              <Text style={{
                color: log.status >= 400 || log.status === 'ERR' || log.status === 'RETRY' ? '#f48771' : '#89d185',
                fontWeight: 'bold'
              }}>
                {log.status}
              </Text>
              <Text style={{ color: '#569cd6' }}>{log.method}</Text>
              <Text style={{ color: '#d4d4d4', flex: 1 }} ellipsis title={log.url}>{log.url}</Text>
              <Text style={{ color: '#888' }}>{log.timeCost}ms</Text>
            </Flex>
            {log.body && (
              <pre style={{ margin: 0, padding: 6, background: '#252526', borderRadius: 4, color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 150, overflow: 'auto', fontSize: 11 }}>
                {log.body}
              </pre>
            )}
          </div>
        ))}
      </div>
    )

    return {
      key: task.id,
      label: header,
      children: body,
      style: { background: '#fafafa', borderRadius: 8, marginBottom: 8, border: '1px solid #f0f0f0' },
    }
  })

  return (
    <Drawer
      title={
        <Flex justify="space-between" align="center" style={{ width: '100%' }}>
          <Space>
            <span>执行日志</span>
            <Badge count={runningCount} size="small" />
          </Space>
          <Button size="small" icon={<ClearOutlined />} onClick={clearAllLogs}
            disabled={taskList.every((t) => t.logs.length === 0)}>
            清空全部日志
          </Button>
        </Flex>
      }
      placement="right"
      open={open}
      onClose={onClose}
      width="min(900px, 72vw)"
      styles={{ body: { padding: 12, background: '#f5f7fa' } }}
    >
      <Flex vertical gap={12} style={{ height: '100%' }}>
        <Segmented block options={segOptions} value={filterProjectId} onChange={setFilterProjectId} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filteredTasks.length === 0 ? (
            <Empty description="暂无任务" style={{ marginTop: 60 }} />
          ) : (
            <Collapse
              defaultActiveKey={filteredTasks.filter((t) => t.status !== 'stopped').map((t) => t.id)}
              items={collapseItems}
              bordered={false}
            />
          )}
        </div>
      </Flex>
    </Drawer>
  )
}