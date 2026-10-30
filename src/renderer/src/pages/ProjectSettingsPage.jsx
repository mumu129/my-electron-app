// src/renderer/src/pages/ProjectSettingsPage.jsx
import React, { useEffect, useState } from 'react';
import {
  Flex, Typography, Select, Empty, Divider, Button, Card, Input,
  App as AntApp, Space,
} from 'antd';
import { SaveOutlined, GlobalOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';

const { Text } = Typography;

function ProxyConfig({ projectId }) {
  const { projects, updateProjectProxy } = useProjects();
  const { message } = AntApp.useApp();
  const project = projects.find((p) => p.id === projectId);
  const [proxy, setProxy] = useState(project?.proxy || '');

  useEffect(() => { setProxy(project?.proxy || ''); }, [projectId, project?.proxy]);

  const handleSave = () => {
    const v = proxy.trim();
    if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) return message.warning('格式错误');
    updateProjectProxy(projectId, v);
    message.success('已保存代理');
  };

  return (
    <Card size="small" title={<Space><GlobalOutlined /><Text strong>网络代理</Text></Space>}
      extra={<Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>} style={{ marginBottom: 16 }}>
      <Input placeholder="如 http://127.0.0.1:7890" value={proxy} onChange={(e) => setProxy(e.target.value)} />
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState();

  if (projects.length === 0) return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="暂无项目" /></Flex>;

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex align="center" gap={12} style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 16 }}>项目设置</Text>
        <Select style={{ width: 220 }} placeholder="选择项目" value={projectId} onChange={setProjectId} options={projects.map(p => ({ value: p.id, label: p.name }))} />
      </Flex>
      <Divider style={{ margin: '8px 0 12px' }} />
      {!projectId ? <Empty description="请选择项目" /> : (
        <>
          <ProxyConfig projectId={projectId} />
          <Divider />
          <AlgorithmConfigPanel projectId={projectId} />
        </>
      )}
    </div>
  );
}