// src/renderer/src/components/HarViewer.jsx
import { useState } from 'react';
import {
  Flex, Typography, Upload, Button, App,
} from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import RequestWorkbench from './RequestWorkbench';
import AddToProjectModal from './AddToProjectModal';
import { parseHar, genUid, setPath } from '../utils/har';

const { Text } = Typography;

export default function HarViewer({ entries, setEntries, fileName, setFileName, flushHar }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pendingAddEntries, setPendingAddEntries] = useState([]);

  const handleFile = async (file) => {
    setLoading(true);
    try {
      const text = await file.text();
      const har = parseHar(text);
      const processed = har.log.entries.map((e) => ({
        ...e, _uid: genUid(), tags: [],
      }));
      setEntries(processed);
      setFileName(file.name);
      message.success(`已导入 ${processed.length} 条请求`);
      setTimeout(() => flushHar?.(), 100);
    } catch (e) {
      console.error('[HarViewer] 导入失败:', e);
      message.error(e.message || '导入失败');
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleAddToProject = (selected) => {
    if (!selected.length) return;
    setPendingAddEntries(selected);
    setAddModalOpen(true);
  };

  const handleUpdateRequest = (uid, updates) => {
    setEntries((prev) => prev.map((e) => {
      if (e._uid !== uid) return e;
      let next = { ...e };
      for (const { fieldPath, value } of updates) {
        next = setPath(next, fieldPath, value);
      }
      return next;
    }));
  };

  const handleUpdateResponse = (uid, newResponse) => {
    setEntries((prev) =>
      prev.map((e) => (e._uid === uid ? { ...e, response: newResponse } : e))
    );
  };

  const headerExtra = (
    <Flex vertical gap={6}>
      <Flex justify="space-between" align="center">
        <Text strong>HAR 查看器</Text>
        <Flex gap={6} align="center">
          <Upload accept=".har,application/json" showUploadList={false}
            beforeUpload={(file) => handleFile(file)}>
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
  );

  const emptyNode = (
    <Flex justify="center" align="center" style={{ height: '100%', padding: 24 }}>
      <Upload.Dragger accept=".har,application/json" showUploadList={false}
        beforeUpload={(file) => handleFile(file)}>
        <p className="ant-upload-drag-icon"><FileTextOutlined /></p>
        <p className="ant-upload-text">拖拽 HAR 文件到此处</p>
      </Upload.Dragger>
    </Flex>
  );

  return (
    <>
      <RequestWorkbench
        entries={entries}
        setEntries={setEntries}
        projectId={undefined} // 无需项目绑定
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
  );
}