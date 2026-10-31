// src/renderer/src/pages/ProjectDetailPage.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Tabs, Modal, Input, Tooltip, List, Checkbox, InputNumber, Space, Drawer, Badge,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ReloadOutlined, HolderOutlined, PlayCircleOutlined, StopOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useScripts } from '../store/scriptStore';
import RequestWorkbench from '../components/RequestWorkbench';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';
import WorkareaToolbar from '../components/WorkareaToolbar';
import usePersistentState from '../hooks/usePersistentState';
import { processTags, updateDecTags, extractVarsOnly } from '../utils/hackTags';

const { Text } = Typography;

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests,
    renameGroup, moveGroup, deleteGroup, reorderGroups,
    updateRequestFields, applyResponse, resetGroupRequests,
    reorderGroupRequests,
  } = useProjects();
  const { scripts } = useScripts();
  const { message } = AntApp.useApp();

  const [activeGroupId, setActiveGroupId] = usePersistentState(`ui-proj-${projectId}-group`, null);
  const [activeTab, setActiveTab] = usePersistentState(`ui-proj-${projectId}-tab`, 'requests');
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportReqs, setSelectedExportReqs] = useState([]);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [intervalSec, setIntervalSec] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const stopFlagRef = useRef(false);
  const [execLogs, setExecLogs] = useState([]);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  useEffect(() => {
    if (!project) return;
    if (activeGroupId && !project.groups.find((g) => g.id === activeGroupId)) setActiveGroupId(null);
  }, [activeGroupId, project, setActiveGroupId]);

  if (!project) return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="项目不存在" /></Flex>;

  const activeGroup = project.groups.find((g) => g.id === activeGroupId);
  const projectProxy = project.proxy || '';

  const handleDeleteProject = () => { deleteProject(projectId); message.success(`已删除`); onBack?.(); };
  const handleDeleteGroup = (g) => { deleteGroup(projectId, g.id); if (activeGroupId === g.id) setActiveGroupId(null); };
  const openRename = (g) => { setRenamingGroup(g); setRenameValue(g.name); };
  const confirmRename = () => { if (renamingGroup && renameValue.trim()) { renameGroup(projectId, renamingGroup.id, renameValue.trim()); setRenamingGroup(null); } };
  
  const handleDragStart = (e, idx) => { setDraggingIndex(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); };
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dropIndex !== idx) setDropIndex(idx); };
  const handleDrop = (e, idx) => { e.preventDefault(); if (draggingIndex != null && draggingIndex !== idx) reorderGroups(projectId, draggingIndex, idx); setDraggingIndex(null); setDropIndex(null); };

  if (activeGroup) {
    const setGroupEntries = (updater) => {
      const next = typeof updater === 'function' ? updater(activeGroup.requests) : updater;
      updateGroupRequests(projectId, activeGroup.id, next);
    };

    const handleSaveUserInfo = async () => {
      if (selectedExportReqs.length === 0) return message.warning('请选择要导出的请求');
      const folderName = `${project.name}_${activeGroup.name}`.replace(/[<>:"/\\|?*]/g, '_');
      const dataToExport = selectedExportReqs.map(uid => {
        const req = activeGroup.requests.find(r => r._uid === uid);
        return { url: req.request.url, method: req.request.method, body: req.request.postData?.text, response: req.response?.content?.text };
      });
      const r = await window.electronAPI?.workarea?.writeJson({ folderName, fileName: 'userInfo.json', data: dataToExport });
      if (r?.ok) { message.success('已导出'); setExportModalOpen(false); } else message.error('导出失败');
    };

    const executeGroup = async () => {
      stopFlagRef.current = false;
      setIsRunning(true);
      setExecLogs([]);
      message.success(`开始执行请求组`);

      let currentReqs = JSON.parse(JSON.stringify(activeGroup.requests));
      const groupCtx = { vars: {}, responses: [], scripts }; 

      while (!stopFlagRef.current) {
        groupCtx.responses = [];
        groupCtx.vars = {}; 

        for (let i = 0; i < currentReqs.length; i++) {
          if (stopFlagRef.current) break;
          const entry = currentReqs[i];
          const uid = entry._uid;
          const req = entry.request || {};
          const method = req.method || 'GET';
          const updates = [];

          try {
            let rawUrl = req.url || '';
            let rawBody = req.postData?.text;
            let rawHeaders = req.headers || [];

            // ==========================================
            // 阶段 1：更新模板状态 (把时间戳、+1等固化到模板)
            // ==========================================
            if (rawBody) {
              const newBody = await updateDecTags(rawBody, groupCtx);
              if (newBody !== rawBody) { req.postData.text = newBody; rawBody = newBody; updates.push({ fieldPath: 'request.postData.text', value: newBody }); }
            }
            const newUrl = await updateDecTags(rawUrl, groupCtx);
            if (newUrl !== rawUrl) { req.url = newUrl; rawUrl = newUrl; updates.push({ fieldPath: 'request.url', value: newUrl }); }
            
            for (let hidx = 0; hidx < rawHeaders.length; hidx++) {
              const h = rawHeaders[hidx];
              if (h.value) {
                const newHVal = await updateDecTags(h.value, groupCtx);
                if (newHVal !== h.value) { h.value = newHVal; rawHeaders[hidx] = h; updates.push({ fieldPath: `request.headers.${hidx}.value`, value: newHVal }); }
              }
            }

            // ==========================================
          
            // ==========================================
            // 阶段 2：基于最新模板，全局预提取变量
            // ==========================================
            rawUrl = await extractVarsOnly(rawUrl, groupCtx);
            if (rawBody) rawBody = await extractVarsOnly(rawBody, groupCtx);
            for (let hidx = 0; hidx < rawHeaders.length; hidx++) {
              if (rawHeaders[hidx].value) {
                rawHeaders[hidx].value = await extractVarsOnly(rawHeaders[hidx].value, groupCtx);
              }
            }
            // ==========================================
            // 阶段 3：生成最终发送的报文
            // ==========================================
            let finalUrl = await processTags(rawUrl, groupCtx);
            let finalBody = rawBody ? await processTags(rawBody, groupCtx) : undefined;
            
            let finalHeaders = {};
            for (const h of rawHeaders) {
              if (h.name && !['host', 'content-length', 'connection'].includes(h.name.toLowerCase())) {
                finalHeaders[h.name] = await processTags(h.value || '', groupCtx);
              }
            }

            // 拼接 Cookie
            const hasCookieHeader = Object.keys(finalHeaders).some(k => k.toLowerCase() === 'cookie');
            if (!hasCookieHeader && Array.isArray(req.cookies) && req.cookies.length > 0) {
              finalHeaders['Cookie'] = req.cookies.map(c => `${c.name}=${c.value}`).join('; ');
            }

            if (updates.length > 0) {
              updateRequestFields(projectId, activeGroup.id, uid, updates);
              currentReqs[i] = { ...entry, request: req };
            }

            // 发送请求
            const res = await window.electronAPI.httpRequest({
              url: finalUrl, method, headers: finalHeaders, body: finalBody, proxy: projectProxy || undefined
            });

            groupCtx.responses.push({ status: res.status, headers: res.headers, body: res.body });

            setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: finalUrl, method, status: res.status, statusText: res.statusText, body: res.body || '', timeCost: res.time }, ...prev]);

            applyResponse(projectId, activeGroup.id, uid, { status: res.status, statusText: res.statusText, headers: res.headers || [], content: { text: res.body, size: res.body?.length || 0, mimeType: 'application/json' }, time: res.time });
            
          } catch (e) {
            groupCtx.responses.push({ status: 0, headers: [], body: `[ERROR] ${e.message}` });
            setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: req.url, method, status: 'ERR', statusText: e.message, body: '', timeCost: 0 }, ...prev]);
          }

          await new Promise(r => setTimeout(r, 50));
        }
        
        if (stopFlagRef.current || !intervalSec || intervalSec <= 0) break;
        await new Promise(r => setTimeout(r, intervalSec * 1000));
      }
      setIsRunning(false);
    };

    return (
      <Flex vertical style={{ height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RequestWorkbench
            entries={activeGroup.requests} setEntries={setGroupEntries} projectId={projectId}
            showSelection={false} showAddToProject={false}
            headerTopExtra={
              <Flex align="center" gap={8} wrap>
                <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setActiveGroupId(null)}>返回</Button>
                <Text strong>{project.name} / {activeGroup.name}</Text>
                <Tag>{activeGroup.requests.length} 条</Tag>
                <WorkareaToolbar projectName={project.name} groupName={activeGroup.name} groupRequests={activeGroup.requests} onFieldSelectForExport={() => { setSelectedExportReqs([]); setExportModalOpen(true); }} />
                <div style={{ flex: 1 }} />
                <Badge count={execLogs.length} size="small"><Button size="small" icon={<FileTextOutlined />} onClick={() => setLogDrawerOpen(true)}>执行日志</Button></Badge>
                {isRunning ? <Button size="small" danger type="primary" icon={<StopOutlined />} onClick={() => { stopFlagRef.current = true; setIsRunning(false); }}>停止</Button> : <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => setRunModalOpen(true)}>按顺序执行</Button>}
                <Button size="small" icon={<ReloadOutlined />} disabled={isRunning} onClick={() => resetGroupRequests(projectId, activeGroup.id)}>重置</Button>
              </Flex>
            }
            enableDrag={true}
            onReorder={(from, to) => reorderGroupRequests(projectId, activeGroup.id, from, to)}
            onUpdateRequest={(uid, updates) => updateRequestFields(projectId, activeGroup.id, uid, updates)}
            onUpdateResponse={(uid, response) => applyResponse(projectId, activeGroup.id, uid, response)}
          />
        </div>
        
        <Modal title="按顺序执行" open={runModalOpen} onOk={() => { setRunModalOpen(false); executeGroup(); }} onCancel={() => setRunModalOpen(false)} okText="开始执行">
          <Space direction="vertical" style={{ marginTop: 12 }}>
            <div>发送前自动处理标签，变量和请求响应会跨请求联动。</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span>定时循环（秒，0 仅一次）：</span>
              <InputNumber min={0} value={intervalSec} onChange={setIntervalSec} />
            </div>
          </Space>
        </Modal>

        <Drawer title="执行结果日志" placement="right" width={600} onClose={() => setLogDrawerOpen(false)} open={logDrawerOpen}>
          <List dataSource={execLogs} renderItem={item => (
            <List.Item>
              <Flex vertical style={{ width: '100%', background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <Space><Tag color={item.status >= 400 || item.status === 'ERR' ? 'error' : 'success'}>{item.status}</Tag><Text strong>{item.method}</Text><Text type="secondary">{item.time}</Text></Space>
                <pre style={{ margin: '8px 0 0', padding: 8, background: '#fff', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{item.body || '（空）'}</pre>
              </Flex>
            </List.Item>
          )} />
        </Drawer>

        <Modal title="选择要导出到 userInfo.json 的请求" open={exportModalOpen} onOk={handleSaveUserInfo} onCancel={() => setExportModalOpen(false)}>
          <List dataSource={activeGroup.requests} renderItem={item => (
            <List.Item>
              <Checkbox checked={selectedExportReqs.includes(item._uid)} onChange={(e) => {
                if (e.target.checked) setSelectedExportReqs([...selectedExportReqs, item._uid]);
                else setSelectedExportReqs(selectedExportReqs.filter(id => id !== item._uid));
              }}>{item.request.method} {item.request.url.slice(0, 50)}...</Checkbox>
            </List.Item>
          )} />
        </Modal>
      </Flex>
    );
  }

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Text strong style={{ fontSize: 18 }}>{project.name}</Text>
        <Popconfirm title="删除项目？" onConfirm={handleDeleteProject}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
      </Flex>
      <Row gutter={[16, 16]}>
        {project.groups.map((g, idx) => (
          <Col key={g.id} xs={24} sm={12} md={8}>
            <div draggable onDragStart={(e) => handleDragStart(e, idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={(e) => handleDrop(e, idx)} onDragEnd={() => { setDraggingIndex(null); setDropIndex(null); }} style={{ opacity: draggingIndex === idx ? 0.4 : 1 }}>
              <Card hoverable onClick={() => setActiveGroupId(g.id)} title={<Flex align="center" gap={6}><HolderOutlined style={{ color: '#bfbfbf' }} /><Text strong ellipsis style={{ maxWidth: 160 }}>{g.name}</Text></Flex>}
                extra={<Flex gap={2} onClick={(e) => e.stopPropagation()}>
                  <Tag style={{ margin: 0 }}>{g.requests.length}</Tag>
                  <Tooltip title="上移"><Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveGroup(projectId, g.id, -1)} /></Tooltip>
                  <Tooltip title="下移"><Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === project.groups.length - 1} onClick={() => moveGroup(projectId, g.id, 1)} /></Tooltip>
                  <Tooltip title="重命名"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openRename(g)} /></Tooltip>
                  <Popconfirm title={`删除请求组「${g.name}」？`} onConfirm={() => handleDeleteGroup(g)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
                </Flex>}>
                <Flex justify="space-between" align="center">
                  <Text type="secondary" style={{ fontSize: 12 }}>点击打开工作台</Text>
                  <Button size="small" type="primary" icon={<FolderOpenOutlined />} onClick={(e) => { e.stopPropagation(); setActiveGroupId(g.id); }}>打开</Button>
                </Flex>
              </Card>
            </div>
          </Col>
        ))}
      </Row>
      <Modal title="重命名" open={!!renamingGroup} onOk={confirmRename} onCancel={() => setRenamingGroup(null)}><Input value={renameValue} onChange={e => setRenameValue(e.target.value)} /></Modal>
    </div>
  );
}