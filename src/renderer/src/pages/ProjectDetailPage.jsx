import React, { useMemo, useState } from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Tabs, Modal, Input, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ArrowUpOutlined, ArrowDownOutlined, ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import RequestWorkbench from '../components/RequestWorkbench';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';
import GroupRunnerModal from '../components/GroupRunnerModal';

const { Text } = Typography;

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests,
    renameGroup, moveGroup, deleteGroup,
    updateRequestFields, applyResponse, resetGroupRequests,
  } = useProjects();
  const { message } = AntApp.useApp();
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeTab, setActiveTab] = useState('requests');

  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [runnerGroup, setRunnerGroup] = useState(null);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  if (!project) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%' }}>
        <Empty description="项目不存在" />
      </Flex>
    );
  }

  const activeGroup = project.groups.find((g) => g.id === activeGroupId);

  const handleDeleteProject = () => {
    deleteProject(projectId);
    message.success(`项目「${project.name}」已删除`);
    onBack?.();
  };

  const handleDeleteGroup = (g) => {
    deleteGroup(projectId, g.id);
    message.success(`已删除请求组「${g.name}」`);
    if (activeGroupId === g.id) setActiveGroupId(null);
  };

  const openRename = (g) => { setRenamingGroup(g); setRenameValue(g.name); };
  const confirmRename = () => {
    if (!renamingGroup) return;
    const n = renameValue.trim();
    if (!n) { message.warning('名称不能为空'); return; }
    renameGroup(projectId, renamingGroup.id, n);
    message.success('已重命名');
    setRenamingGroup(null);
  };

  // ===== 请求组工作台 =====
  if (activeGroup) {
    const setGroupEntries = (updater) => {
      const cur = activeGroup.requests;
      const next = typeof updater === 'function' ? updater(cur) : updater;
      updateGroupRequests(projectId, activeGroup.id, next);
    };

    const workbenchTopExtra = (
      <Flex align="center" gap={8} wrap>
        <Button size="small" icon={<ArrowLeftOutlined />}
          onClick={() => setActiveGroupId(null)}>返回</Button>
        <Text strong>{project.name} / {activeGroup.name}</Text>
        <Tag>{activeGroup.requests.length} 条</Tag>
        <div style={{ flex: 1 }} />
        <Tooltip title="恢复所有请求到初始状态（保留算法链）">
          <Button size="small" icon={<ReloadOutlined />}
            onClick={() => {
              resetGroupRequests(projectId, activeGroup.id);
              message.success('已重置');
            }}>
            重置
          </Button>
        </Tooltip>
        <Button size="small" type="primary" icon={<ThunderboltOutlined />}
          onClick={() => setRunnerGroup(activeGroup)}
          disabled={activeGroup.requests.length === 0}>
          按顺序执行
        </Button>
      </Flex>
    );

    return (
      <Flex vertical style={{ height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RequestWorkbench
            entries={activeGroup.requests}
            setEntries={setGroupEntries}
            projectId={projectId}
            showSelection={false}
            showAddToProject={false}
            headerTopExtra={workbenchTopExtra}
          />
        </div>
        <GroupRunnerModal
          open={!!runnerGroup}
          onClose={() => setRunnerGroup(null)}
          groupName={runnerGroup?.name}
          requests={runnerGroup?.requests || []}
          projectId={projectId}
          onUpdateRequestFields={(uid, updates) =>
            updateRequestFields(projectId, activeGroup.id, uid, updates)
          }
          onApplyResponse={(uid, response) =>
            applyResponse(projectId, activeGroup.id, uid, response)
          }
          onReset={() => resetGroupRequests(projectId, activeGroup.id)}
        />
      </Flex>
    );
  }

  // ===== 项目总览 =====
  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex align="center" gap={12} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Text strong style={{ fontSize: 18 }}>{project.name}</Text>
        <Tag color="blue">{project.groups.length} 组</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          创建于 {new Date(project.createdAt).toLocaleString()}
        </Text>
        <div style={{ flex: 1 }} />
        <Popconfirm
          title={`删除项目「${project.name}」？`}
          description="此操作不可恢复"
          onConfirm={handleDeleteProject}
          okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />}>删除项目</Button>
        </Popconfirm>
      </Flex>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'requests',
            label: '请求组',
            children: project.groups.length === 0 ? (
              <Empty description="暂无请求组，去 HAR 页选择请求添加" />
            ) : (
              <Row gutter={[16, 16]}>
                {project.groups.map((g, idx) => (
                  <Col key={g.id} xs={24} sm={12} md={8}>
                    <Card
                      hoverable
                      onClick={() => setActiveGroupId(g.id)}
                      title={<Text strong ellipsis style={{ maxWidth: 160 }}>{g.name}</Text>}
                      extra={
                        <Flex gap={2} onClick={(e) => e.stopPropagation()}>
                          <Tag style={{ margin: 0 }}>{g.requests.length}</Tag>
                          <Tooltip title="上移">
                            <Button size="small" type="text" icon={<ArrowUpOutlined />}
                              disabled={idx === 0}
                              onClick={() => moveGroup(projectId, g.id, -1)} />
                          </Tooltip>
                          <Tooltip title="下移">
                            <Button size="small" type="text" icon={<ArrowDownOutlined />}
                              disabled={idx === project.groups.length - 1}
                              onClick={() => moveGroup(projectId, g.id, 1)} />
                          </Tooltip>
                          <Tooltip title="重命名">
                            <Button size="small" type="text" icon={<EditOutlined />}
                              onClick={() => openRename(g)} />
                          </Tooltip>
                          <Tooltip title="按顺序执行">
                            <Button size="small" type="text" icon={<ThunderboltOutlined />}
                              onClick={() => setRunnerGroup(g)} />
                          </Tooltip>
                          <Popconfirm
                            title={`删除请求组「${g.name}」？`}
                            description="组内请求将被移除"
                            onConfirm={() => handleDeleteGroup(g)}
                            okText="删除" cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Flex>
                      }
                    >
                      <Flex justify="space-between" align="center">
                        <Text type="secondary" style={{ fontSize: 12 }}>点击打开工作台</Text>
                        <Button size="small" type="primary" icon={<FolderOpenOutlined />}
                          onClick={(e) => { e.stopPropagation(); setActiveGroupId(g.id); }}>
                          打开
                        </Button>
                      </Flex>
                    </Card>
                  </Col>
                ))}
              </Row>
            ),
          },
          {
            key: 'algorithms',
            label: '项目算法',
            children: <AlgorithmConfigPanel projectId={projectId} />,
          },
        ]}
      />

      <Modal
        title="重命名请求组"
        open={!!renamingGroup}
        onOk={confirmRename}
        onCancel={() => setRenamingGroup(null)}
        okText="保存" cancelText="取消" destroyOnHidden
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={confirmRename}
          autoFocus
          placeholder="输入新的请求组名称"
        />
      </Modal>

      {runnerGroup && (
        <GroupRunnerModal
          open={!!runnerGroup}
          onClose={() => setRunnerGroup(null)}
          groupName={runnerGroup.name}
          requests={runnerGroup.requests || []}
          projectId={projectId}
          onUpdateRequestFields={(uid, updates) =>
            updateRequestFields(projectId, runnerGroup.id, uid, updates)
          }
          onApplyResponse={(uid, response) =>
            applyResponse(projectId, runnerGroup.id, uid, response)
          }
          onReset={() => resetGroupRequests(projectId, runnerGroup.id)}
        />
      )}
    </div>
  );
}