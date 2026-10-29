import React from 'react';
import {
  Card, Col, Row, Typography, Empty, Button, Popconfirm, App as AntApp, Tag, Flex,
} from 'antd';
import { FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';

const { Text } = Typography;

export default function ProjectHistoryPage({ onOpenProject }) {
  const { projects, deleteProject } = useProjects();
  const { message } = AntApp.useApp();

  const handleDelete = (p) => {
    deleteProject(p.id);
    message.success(`项目「${p.name}」已删除`);
  };

  if (projects.length === 0) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%' }}>
        <Empty description="还没有项目，先去「新建项目」创建一个" />
      </Flex>
    );
  }

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Row gutter={16}>
        {projects.map((p) => {
          const total = p.groups.reduce((n, g) => n + g.requests.length, 0);
          return (
            <Col key={p.id} xs={24} sm={12} md={8} style={{ marginBottom: 16 }}>
              <Card
                title={<Flex align="center" gap={6}><Text strong>{p.name}</Text></Flex>}
                variant="borderless"
                hoverable
                onClick={() => onOpenProject?.(p.id)}
                extra={
                  <Flex gap={6} onClick={(e) => e.stopPropagation()}>
                    <Button size="small" icon={<FolderOpenOutlined />}
                      onClick={() => onOpenProject?.(p.id)} />
                    <Popconfirm
                      title={`删除项目「${p.name}」？`}
                      description="此操作不可恢复"
                      onConfirm={() => handleDelete(p)}
                      okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Flex>
                }
              >
                <Flex vertical gap={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    创建于 {new Date(p.createdAt).toLocaleString()}
                  </Text>
                  <Flex gap={6} wrap>
                    <Tag>{p.groups.length} 组</Tag>
                    <Tag color="blue">{total} 个请求</Tag>
                  </Flex>
                  {p.groups.length > 0 && (
                    <Flex wrap gap={4} style={{ marginTop: 4 }}>
                      {p.groups.slice(0, 6).map((g) => (
                        <Tag key={g.id} color="geekblue">{g.name} · {g.requests.length}</Tag>
                      ))}
                      {p.groups.length > 6 && <Tag>+{p.groups.length - 6}</Tag>}
                    </Flex>
                  )}
                </Flex>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}