// src/renderer/src/components/HarViewer.jsx
import { useState } from 'react'
import { Flex, Typography, Upload, Button, App } from 'antd'
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons'
import RequestWorkbench from './RequestWorkbench'
import AddToProjectModal from './AddToProjectModal'
import { parseHar, genUid, setPath } from '../utils/har'

const { Text } = Typography

export default function HarViewer({ entries, setEntries, fileName, setFileName, flushHar }) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [pendingAddEntries, setPendingAddEntries] = useState([])

  const handleFile = async (file) => {
    setLoading(true)
    try {
      if (!/\.har$|\.json$/i.test(file.name)) throw new Error('请选择 .har 或 .json 文件')
      const text = await file.text()
      const har = parseHar(text)
      const processed = har.log.entries.map((e) => ({ ...e, _uid: genUid(), tags: [] }))
      setEntries(processed)
      setFileName(file.name)
      message.success(`已导入 ${processed.length} 条请求`)
      // 💡 [修复] flush 传值，立刻落盘（不再用 setTimeout 赌 commit）
      flushHar?.(processed)
    } catch (e) {
      console.error('[HarViewer] 导入失败:', e)
      message.error(e.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  // 💡 [修复] 同步返回 LIST_IGNORE，阻止 antd 默认上传流程
  const beforeUpload = (file) => {
    handleFile(file)
    return Upload.LIST_IGNORE
  }

  const handleAddToProject = (selected) => {
    if (!selected.length) return
    setPendingAddEntries(selected)
    setAddModalOpen(true)
  }

  const handleUpdateRequest = (uid, updates) => {
    setEntries((prev) => prev.map((e) => {
      if (e._uid !== uid) return e
      let next = e
      for (const { fieldPath, value } of updates) {
        try { next = setPath(next, fieldPath, value) }
        catch (err) { console.warn('[HarViewer] setPath 失败:', fieldPath, err) }
      }
      return next
    }))
  }

  const handleUpdateResponse = (uid, newResponse) => {
    setEntries((prev) => prev.map((e) => (e._uid === uid ? { ...e, response: newResponse } : e)))
  }

  const headerExtra = (
    <Flex vertical gap={6}>
      <Flex justify="space-between" align="center">
        <Text strong>HAR 查看器</Text>
        <Flex gap={6} align="center">
          <Upload accept=".har,application/json" showUploadList={false} beforeUpload={beforeUpload}>
            <Button size="small" icon={<UploadOutlined />} loading={loading}>
              {entries.length > 0 ? '重新导入' : '导入'}
            </Button>
          </Upload>
        </Flex>
      </Flex>
      {fileName && (
        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
          {fileName} · {entries.length} 条
        </Text>
      )}
    </Flex>
  )

  const emptyNode = (
    <Flex justify="center" align="center" style={{ height: '100%', padding: 24 }}>
      <Upload.Dragger accept=".har,application/json" showUploadList={false} beforeUpload={beforeUpload}>
        <p className="ant-upload-drag-icon"><FileTextOutlined /></p>
        <p className="ant-upload-text">拖拽 HAR 文件到此处</p>
      </Upload.Dragger>
    </Flex>
  )

  return (
    <>
      <RequestWorkbench
        entries={entries}
        setEntries={setEntries}
        projectId={undefined}
        showSelection={true}
        showAddToProject={true}
        onAddToProject={handleAddToProject}
        headerExtra={headerExtra}
        emptyNode={emptyNode}
        onUpdateRequest={handleUpdateRequest}
        onUpdateResponse={handleUpdateResponse}
      />
      <AddToProjectModal
        open={addModalOpen}
        entries={pendingAddEntries}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => setPendingAddEntries([])}
      />
    </>
  )
}