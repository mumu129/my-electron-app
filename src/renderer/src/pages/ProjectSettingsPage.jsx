import React, { useState } from 'react';
import { Flex, Typography, Select, Empty, Divider } from 'antd';
import { useProjects } from '../store/projectStore';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';

const { Text } = Typography;

export default function ProjectSettingsPage() {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState();

  if (projects.length === 0) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%' }}>
        <Empty description="还没有项目，先去「新建项目」创建一个" />
      </Flex>
    );
  }

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Flex align="center" gap={12}>
          <Text strong style={{ fontSize: 16 }}>项目设置</Text>
          <Select
            style={{ width: 200 }}
            placeholder="选择项目"
            value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Flex>
        <Text type="secondary" style={{ fontSize: 12 }}>
          项目配置优先于全局配置
        </Text>
      </Flex>
      <Divider style={{ margin: '8px 0 12px' }} />

      {!projectId ? (
        <Empty description="请选择要配置的项目" />
      ) : (
        <AlgorithmConfigPanel projectId={projectId} />
      )}
    </div>
  );
}