// src/renderer/src/pages/SettingsPage.jsx
import React from 'react'
import { Card, Form, InputNumber, Button, Typography, Divider, App as AntApp } from 'antd'
import { useSettings } from '../store/settingsStore'

const { Text } = Typography

export default function SettingsPage() {
  const { settings, updateSetting, resetSettings, defaults } = useSettings()
  const { message } = AntApp.useApp()

  const handleReset = () => {
    resetSettings()
    message.success('已恢复默认设置')
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Card
        title={<Text strong>应用设置</Text>}
        extra={<Button onClick={handleReset}>恢复默认</Button>}
        style={{ maxWidth: 720 }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          以下设置对整个应用的所有请求生效（执行主组、副组、单测）。
        </Text>

        <Divider orientation="left" plain>HTTP 请求</Divider>
        <Form layout="vertical">
          <Form.Item
            label="请求超时（毫秒）"
            extra="单个请求超过此时长未响应即中止"
          >
            <InputNumber
              min={1000} max={600000} step={1000}
              value={settings.timeoutMs}
              onChange={(v) => updateSetting('timeoutMs', v || defaults.timeoutMs)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item
            label="失败自动重试次数"
            extra="0 表示不重试；仅网络失败/超时时触发，不会重试业务错误（4xx/5xx）"
          >
            <InputNumber
              min={0} max={10}
              value={settings.retries}
              onChange={(v) => updateSetting('retries', v ?? defaults.retries)}
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item
            label="重试间隔（毫秒）"
            extra="两次重试之间等待多久"
          >
            <InputNumber
              min={0} max={10000} step={100}
              value={settings.retryDelayMs}
              onChange={(v) => updateSetting('retryDelayMs', v ?? defaults.retryDelayMs)}
              style={{ width: 200 }}
            />
          </Form.Item>
        </Form>

        <Divider orientation="left" plain>组内执行</Divider>
        <Form layout="vertical">
          <Form.Item
            label="请求间隔（毫秒）"
            extra="同一组内两个请求之间的等待时间"
          >
            <InputNumber
              min={0} max={10000} step={10}
              value={settings.requestDelayMs}
              onChange={(v) => updateSetting('requestDelayMs', v ?? defaults.requestDelayMs)}
              style={{ width: 200 }}
            />
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}