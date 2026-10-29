import React, { useEffect, useState } from 'react';
import {
  Flex, Typography, Select, Empty, Divider, Button, Card, Form, Input,
  App as AntApp, Alert, Space,
} from 'antd';
import { SaveOutlined, GlobalOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useAlgorithms } from '../store/algorithmStore';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';

const { Text } = Typography;

function ProxyConfig({ projectId }) {
  const { projects, updateProjectProxy } = useProjects();
  const { message } = AntApp.useApp();
  const project = projects.find((p) => p.id === projectId);
  const [proxy, setProxy] = useState(project?.proxy || '');

  useEffect(() => {
    setProxy(project?.proxy || '');
  }, [projectId, project?.proxy]);

  const handleSave = () => {
    const v = proxy.trim();
    // 简单校验：空 or 含 ://
    if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) {
      message.warning('代理地址格式示例：http://127.0.0.1:7890 或 socks5://127.0.0.1:1080');
      return;
    }
    updateProjectProxy(projectId, v);
    message.success(v ? `已设置代理：${v}` : '已清除代理');
  };

  return (
    <Card
      size="small"
      title={<Space><GlobalOutlined /><Text strong>网络代理</Text></Space>}
      extra={
        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>
          保存
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      <Flex gap={8} align="center">
        <Input
          placeholder="如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080（留空表示不使用代理）"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          style={{ flex: 1 }}
        />
      </Flex>
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 8 }}
        message="该项目的「按顺序执行」会用此代理发送请求。留空则使用系统默认网络。"
      />
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState();

  if (projects.length === 0) {
    return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="还没有项目" /></Flex>;
  }

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Flex align="center" gap={12}>
          <Text strong style={{ fontSize: 16 }}>项目设置</Text>
          <Select style={{ width: 220 }} placeholder="选择项目" value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Flex>
        <Text type="secondary" style={{ fontSize: 12 }}>项目配置优先于全局配置</Text>
      </Flex>
      <Divider style={{ margin: '8px 0 12px' }} />

      {!projectId ? (
        <Empty description="请选择要配置的项目" />
      ) : (
        <>
          <ProxyConfig projectId={projectId} />
          <Divider />
          <AlgorithmConfigPanel projectId={projectId} />
        </>
      )}
    </div>
  );
}