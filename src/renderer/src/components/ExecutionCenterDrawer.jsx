// src/renderer/src/components/ExecutionCenterDrawer.jsx
import React from 'react'
import { Drawer, List, Tag, Button, Space, Flex, Typography, Empty, Popconfirm, Badge, Tooltip } from 'antd'
import {
  PauseCircleOutlined, CaretRightOutlined, StopOutlined,
  DeleteOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useExecution } from '../store/executionStore'

const { Text } = Typography

const STATUS_CFG = {
  running: { color: 'processing', label: '运行中' },
  paused: { color: 'warning', label: '已暂停' },
  stopping: { color: 'default', label: '停止中' },
  stopped: { color: 'default', label: '已停止' },
}

export default function ExecutionCenterDrawer({ open, onClose }) {
  const { tasks, pauseTask, resumeTask, stopTask, removeTask } = useExecution()
  const list = Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt)
  const runningCount = list.filter((t) => t.status === 'running').length

  return (
    <Drawer
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          <span>执行中心</span>
          <Tag color={runningCount > 0 ? 'processing' : 'default'}>{runningCount} 运行中</Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={620}
    >
      {list.length === 0 ? (
        <Empty description="暂无执行任务" />
      ) : (
        <List
          dataSource={list}
          renderItem={(task) => {
            const cfg = STATUS_CFG[task.status] || STATUS_CFG.running
            const isRunning = task.status === 'running' || task.status === 'paused'
            const durationSec = Math.floor((Date.now() - task.startedAt) / 1000)

            return (
              <List.Item
                style={{ padding: 12, background: '#fafafa', borderRadius: 8, marginBottom: 12, border: '1px solid #f0f0f0' }}
              >
                <Flex vertical gap={8} style={{ width: '100%' }}>
                  <Flex justify="space-between" align="center">
                    <Flex gap={8} align="center">
                      <Text strong>{task.projectName}</Text>
                      <Text type="secondary">/</Text>
                      <Text strong style={{ color: '#1677ff' }}>{task.groupName}</Text>
                      <Tag color={cfg.color}>{cfg.label}</Tag>
                      {task.isSoloSub && <Tag color="purple">单测副组</Tag>}
                    </Flex>
                    <Space>
                      {isRunning && (
                        <>
                          {task.status === 'running' ? (
                            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => pauseTask(task.id)}>暂停</Button>
                          ) : (
                            <Button size="small" icon={<CaretRightOutlined />} onClick={() => resumeTask(task.id)}>继续</Button>
                          )}
                          <Button
                            size="small" danger icon={<StopOutlined />}
                            onClick={() => stopTask(task.id)}
                            disabled={task.status === 'stopping'}
                          >
                            {task.status === 'stopping' ? '停止中' : '停止'}
                          </Button>
                        </>
                      )}
                      {task.status === 'stopped' && (
                        <Popconfirm title="清除此任务及日志？" onConfirm={() => removeTask(task.id)} okText="清除" cancelText="取消">
                          <Button size="small" icon={<DeleteOutlined />}>清除</Button>
                        </Popconfirm>
                      )}
                    </Space>
                  </Flex>

                  <Flex gap={12} style={{ fontSize: 12 }} wrap>
                    <Text type="secondary">
                      间隔 {task.intervalSec > 0 ? `${task.intervalSec}s` : '单次'}
                    </Text>
                    <Text type="secondary">已跑 {task.rounds} 轮</Text>
                    <Text type="secondary">已运行 {durationSec}s</Text>
                    {task.currentLevel !== '-' && <Text type="secondary">当前 level: {task.currentLevel}</Text>}
                    <Text type="secondary">日志 {task.logs.length} 条</Text>
                  </Flex>

                  {task.logs.length > 0 && (
                    <div style={{ maxHeight: 120, overflow: 'auto', background: '#1e1e1e', borderRadius: 4, padding: 8, fontSize: 11, fontFamily: 'Consolas, monospace' }}>
                      {task.logs.slice(0, 5).map((log) => (
                        <div key={log.id} style={{ color: log.status === 'ERR' || log.status >= 400 ? '#f48771' : '#89d185', marginBottom: 2 }}>
                          [{log.time}] {log.status} {log.method} {log.url.slice(0, 80)}
                        </div>
                      ))}
                      {task.logs.length > 5 && (
                        <div style={{ color: '#666' }}>…还有 {task.logs.length - 5} 条</div>
                      )}
                    </div>
                  )}
                </Flex>
              </List.Item>
            )
          }}
        />
      )}
    </Drawer>
  )
}