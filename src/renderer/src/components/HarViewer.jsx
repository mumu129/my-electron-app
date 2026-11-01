// src/renderer/src/components/HarViewer.jsx
import { useState, useEffect, useCallback } from 'react'
import { Flex, Typography, Upload, Button, App, Select, Popconfirm, Space, Tag } from 'antd'
import { UploadOutlined, FileTextOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons'
import RequestWorkbench from './RequestWorkbench'
import AddToProjectModal from './AddToProjectModal'
import { parseHar, genUid, setPath } from '../utils/har'
import { idb } from '../store/idbStore'

const { Text } = Typography

const VERSIONS_KEY = 'har-versions-v1'
const ACTIVE_KEY = 'har-active-version-v1'
const entryKey = (id) => `har-entries-v1-${id}`

export default function HarViewer({ entries, setEntries, fileName, setFileName, flushHar }) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [pendingAddEntries, setPendingAddEntries] = useState([])

  const [versions, setVersions] = useState([])
  const [activeVersionId, setActiveVersionId] = useState(null)

  // 加载版本列表
  const reloadVersions = useCallback(async () => {
    try {
      const list = (await idb.get(VERSIONS_KEY)) || []
      setVersions(list)
      const activeId = (await idb.get(ACTIVE_KEY)) || localStorage.getItem(ACTIVE_KEY) || null
      setActiveVersionId(activeId)
    } catch (e) { console.warn('[HarViewer] 读取版本列表失败', e) }
  }, [])

  useEffect(() => { reloadVersions() }, [reloadVersions])

  const handleFile = async (file) => {
    setLoading(true)
    try {
      if (!/\.har$|\.json$/i.test(file.name)) throw new Error('请选择 .har 或 .json 文件')
      const text = await file.text()
      const har = parseHar(text)
      const processed = har.log.entries.map((e) => ({ ...e, _uid: genUid(), tags: [] }))

      // 💡 存为新版本
      const vid = `v-${Date.now()}`
      const meta = {
        id: vid,
        name: file.name.replace(/\.(har|json)$/i, ''),
        fileName: file.name,
        createdAt: Date.now(),
        count: processed.length,
      }
      await idb.put(entryKey(vid), processed)
      const nextVersions = [meta, ...((await idb.get(VERSIONS_KEY)) || [])]
      await idb.put(VERSIONS_KEY, nextVersions)
      await idb.put(ACTIVE_KEY, vid)
      localStorage.setItem(ACTIVE_KEY, vid)

      // 同时写当前激活 entries（触发上层）
      setEntries(processed)
      setFileName(file.name)
      flushHar?.(processed)
      setVersions(nextVersions)
      setActiveVersionId(vid)
      message.success(`已导入 ${processed.length} 条请求（新版本：${meta.name}）`)
    } catch (e) {
      console.error('[HarViewer] 导入失败:', e)
      message.error(e.message || '导入失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchVersion = async (vid) => {
    if (vid === activeVersionId) return
    try {
      const data = (await idb.get(entryKey(vid))) || []
      setEntries(data)
      setFileName(versions.find((v) => v.id === vid)?.fileName || '')
      await idb.put(ACTIVE_KEY, vid)
      localStorage.setItem(ACTIVE_KEY, vid)
      setActiveVersionId(vid)
      flushHar?.(data)
      message.success(`已切换到版本 ${versions.find((v) => v.id === vid)?.name || vid}`)
    } catch (e) { message.error('切换失败: ' + e.message) }
  }

  const handleDeleteVersion = async (vid) => {
    try {
      await idb.del(entryKey(vid))
      const nextVersions = versions.filter((v) => v.id !== vid)
      await idb.put(VERSIONS_KEY, nextVersions)
      setVersions(nextVersions)
      if (vid === activeVersionId) {
        // 切到剩下的最新一个，或者清空
        if (nextVersions.length > 0) await handleSwitchVersion(nextVersions[0].id)
        else { setEntries([]); setFileName(''); await idb.del(ACTIVE_KEY); setActiveVersionId(null) }
      }
      message.success('已删除版本')
    } catch (e) { message.error('删除失败: ' + e.message) }
  }

  const beforeUpload = (file) => { handleFile(file); return Upload.LIST_IGNORE }

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
        try { next = setPath(next, fieldPath, value) } catch (err) { console.warn(err) }
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
              {entries.length > 0 ? '导入新版本' : '导入'}
            </Button>
          </Upload>
        </Flex>
      </Flex>
      <Flex gap={6} align="center">
        <HistoryOutlined style={{ color: '#888' }} />
        <Select
          size="small"
          style={{ flex: 1 }}
          value={activeVersionId}
          onChange={handleSwitchVersion}
          placeholder="无版本"
          notFoundContent="尚未导入过 HAR"
          options={versions.map((v) => ({
            value: v.id,
            label: `${v.name}（${v.count}条 · ${new Date(v.createdAt).toLocaleString()}）`,
          }))}
          allowClear
          onClear={() => { setEntries([]); setFileName(''); }}
        />
        {activeVersionId && (
          <Popconfirm
            title="删除当前版本？"
            onConfirm={() => handleDeleteVersion(activeVersionId)}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
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
        entries={entries} setEntries={setEntries} projectId={undefined}
        showSelection={true} showAddToProject={true}
        onAddToProject={handleAddToProject}
        headerExtra={headerExtra} emptyNode={emptyNode}
        onUpdateRequest={handleUpdateRequest}
        onUpdateResponse={handleUpdateResponse}
      />
      <AddToProjectModal
        open={addModalOpen} entries={pendingAddEntries}
        onClose={() => setAddModalOpen(false)}
        onAdded={() => setPendingAddEntries([])}
      />
    </>
  )
}