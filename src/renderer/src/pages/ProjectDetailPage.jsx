import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Tabs, Modal, Input, Tooltip, List, Checkbox,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ReloadOutlined, HolderOutlined,
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import RequestWorkbench from '../components/RequestWorkbench';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';
import WorkareaToolbar from '../components/WorkareaToolbar';
import usePersistentState from '../hooks/usePersistentState';

const { Text } = Typography;

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests,
    renameGroup, moveGroup, deleteGroup, reorderGroups,
    updateRequestFields, applyResponse, resetGroupRequests,
    reorderGroupRequests,
  } = useProjects();
  const { message } = AntApp.useApp();

  const [activeGroupId, setActiveGroupId] = usePersistentState(`ui-proj-${projectId}-group`, null);
  const [activeTab, setActiveTab] = usePersistentState(`ui-proj-${projectId}-tab`, 'requests');

  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  
  // 导出 userInfo 的 Modal 状态
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportReqs, setSelectedExportReqs] = useState([]);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  useEffect(() => {
    if (!project) return;
    if (activeGroupId && !project.groups.find((g) => g.id === activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [activeGroupId, project, setActiveGroupId]);

  if (!project) {
    return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="项目不存在" /></Flex>;
  }

  const activeGroup = project.groups.find((g) => g.id === activeGroupId);
  const projectProxy = project.proxy || '';

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

  const handleDragStart = (e, idx) => {
    setDraggingIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropIndex !== idx) setDropIndex(idx);
  };
  const handleDrop = (e, idx) => {
    e.preventDefault();
    const from = draggingIndex;
    if (from != null && from !== idx) reorderGroups(projectId, from, idx);
    setDraggingIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => { setDraggingIndex(null); setDropIndex(null); };

  /* ===== 请求组工作台 ===== */
  if (activeGroup) {
    const setGroupEntries = (updater) => {
      const cur = activeGroup.requests;
      const next = typeof updater === 'function' ? updater(cur) : updater;
      updateGroupRequests(projectId, activeGroup.id, next);
    };

    // 导出 userInfo 逻辑
    const handleSaveUserInfo = async () => {
      if (selectedExportReqs.length === 0) return message.warning('请选择要导出的请求');
      const folderName = `${project.name}_${activeGroup.name}`.replace(/[<>:"/\\|?*]/g, '_');
      const dataToExport = selectedExportReqs.map(uid => {
        const req = activeGroup.requests.find(r => r._uid === uid);
        return {
          url: req.request.url,
          method: req.request.method,
          body: req.request.postData?.text,
          response: req.response?.content?.text
        };
      });

      const r = await window.electronAPI?.workarea?.writeJson({
        folderName,
        fileName: 'userInfo.json',
        data: dataToExport
      });
      if (r?.ok) {
        message.success('已导出 userInfo.json');
        setExportModalOpen(false);
      } else {
        message.error(r?.error || '导出失败');
      }
    };

    const workbenchTopExtra = (
      <Flex align="center" gap={8} wrap>
        <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setActiveGroupId(null)}>返回</Button>
        <Text strong>{project.name} / {activeGroup.name}</Text>
        <Tag>{activeGroup.requests.length} 条</Tag>
        {projectProxy && <Tag color="blue">代理: {projectProxy}</Tag>}
        
        <WorkareaToolbar
          projectName={project.name}
          groupName={activeGroup.name}
          groupRequests={activeGroup.requests}
          onFieldSelectForExport={() => {
            setSelectedExportReqs([]);
            setExportModalOpen(true);
          }}
        />

        <div style={{ flex: 1 }} />
        <Tooltip title="恢复所有请求到初始状态">
          <Button size="small" icon={<ReloadOutlined />}
            onClick={() => { resetGroupRequests(projectId, activeGroup.id); message.success('已重置'); }}>
            重置
          </Button>
        </Tooltip>
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
            enableDrag={true}
            onReorder={(from, to) => reorderGroupRequests(projectId, activeGroup.id, from, to)}
            onUpdateRequest={(uid, updates) => updateRequestFields(projectId, activeGroup.id, uid, updates)}
            onUpdateResponse={(uid, response) => applyResponse(projectId, activeGroup.id, uid, response)}
          />
        </div>

        <Modal title="选择要导出到 userInfo.json 的请求" open={exportModalOpen} onOk={handleSaveUserInfo} onCancel={() => setExportModalOpen(false)}>
          <List
            dataSource={activeGroup.requests}
            renderItem={item => (
              <List.Item>
                <Checkbox 
                  checked={selectedExportReqs.includes(item._uid)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedExportReqs([...selectedExportReqs, item._uid]);
                    else setSelectedExportReqs(selectedExportReqs.filter(id => id !== item._uid));
                  }}
                >
                  {item.request.method} {item.request.url.slice(0, 50)}...
                </Checkbox>
              </List.Item>
            )}
          />
        </Modal>
      </Flex>
    );
  }

  /* ===== 项目总览 ===== */
  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex align="center" gap={12} style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Text strong style={{ fontSize: 18 }}>{project.name}</Text>
        <Tag color="blue">{project.groups.length} 组</Tag>
        {projectProxy && <Tag color="green">代理: {projectProxy}</Tag>}
        <Text type="secondary" style={{ fontSize: 12 }}>创建于 {new Date(project.createdAt).toLocaleString()}</Text>
        <div style={{ flex: 1 }} />
        <Popconfirm title={`删除项目「${project.name}」？`} description="此操作不可恢复"
          onConfirm={handleDeleteProject} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
          <Button danger icon={<DeleteOutlined />}>删除项目</Button>
        </Popconfirm>
      </Flex>

      <Tabs activeKey={activeTab} onChange={setActiveTab}
        items={[
          {
            key: 'requests', label: '请求组',
            children: project.groups.length === 0 ? (
              <Empty description="暂无请求组，去 HAR 页选择请求添加" />
            ) : (
              <Row gutter={[16, 16]}>
                {project.groups.map((g, idx) => (
                  <Col key={g.id} xs={24} sm={12} md={8}>
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                      style={{
                        opacity: draggingIndex === idx ? 0.4 : 1,
                        outline: dropIndex === idx && draggingIndex !== idx ? '2px dashed #1677ff' : 'none',
                        borderRadius: 8,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <Card
                        hoverable onClick={() => setActiveGroupId(g.id)}
                        title={<Flex align="center" gap={6}><HolderOutlined style={{ color: '#bfbfbf' }} /><Text strong ellipsis style={{ maxWidth: 160 }}>{g.name}</Text></Flex>}
                        extra={
                          <Flex gap={2} onClick={(e) => e.stopPropagation()}>
                            <Tag style={{ margin: 0 }}>{g.requests.length}</Tag>
                            <Tooltip title="上移"><Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveGroup(projectId, g.id, -1)} /></Tooltip>
                            <Tooltip title="下移"><Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === project.groups.length - 1} onClick={() => moveGroup(projectId, g.id, 1)} /></Tooltip>
                            <Tooltip title="重命名"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openRename(g)} /></Tooltip>
                            <Popconfirm title={`删除请求组「${g.name}」？`} onConfirm={() => handleDeleteGroup(g)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Flex>
                        }
                      >
                        <Flex justify="space-between" align="center">
                          <Text type="secondary" style={{ fontSize: 12 }}>点击打开工作台</Text>
                          <Button size="small" type="primary" icon={<FolderOpenOutlined />} onClick={(e) => { e.stopPropagation(); setActiveGroupId(g.id); }}>打开</Button>
                        </Flex>
                      </Card>
                    </div>
                  </Col>
                ))}
              </Row>
            ),
          },
          { key: 'algorithms', label: '项目算法', children: <AlgorithmConfigPanel projectId={projectId} /> },
        ]} />

      <Modal title="重命名请求组" open={!!renamingGroup} onOk={confirmRename} onCancel={() => setRenamingGroup(null)} okText="保存" cancelText="取消" destroyOnHidden>
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={confirmRename} autoFocus placeholder="输入新的请求组名称" />
      </Modal>
    </div>
  );
}