// src/renderer/src/pages/ProjectHistoryPage.jsx
import React, { useState } from 'react';
import {
  Card, Col, Row, Typography, Empty, Button, Popconfirm, App as AntApp, Tag, Flex, Modal, Input, Upload, Space
} from 'antd';
import { FolderOpenOutlined, DeleteOutlined, EditOutlined, UploadOutlined, ImportOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';

const { Text, Title } = Typography;

export default function ProjectHistoryPage({ onOpenProject }) {
  const { projects, deleteProject, renameProject, importProject } = useProjects();
  const { message } = AntApp.useApp();
  
  const [renamingProject, setRenamingProject] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleDelete = (p) => {
    deleteProject(p.id);
    message.success(`项目「${p.name}」已删除`);
  };

  const handleRename = () => {
    if (renamingProject && renameValue.trim()) {
      renameProject(renamingProject.id, renameValue.trim());
      message.success('已重命名');
      setRenamingProject(null);
    }
  };

  // 💡 文件导入处理
  const handleImportFile = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data || !data.groups || !Array.isArray(data.groups)) {
        throw new Error('不是有效的项目数据格式');
      }
      
      const imported = importProject(data);
      message.success(`项目「${imported.name}」导入成功！`);
    } catch (e) {
      console.error('[Import] 解析文件失败:', e);
      message.error(`导入失败: ${e.message}`);
    }
    return false; // 阻止 Upload 默认上传行为
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#fafafa' }}>
      
      {/* 顶部操作区 */}
      <Flex align="center" justify="space-between" style={{ marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>历史项目</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>点击卡片进入项目，或从外部导入备份</Text>
        </div>
        
        <Upload accept=".json" showUploadList={false} beforeUpload={handleImportFile}>
          <Button type="primary" icon={<ImportOutlined />}>导入项目备份</Button>
        </Upload>
      </Flex>

      {projects.length === 0 ? (
        <Flex justify="center" align="center" style={{ height: '60%' }}>
          <Empty description="暂无项目" />
        </Flex>
      ) : (
        <Row gutter={[16, 16]}>
          {projects.map((p) => {
            const total = p.groups.reduce((n, g) => n + g.requests.length, 0);
            return (
              <Col key={p.id} xs={24} sm={12} md={8} xl={6}>
                <Card
                  title={<Flex align="center" gap={6}><Text strong>{p.name}</Text></Flex>}
                  variant="borderless"
                  hoverable
                  onClick={() => onOpenProject?.(p.id)}
                  style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                  extra={
                    <Flex gap={4} onClick={(e) => e.stopPropagation()}>
                      <Button size="small" type="text" icon={<EditOutlined />}
                        onClick={() => { setRenamingProject(p); setRenameValue(p.name); }} />
                      <Button size="small" type="text" icon={<FolderOpenOutlined />}
                        onClick={() => onOpenProject?.(p.id)} />
                      <Popconfirm
                        title={`删除项目「${p.name}」？`}
                        description="此操作不可恢复"
                        onConfirm={() => handleDelete(p)}
                        okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Flex>
                  }
                >
                  <Flex vertical gap={8}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      创建于 {new Date(p.createdAt).toLocaleString()}
                    </Text>
                    <Flex gap={6} wrap>
                      <Tag color="blue">{p.groups.length} 个请求组</Tag>
                      <Tag color="geekblue">{total} 个请求</Tag>
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal title="重命名项目" open={!!renamingProject} onOk={handleRename} onCancel={() => setRenamingProject(null)} okText="保存" cancelText="取消" destroyOnHidden>
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={handleRename} autoFocus placeholder="输入新的项目名称" />
      </Modal>
    </div>
  );
}