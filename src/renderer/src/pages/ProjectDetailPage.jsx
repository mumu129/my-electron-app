import React, { useState } from 'react';
import {
  Button, Card, Collapse, Flex, List, Tag, Typography, Empty, Popconfirm, App as AntApp,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import RequestDetail from '../components/RequestDetail';

const { Text } = Typography;

export default function ProjectDetailPage({ projectId, onBack }) {
  const { projects, deleteProject } = useProjects();
  const { message } = AntApp.useApp();
  const [preview, setPreview] = useState(null);

  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%' }}>
        <Empty description="项目不存在" />
      </Flex>
    );
  }

  const totalRequests = project.groups.reduce((n, g) => n + g.requests.length, 0);

  const handleDelete = () => {
    deleteProject(project.id);
    message.success(`项目「${project.name}」已删除`);
    onBack?.();
  };

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex align="center" gap={12} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Text strong style={{ fontSize: 18 }}>{project.name}</Text>
        <Tag color="blue">{project.groups.length} 组</Tag>
        <Tag color="green">{totalRequests} 个请求</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          创建于 {new Date(project.createdAt).toLocaleString()}
        </Text>
        <div style={{ flex: 1 }} />
        <Popconfirm
          title={`删除项目「${project.name}」？`}
          description="此操作不可恢复"
          onConfirm={handleDelete}
          okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />}>删除项目</Button>
        </Popconfirm>
      </Flex>

      <Card title="请求组" size="small" style={{ marginBottom: 16 }}>
        {project.groups.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无请求组，去 HAR 页选择请求添加" />
        ) : (
          <Collapse
            size="small"
            items={project.groups.map((g) => ({
              key: g.id,
              label: (
                <Flex justify="space-between">
                  <Text>{g.name}</Text>
                  <Tag>{g.requests.length} 条</Tag>
                </Flex>
              ),
              children: (
                <List
                  size="small"
                  dataSource={g.requests}
                  renderItem={(r) => (
                    <List.Item style={{ cursor: 'pointer' }} onClick={() => setPreview(r)}>
                      <Flex align="center" gap={8} style={{ width: '100%' }}>
                        <Tag style={{ margin: 0, minWidth: 48, textAlign: 'center' }}>
                          {r.request?.method}
                        </Tag>
                        <Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                          {r.request?.url}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{r.response?.status}</Text>
                      </Flex>
                    </List.Item>
                  )}
                />
              ),
            }))}
          />
        )}
      </Card>

      <Card title="项目算法" size="small">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="项目算法功能开发中" />
      </Card>

      <RequestDetail entry={preview} open={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}