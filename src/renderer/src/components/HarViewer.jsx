import { useState } from 'react';
import {
  Flex, Typography, Upload, Button, Select, App,
} from 'antd';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import RequestWorkbench from './RequestWorkbench';
import AddToProjectModal from './AddToProjectModal';
import { parseHar, genUid } from '../utils/har';
import { useProjects } from '../store/projectStore';

const { Text } = Typography;

export default function HarViewer({ entries, setEntries, fileName, setFileName }) {
  const { message } = App.useApp();
  const { projects } = useProjects();
  const [loading, setLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState();
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

  const headerExtra = (
    <Flex vertical gap={6}>
      <Flex justify="space-between" align="center">
        <Text strong>HAR 查看器</Text>
        <Flex gap={6} align="center">
          <Select
            size="small"
            placeholder="选择项目（算法配置）"
            allowClear
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            style={{ width: 160 }}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
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
        projectId={selectedProjectId}
        showSelection={true}
        showAddToProject={true}
        onAddToProject={handleAddToProject}
        headerExtra={headerExtra}
        emptyNode={emptyNode}
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