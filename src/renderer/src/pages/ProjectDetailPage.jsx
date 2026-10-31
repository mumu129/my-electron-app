// src/renderer/src/pages/ProjectDetailPage.jsx
import React, { useEffect, useMemo, useState, useRef, useCallback} from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Modal, Input, Tooltip, List, Checkbox, InputNumber, Space, Drawer, Badge, Segmented, Table, Dropdown, Divider, Breadcrumb, Form, Splitter
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ReloadOutlined, HolderOutlined, PlayCircleOutlined, StopOutlined, FileTextOutlined,
  DownloadOutlined, GlobalOutlined, PlusOutlined, SettingOutlined,
  MoreOutlined, FolderOutlined, SaveOutlined, KeyOutlined,
  PauseCircleOutlined, CaretRightOutlined, LoadingOutlined
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useScripts } from '../store/scriptStore';
import { useEnvs } from '../store/envStore';
import RequestWorkbench from '../components/RequestWorkbench';
import usePersistentState from '../hooks/usePersistentState';
import { processTags, updateOpTags, extractVarsOnly } from '../utils/hackTags';
import { TRANSFORMS } from '../utils/strictTransforms';

const { Text, Title } = Typography;

const uid = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests, updateSubGroupRequests,
    renameGroup, deleteGroup, reorderGroups, reorderGroupRequests,
    updateRequestFields, applyResponse, resetGroupRequests, resetSelectedRequests,
    updateGroupConfig, removeGroupConfig, updateGroupProxy, updateSubGroup, createGroup,
    // 💡 [修复] 新增：获取项目最新快照
    getProjectSnapshot,
  } = useProjects();
  const { scripts } = useScripts();
  const { envs } = useEnvs();
  const { message } = AntApp.useApp();

  const [activeGroupId, setActiveGroupId] = usePersistentState(`ui-proj-${projectId}-group`, null);
  const [activeLevel, setActiveLevel] = useState('main');
  
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [intervalSec, setIntervalSec] = useState(0);
  
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  
  const stopAfterRoundRef = useRef(false);
  const pauseFlagRef = useRef(false);
  
  const [execLogs, setExecLogs] = useState([]);
  
  const [monitorModalOpen, setMonitorModalOpen] = useState(false);
  const [execCurrentLevel, setExecCurrentLevel] = useState('-'); 

  const [subConfigDrawerOpen, setSubConfigDrawerOpen] = useState(false);
  const [algoConfigDrawerOpen, setAlgoConfigDrawerOpen] = useState(false);

  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyValue, setProxyValue] = useState('');

  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const [basePath, setBasePath] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportReqs, setSelectedExportReqs] = useState([]);
  const [runJsModalOpen, setRunJsModalOpen] = useState(false);

  const pendingSubPayloadRef = useRef(null);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const activeGroup = project?.groups.find((g) => g.id === activeGroupId);

  useEffect(() => {
    window.electronAPI?.workarea?.getPath().then(r => { if (r?.ok) setBasePath(r.path); });
  }, []);

  useEffect(() => {
    if (!project) return;
    if (activeGroupId && !project.groups.find((g) => g.id === activeGroupId)) setActiveGroupId(null);
  }, [activeGroupId, project, setActiveGroupId]);

  if (!project) return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="项目不存在" /></Flex>;

  const handleBindPath = async () => {
    const r = await window.electronAPI?.workarea?.setPath();
    if (r?.ok) { setBasePath(r.path); message.success('已绑定工作区'); }
  };

  const handleCreateFolder = async () => {
    if (!basePath) return message.warning('请先绑定工作区路径');
    const folderName = `${project.name}_${activeGroup?.name || 'Main'}`.replace(/[<>:"/\\|?*]/g, '_');
    const r = await window.electronAPI?.workarea?.mkdir({ folderName });
    if (r?.ok) message.success(`已创建文件夹：${folderName}`);
    else message.error(r?.error || '创建失败');
  };

  const handleExportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const a = document.createElement('a'); 
    a.setAttribute("href", dataStr); 
    a.setAttribute("download", `${project.name}_export.json`);
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
    message.success('项目备份已下载');
  };

  const handleExportUserInfo = () => {
    if (!activeGroup) return;
    setSelectedExportReqs([]);
    setExportModalOpen(true);
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

  const handleRunJs = async () => {
    if (!basePath) return message.warning('请先绑定工作区路径');
    const folderName = `${project.name}_${activeGroup.name}`.replace(/[<>:"/\\|?*]/g, '_');
    const r = await window.electronAPI?.workarea?.run({ folderName, intervalSec: 0 });
    if (r?.ok) {
      message.success(r.msg);
      setRunJsModalOpen(false);
    } else {
      message.error(r.error);
    }
  };

  if (!activeGroup) {
    const handleCreateGroup = () => {
      if (!newGroupName.trim()) return message.warning('请输入请求组名称');
      const g = createGroup(projectId, newGroupName.trim());
      setNewGroupModalOpen(false);
      setNewGroupName('');
      message.success(`请求组「${g.name}」已创建`);
      setActiveGroupId(g.id);
    };

    const confirmRename = () => {
      if (renamingGroup && renameValue.trim()) {
        renameGroup(projectId, renamingGroup.id, renameValue.trim());
        setRenamingGroup(null);
        message.success('已重命名');
      }
    };

    const handleDragStart = (e, idx) => { setDraggingIndex(idx); e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e, idx) => { e.preventDefault(); if (dropIndex !== idx) setDropIndex(idx); };
    const handleDrop = (e, idx) => { 
      e.preventDefault(); 
      if (draggingIndex != null && draggingIndex !== idx) reorderGroups(projectId, draggingIndex, idx); 
      setDraggingIndex(null); 
      setDropIndex(null); 
    };

    return (
      <div style={{ padding: '32px 40px', height: '100%', overflow: 'auto', background: '#f5f7fa' }}>
        <Flex align="center" gap={16} style={{ marginBottom: 32 }}>
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={onBack} />
          <div>
            <Title level={3} style={{ margin: 0 }}>{project.name}</Title>
            <Text type="secondary">请求组管理 · 拖拽卡片可排序</Text>
          </div>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExportProject}>导出项目</Button>
            <Popconfirm title="删除项目？" description="不可恢复" onConfirm={() => { deleteProject(projectId); onBack?.(); }}>
              <Button danger icon={<DeleteOutlined />}>删除项目</Button>
            </Popconfirm>
          </Space>
        </Flex>

        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} md={8} xl={6}>
            <div 
              onClick={() => setNewGroupModalOpen(true)}
              style={{ 
                height: 140, border: '2px dashed #d9d9d9', borderRadius: 12, 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', background: 'transparent', transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.color = '#1677ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.color = 'inherit'; }}
            >
              <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
              <Text>新建请求组</Text>
            </div>
          </Col>

          {project.groups.map((g, idx) => (
            <Col key={g.id} xs={24} sm={12} md={8} xl={6}>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => { setDraggingIndex(null); setDropIndex(null); }}
                style={{
                  opacity: draggingIndex === idx ? 0.4 : 1,
                  outline: dropIndex === idx && draggingIndex !== idx ? '2px dashed #1677ff' : 'none',
                  borderRadius: 12, height: '100%', transition: 'all 0.2s'
                }}
              >
                <Card 
                  hoverable 
                  onClick={() => setActiveGroupId(g.id)} 
                  style={{ height: 140, borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}
                  styles={{ body: { padding: 20, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' } }}
                >
                  <Flex justify="space-between" align="flex-start">
                    <Flex align="center" gap={8}>
                      <HolderOutlined style={{ color: '#bfbfbf', cursor: 'grab' }} />
                      <Text strong style={{ fontSize: 16 }} ellipsis>{g.name}</Text>
                    </Flex>
                    <Dropdown menu={{
                      items: [
                        { key: 'rename', label: '重命名', icon: <EditOutlined />, onClick: (e) => { e.domEvent.stopPropagation(); setRenamingGroup(g); setRenameValue(g.name); } },
                        { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: (e) => { e.domEvent.stopPropagation(); deleteGroup(projectId, g.id); } }
                      ]
                    }}>
                      <Button size="small" type="text" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
                    </Dropdown>
                  </Flex>
                  
                  <Flex justify="space-between" align="flex-end">
                    <Space size={4}>
                      <Tag color="blue">主 {g.requests.length}</Tag>
                      <Tag color="orange">副 {g.subGroup?.requests?.length || 0}</Tag>
                    </Space>
                    <Button size="small" type="primary" ghost icon={<FolderOpenOutlined />}>打开</Button>
                  </Flex>
                </Card>
              </div>
            </Col>
          ))}
        </Row>

        <Modal title="新建请求组" open={newGroupModalOpen} onOk={handleCreateGroup} onCancel={() => setNewGroupModalOpen(false)}>
          <Input placeholder="输入请求组名称" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} onPressEnter={handleCreateGroup} autoFocus />
        </Modal>

        <Modal title="重命名请求组" open={!!renamingGroup} onOk={confirmRename} onCancel={() => setRenamingGroup(null)}>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} onPressEnter={confirmRename} autoFocus />
        </Modal>
      </div>
    );
  }

  const isSubMode = activeLevel === 'sub';
  const currentReqs = isSubMode ? (activeGroup.subGroup?.requests || []) : activeGroup.requests;
  const subConfig = activeGroup.subGroup || { zones: [], successKeyword: '"code":200', maxRetries: 3, judgeVar: 'level', proxy: '' };
  
  const currentConfigs = isSubMode 
    ? (activeGroup.configs?.sub || {}) 
    : (activeGroup.configs?.main || (activeGroup.configs?.sub ? {} : activeGroup.configs) || {});

  const mainProxy = activeGroup.proxy || '';
  const currentProxy = isSubMode && subConfig.proxy ? subConfig.proxy : mainProxy;

  // 💡 [修复 #4] 直接把 updater 交给 store，内部基于最新 state 计算，
// 避免用渲染期快照 currentReqs 覆盖执行引擎已更新但尚未渲染的结果。
const setEntries = (updater) => {
  if (!isSubMode) updateGroupRequests(projectId, activeGroup.id, updater);
  else updateSubGroupRequests(projectId, activeGroup.id, updater);
};
 // 💡 [修复 #3] saveSubConfig 直接传 patch，store 做浅合并；不再依赖外部旧 subConfig
const saveSubConfig = (patch) => updateSubGroup(projectId, activeGroup.id, patch);
// 💡 [修复 #3] 用函数式 patch 基于 store 内最新 zones，避免覆盖执行引擎的 updates
const handleAddZone = () => updateSubGroup(projectId, activeGroup.id, (prev) => ({
  zones: [...(prev.zones || []), { id: uid(), min: 0, max: 0, status: 'none' }],
}));
const handleUpdateZone = (id, field, val) => updateSubGroup(projectId, activeGroup.id, (prev) => ({
  zones: (prev.zones || []).map(z => (z.id === id ? { ...z, [field]: val } : z)),
}));
const handleDeleteZone = (id) => updateSubGroup(projectId, activeGroup.id, (prev) => ({
  zones: (prev.zones || []).filter(z => z.id !== id),
}));
const handleResetZoneStatus = (id) => updateSubGroup(projectId, activeGroup.id, (prev) => ({
  zones: (prev.zones || []).map(z => (z.id === id ? { ...z, status: 'none' } : z)),
}));
  const processSingleEntry = async (entry, ctx, source = 'main') => {
    const uid = entry._uid;
    const req = entry.request || {};
    const method = req.method || 'GET';
    const updates = [];

    try {
      let rawUrl = req.url || '';
      let rawBody = req.postData?.text;
      let rawHeaders = req.headers || [];

      const allTextFields = [rawUrl, rawBody, ...rawHeaders.map(h => h.value)].filter(Boolean);
      for (const text of allTextFields) {
        await extractVarsOnly(text, ctx);
      }

      let updatedUrl = await updateOpTags(rawUrl, ctx);
      let updatedBody = rawBody ? await updateOpTags(rawBody, ctx) : undefined;
      let updatedHeaders = [...rawHeaders];
      
      for (let i = 0; i < updatedHeaders.length; i++) {
        if (updatedHeaders[i].value) {
          updatedHeaders[i] = { ...updatedHeaders[i], value: await updateOpTags(updatedHeaders[i].value, ctx) };
        }
      }

      if (updatedUrl !== rawUrl) updates.push({ fieldPath: 'request.url', value: updatedUrl });
      if (updatedBody && updatedBody !== rawBody) updates.push({ fieldPath: 'request.postData.text', value: updatedBody });
      updatedHeaders.forEach((h, i) => {
        if (h.value !== rawHeaders[i].value) updates.push({ fieldPath: `request.headers.${i}.value`, value: h.value });
      });
      
      if (updates.length > 0) {
        updateRequestFields(projectId, activeGroup.id, uid, updates, source === 'sub' ? 'sub' : 'main');
      }

      let finalUrl = await processTags(updatedUrl, ctx);
      let finalBody = updatedBody ? await processTags(updatedBody, ctx) : undefined;
      
      let finalHeaders = {};
      for (const h of updatedHeaders) {
        if (h.name && !['host', 'content-length', 'connection'].includes(h.name.toLowerCase())) {
          finalHeaders[h.name] = await processTags(h.value || '', ctx);
        }
      }

      const payload = { url: finalUrl, method, headers: finalHeaders, body: finalBody, proxy: currentProxy || undefined };
      const res = await window.electronAPI.httpRequest(payload);

      ctx.responses.push({ status: res.status, headers: res.headers, body: res.body });

      setExecLogs(prev => [{ 
        id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: finalUrl, method, 
        status: res.status, statusText: res.statusText, body: res.body || '', timeCost: res.time, source 
      }, ...prev].slice(0, 150));
      
      applyResponse(projectId, activeGroup.id, uid, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers || [],
        content: { text: res.body, size: res.body?.length || 0, mimeType: 'application/json' },
        time: res.time,
      }, source === 'sub' ? 'sub' : 'main');

      return { ...res, _payload: payload };
    } catch (e) {
      ctx.responses.push({ status: 0, headers: [], body: `[ERROR] ${e.message}` });
      setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: req.url, method, status: 'ERR', statusText: e.message, body: '', timeCost: 0, source }, ...prev].slice(0, 150));
      return null;
    }
  };

  const executeGroup = async (isSoloSub = false) => {
    stopAfterRoundRef.current = false;
    pauseFlagRef.current = false;
    setIsPaused(false);
    setIsStopping(false);
    setIsRunning(true);
    setExecLogs([]);
    setExecCurrentLevel('-');
    pendingSubPayloadRef.current = null;
    
    message.success(isSoloSub ? `开始单独调试副组` : `开始执行主组流程`);

    const checkPause = async () => {
      while (pauseFlagRef.current && !stopAfterRoundRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
    };

    while (!stopAfterRoundRef.current) {
      // 💡 [修复] 每轮从 store 重新拉最新快照，让 op 标签累积生效（5→6→7→8）
      // 若用户在执行期间删除了当前组，主动终止
      const fresh = getProjectSnapshot(projectId);
      const freshGroup = fresh?.groups?.find((g) => g.id === activeGroup.id);
      if (!freshGroup) {
        message.warning('请求组已被删除，执行终止');
        break;
      }
      const mainReqs = freshGroup.requests || [];
      const subReqsData = freshGroup.subGroup?.requests || [];

      const groupCtx = { vars: {}, responses: [], scripts, envs };
      
      if (!isSoloSub) {
        for (let i = 0; i < mainReqs.length; i++) {
          await checkPause(); 
          await processSingleEntry(mainReqs[i], groupCtx, 'main');
          await new Promise(r => setTimeout(r, 50));
        }
      }

        // 💡 [修复 #3] 每轮基于刚读的快照计算 subConfig，避免闭包旧值
  const freshSubConfig = freshGroup.subGroup || {
    zones: [], successKeyword: '"code":200', maxRetries: 3, judgeVar: 'level', proxy: '',
  };

  if (subReqsData.length > 0) {
    await checkPause();

    const judgeVarName = freshSubConfig.judgeVar || 'level';
    const judgeVal = isSoloSub ? 999999 : groupCtx.vars[judgeVarName];

    if (judgeVal !== undefined) {
      const currLevel = Number(judgeVal);
      setExecCurrentLevel(currLevel);

      const matchedZone = (freshSubConfig.zones || []).find(z => currLevel >= z.min && currLevel < z.max);

      if (isSoloSub || (matchedZone && matchedZone.status === 'none')) {
        let lastSubResponseText = '';
        let currentRetryCount = 1;

        if (pendingSubPayloadRef.current && pendingSubPayloadRef.current.zoneId === (isSoloSub ? 'solo' : matchedZone.id)) {
          currentRetryCount = pendingSubPayloadRef.current.retryCount;
          message.warning(`[副组] 原包重试中 (${currentRetryCount}/${freshSubConfig.maxRetries})...`);

          for (const p of pendingSubPayloadRef.current.payloads) {
            await checkPause();
            const res = await window.electronAPI.httpRequest(p);
            if (res && res.body) lastSubResponseText = res.body;
            setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: p.url, method: p.method, status: res.status, statusText: res.statusText, body: res.body || '', timeCost: res.time, source: 'sub-retry' }, ...prev].slice(0, 150));
            await new Promise(r => setTimeout(r, 100));
          }
        } else {
          message.info(`[副组] 正常执行中...`);
          const subCtx = { vars: groupCtx.vars, responses: [], scripts, envs };
          let cachedPayloads = [];

          for (let j = 0; j < subReqsData.length; j++) {
            await checkPause();
            const res = await processSingleEntry(subReqsData[j], subCtx, 'sub');
            if (res && res._payload) {
              cachedPayloads.push(res._payload);
              if (res.body) lastSubResponseText = res.body;
            }
            await new Promise(r => setTimeout(r, 100));
          }
          pendingSubPayloadRef.current = { zoneId: isSoloSub ? 'solo' : matchedZone.id, payloads: cachedPayloads, retryCount: 1 };
        }

        if (lastSubResponseText.includes(freshSubConfig.successKeyword)) {
          message.success(`[副组] 响应成功！`);
          if (!isSubMode && matchedZone) {
            // 💡 [修复 #3] 函数式 patch，基于 store 内最新 zones
            updateSubGroup(projectId, activeGroup.id, (prev) => ({
              zones: (prev.zones || []).map(z => (z.id === matchedZone.id ? { ...z, status: 'success' } : z)),
            }));
          }
          pendingSubPayloadRef.current = null;
        } else {
          if (currentRetryCount >= (freshSubConfig.maxRetries || 3)) {
            message.error(`[副组] 达到最大重试次数，标记为死局！`);
            if (!isSubMode && matchedZone) {
              updateSubGroup(projectId, activeGroup.id, (prev) => ({
                zones: (prev.zones || []).map(z => (z.id === matchedZone.id ? { ...z, status: 'failed' } : z)),
              }));
            }
            pendingSubPayloadRef.current = null;
          } else {
            message.warning(`[副组] 失败，等待主循环原包重试...`);
            pendingSubPayloadRef.current = { zoneId: isSoloSub ? 'solo' : matchedZone.id, payloads: pendingSubPayloadRef.current.payloads, retryCount: currentRetryCount + 1 };
          }
        }
      }
    }
  }

      if (stopAfterRoundRef.current) {
        message.success('当前组已完整执行完毕，任务平滑停止。');
        break;
      }

      if (isSoloSub || !intervalSec || intervalSec <= 0) break;
      
      let waitTime = intervalSec * 1000;
      while (waitTime > 0 && !stopAfterRoundRef.current) {
        await new Promise(r => setTimeout(r, 500));
        if (!pauseFlagRef.current) waitTime -= 500;
      }
    }
    
    setIsRunning(false);
    setIsStopping(false);
    setIsPaused(false);
  };

  const handlePause = () => { pauseFlagRef.current = true; setIsPaused(true); message.warning('已暂停执行'); };
  const handleResume = () => { pauseFlagRef.current = false; setIsPaused(false); message.success('已继续执行'); };
  const handleStop = () => { stopAfterRoundRef.current = true; setIsStopping(true); message.warning('已发出停止指令，正在等待当前组执行完毕...'); };

  const moreMenuItems = [
    { key: 'bind', label: `绑定/切换工作区 (${basePath ? '已绑定' : '未绑定'})`, icon: <FolderOutlined />, onClick: handleBindPath },
    { key: 'mkdir', label: '新建请求组文件夹', icon: <FolderOpenOutlined />, onClick: handleCreateFolder },
    { type: 'divider' },
    { key: 'userInfo', label: '导出 userInfo.json', icon: <SaveOutlined />, onClick: handleExportUserInfo },
    { key: 'runJs', label: '运行 run.js', icon: <PlayCircleOutlined />, onClick: () => setRunJsModalOpen(true) },
    { type: 'divider' },
    { key: 'proxy', label: `${isSubMode ? '副组' : '主组'}代理设置`, icon: <GlobalOutlined />, onClick: () => { setProxyValue(isSubMode ? subConfig.proxy : mainProxy); setProxyModalOpen(true); } },
    { key: 'export', label: '导出当前项目', icon: <DownloadOutlined />, onClick: handleExportProject },
    { type: 'divider' },
    { key: 'reset', label: '重置全组请求', icon: <ReloadOutlined />, danger: true, disabled: isRunning || isSubMode, onClick: () => { resetGroupRequests(projectId, activeGroup.id); message.success('主组已重置'); } },
  ];

  return (
    <Flex vertical style={{ height: '100%', background: '#fff' }}>
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '8px 16px', background: '#fff',
        borderBottom: '1px solid #e5e7eb', zIndex: 10
      }}>
        <Flex align="center" gap={12}>
          <Button size="small" shape="circle" icon={<ArrowLeftOutlined />} onClick={() => setActiveGroupId(null)} />
          
          <Breadcrumb style={{ margin: 0 }} items={[
            { title: <Text type="secondary" style={{ fontSize: 12 }}>{project.name}</Text> },
            { title: <Text strong style={{ fontSize: 12 }}>{activeGroup.name}</Text> }
          ]} />

          <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />
          
          <Segmented 
            size="small"
            options={[
              { label: `主组 (${activeGroup.requests.length})`, value: 'main' }, 
              { label: `副组 (${activeGroup.subGroup?.requests?.length || 0})`, value: 'sub' }
            ]} 
            value={activeLevel} 
            onChange={setActiveLevel} 
          />
        </Flex>

        <Space size={12}>
          <Tooltip title="配置当前组使用的算法密钥">
            <Button size="small" icon={<KeyOutlined />} onClick={() => setAlgoConfigDrawerOpen(true)}>
              密钥
            </Button>
          </Tooltip>

          <Button 
            size="small"
            icon={<SettingOutlined />} 
            onClick={() => setSubConfigDrawerOpen(true)}
            style={{ 
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)', 
              color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(118,75,162,0.3)' 
            }}
          >
            阶梯
          </Button>
          
          {isRunning ? (
            <Space>
              <Button size="small" icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />} onClick={isPaused ? handleResume : handlePause} disabled={isStopping}>
                {isPaused ? '继续' : '暂停'}
              </Button>
              <Button size="small" danger type="primary" icon={isStopping ? <LoadingOutlined /> : <StopOutlined />} onClick={handleStop} disabled={isStopping}>
                {isStopping ? '等待结束...' : '停止'}
              </Button>
            </Space>
          ) : (
            <Button 
              size="small"
              type="primary" 
              icon={<PlayCircleOutlined />} 
              onClick={() => { 
                setMonitorModalOpen(true); 
                if (isSubMode) executeGroup(true); 
                else setRunModalOpen(true); 
              }}
              style={{ 
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', 
                color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' 
              }}
            >
              {isSubMode ? '单测副组' : '启动主组'}
            </Button>
          )}
          
          <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
            <Button type="text" size="small" shape="circle" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <RequestWorkbench
          entries={currentReqs} setEntries={setEntries} projectId={projectId}
          showSelection={false} showAddToProject={false}
          onResetSelected={(uids) => {
            resetSelectedRequests(projectId, activeGroup.id, uids, activeLevel);
            message.success(`已精准重置选中的 ${uids.length} 条请求`);
          }}
          groupConfigs={currentConfigs}
          onSaveGroupConfig={(algoKey, config) => updateGroupConfig(projectId, activeGroup.id, activeLevel, algoKey, config)}
          headerTopExtra={null}
          enableDrag={!isSubMode}
          onReorder={(from, to) => reorderGroupRequests(projectId, activeGroup.id, from, to)}
          onUpdateRequest={(uid, updates) => updateRequestFields(projectId, activeGroup.id, uid, updates, activeLevel)}
          onUpdateResponse={(uid, response) => applyResponse(projectId, activeGroup.id, uid, response, activeLevel)}
        />
      </div>

      <Modal
        title="请求组执行监控"
        open={monitorModalOpen}
        onCancel={() => setMonitorModalOpen(false)}
        width="85vw"
        style={{ top: 20 }}
        mask={{ closable: false }}
        footer={[
          <Button key="pause" icon={isPaused ? <CaretRightOutlined /> : <PauseCircleOutlined />} onClick={isPaused ? handleResume : handlePause} disabled={!isRunning || isStopping}>
            {isPaused ? '继续执行' : '暂停执行'}
          </Button>,
          <Button key="stop" danger onClick={handleStop} disabled={!isRunning || isStopping}>
            {isStopping ? '正在等待当前组结束...' : '平滑停止'}
          </Button>,
          <Button key="close" type="primary" onClick={() => setMonitorModalOpen(false)}>
            {isRunning ? '后台运行' : '关闭'}
          </Button>
        ]}
      >
        <Splitter style={{ height: '65vh', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <Splitter.Panel defaultSize="30%" min="20%">
            <Flex vertical style={{ height: '100%', background: '#fafafa' }}>
              <div style={{ padding: '12px 16px', background: '#f0f2f5', borderBottom: '1px solid #e5e7eb' }}>
                <Text strong>阶梯区间状态</Text>
                <div style={{ marginTop: 8 }}>
                  当前等级/判定值：<Tag color="blue">{execCurrentLevel}</Tag>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                {subConfig.zones?.length > 0 ? (
                  <Flex vertical gap={12}>
                    {subConfig.zones.map(z => (
                      <Card key={z.id} size="small" styles={{ body: { padding: 12 } }}>
                        <Flex justify="space-between" align="center">
                          <Text strong>{z.min} ~ {z.max}</Text>
                          {z.status === 'success' && <Tag color="success">已成功</Tag>}
                          {z.status === 'failed' && <Tag color="error">死局</Tag>}
                          {z.status === 'none' && <Tag color="default">未触发</Tag>}
                        </Flex>
                      </Card>
                    ))}
                  </Flex>
                ) : (
                  <Empty description="未配置阶梯区间" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </Flex>
          </Splitter.Panel>

          <Splitter.Panel>
            <Flex vertical style={{ height: '100%', background: '#1e1e1e' }}>
              <div style={{ padding: '8px 12px', background: '#2d2d2d', borderBottom: '1px solid #3e3e3e', color: '#ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#ccc' }}>实时响应输出</Text>
                <Badge count={execLogs.length} size="small" />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'Consolas, monospace', fontSize: 13 }}>
                {execLogs.length === 0 ? (
                  <Text style={{ color: '#666' }}>等待响应...</Text>
                ) : (
                  <List 
                    split={false}
                    dataSource={execLogs}
                    renderItem={(item) => (
                      <div style={{ marginBottom: 12, borderBottom: '1px solid #333', paddingBottom: 12 }}>
                        <Flex gap={12} align="center" style={{ marginBottom: 4 }}>
                          <Text style={{ color: '#888' }}>[{item.time}]</Text>
                          {item.source === 'main' && <Tag color="blue" style={{ margin: 0 }}>主组</Tag>}
                          {item.source === 'sub' && <Tag color="purple" style={{ margin: 0 }}>副组</Tag>}
                          {item.source === 'sub-retry' && <Tag color="orange" style={{ margin: 0 }}>重试</Tag>}
                          <Text style={{ color: item.status >= 400 || item.status === 'ERR' ? '#f48771' : '#89d185', fontWeight: 'bold' }}>
                            {item.status}
                          </Text>
                          <Text style={{ color: '#569cd6' }}>{item.method}</Text>
                          <Text style={{ color: '#d4d4d4', flex: 1 }} ellipsis>{item.url}</Text>
                          <Text style={{ color: '#888' }}>{item.timeCost}ms</Text>
                        </Flex>
                        {item.body && (
                          <pre style={{ margin: 0, padding: 8, background: '#252526', borderRadius: 4, color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                            {item.body}
                          </pre>
                        )}
                      </div>
                    )}
                  />
                )}
              </div>
            </Flex>
          </Splitter.Panel>
        </Splitter>
      </Modal>

      <Drawer 
        title={<Space><KeyOutlined /> {isSubMode ? '副组' : '主组'} 算法密钥配置</Space>} 
        placement="right" width={450} 
        onClose={() => setAlgoConfigDrawerOpen(false)} 
        open={algoConfigDrawerOpen}
      >
        {Object.keys(currentConfigs).length === 0 ? (
          <Empty description="当前组尚未记忆任何密钥" />
        ) : (
          <Flex vertical gap={16}>
            {Object.entries(currentConfigs).map(([algoKey, cfg]) => {
              const tpl = TRANSFORMS[algoKey];
              if (!tpl) return null;
              return (
                <Card 
                  key={algoKey} 
                  size="small" 
                  title={<Text strong>{tpl.label}</Text>} 
                  extra={
                    <Popconfirm title="删除此密钥配置？" onConfirm={() => removeGroupConfig(projectId, activeGroup.id, activeLevel, algoKey)}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />}>清除</Button>
                    </Popconfirm>
                  }
                >
                  <Form layout="vertical" size="small">
                    {tpl.configFields?.map(f => (
                      <Form.Item key={f.name} label={f.label} style={{ marginBottom: 8 }}>
                        <Input 
                          value={cfg[f.name]} 
                          onChange={e => updateGroupConfig(projectId, activeGroup.id, activeLevel, algoKey, { ...cfg, [f.name]: e.target.value })} 
                          placeholder={f.defaultValue || ''}
                        />
                      </Form.Item>
                    ))}
                  </Form>
                </Card>
              );
            })}
          </Flex>
        )}
      </Drawer>

      <Drawer title={<Space><SettingOutlined /> 副组阶梯配置</Space>} placement="right" width={550} onClose={() => setSubConfigDrawerOpen(false)} open={subConfigDrawerOpen}>
        <Flex vertical gap={16}>
          <Card size="small" title="基础设置" variant="borderless" style={{ background: '#fafafa' }}>
            <Flex vertical gap={12}>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>副组专属网络代理（留空则继承主组代理）:</div>
                <Input value={subConfig.proxy || ''} onChange={e => saveSubConfig({ proxy: e.target.value })} placeholder="如 http://1.2.3.4:8080" />
              </div>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>判定变量名（自动从主组 vars 中读取）:</div>
                <Space.Compact style={{ width: '100%' }}>
                  <Input style={{ width: '60px', textAlign: 'center', background: '#f5f5f5', color: '#888', pointerEvents: 'none' }} value="vars." disabled />
                  <Input value={subConfig.judgeVar || 'level'} onChange={e => saveSubConfig({ judgeVar: e.target.value })} />
                </Space.Compact>
              </div>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>成功关键字（响应包含此词即视为成功）:</div>
                <Input value={subConfig.successKeyword} onChange={e => saveSubConfig({ successKeyword: e.target.value })} placeholder='"code":200' />
              </div>
              <div>
                <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>最大重试次数（失败X次标记死局）:</div>
                <InputNumber value={subConfig.maxRetries} onChange={v => saveSubConfig({ maxRetries: v })} min={1} style={{ width: '100%' }} />
              </div>
            </Flex>
          </Card>

          <Card size="small" variant="borderless" title="阶梯区间管理" extra={<Button size="small" icon={<PlusOutlined />} onClick={handleAddZone}>添加区间</Button>}>
            <Table 
              size="small" 
              pagination={false} 
              dataSource={subConfig.zones || []} 
              rowKey="id"
              scroll={{ y: 300 }}
              columns={[
                { title: '最小值 (含)', dataIndex: 'min', width: 100, render: (t, r) => <InputNumber size="small" value={t} onChange={v => handleUpdateZone(r.id, 'min', v)} style={{ width: '100%' }} /> },
                { title: '最大值 (不含)', dataIndex: 'max', width: 100, render: (t, r) => <InputNumber size="small" value={t} onChange={v => handleUpdateZone(r.id, 'max', v)} style={{ width: '100%' }} /> },
                { title: '状态', dataIndex: 'status', width: 80, render: (s) => {
                  if (s === 'success') return <Tag color="success">已成功</Tag>;
                  if (s === 'failed') return <Tag color="error">死局</Tag>;
                  return <Tag color="default">未触发</Tag>;
                }},
                { title: '操作', render: (_, r) => (
                  <Space size={0}>
                    <Button size="small" type="link" onClick={() => handleResetZoneStatus(r.id)}>重置</Button>
                    <Button size="small" type="link" danger onClick={() => handleDeleteZone(r.id)}>删除</Button>
                  </Space>
                )}
              ]}
            />
          </Card>
        </Flex>
      </Drawer>

      <Modal title={`设置 ${isSubMode ? '副组' : '主组'} 网络代理`} open={proxyModalOpen} onOk={() => { if (isSubMode) saveSubConfig({ proxy: proxyValue }); else updateGroupProxy(projectId, activeGroup.id, proxyValue); setProxyModalOpen(false); }} onCancel={() => setProxyModalOpen(false)} okText="保存">
        <Input placeholder="如 http://127.0.0.1:7890 (留空即不使用)" value={proxyValue} onChange={(e) => setProxyValue(e.target.value)} />
      </Modal>

      <Modal title="执行主组与副组" open={runModalOpen} onOk={() => { setRunModalOpen(false); executeGroup(false); }} onCancel={() => setRunModalOpen(false)} okText="开始执行" width={500}>
        <Space orientation="vertical" style={{ marginTop: 12, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>定时循环（秒，0 仅一次）：</span>
            <InputNumber min={0} value={intervalSec} onChange={setIntervalSec} />
          </div>
        </Space>
      </Modal>

      <Modal title="运行 run.js" open={runJsModalOpen} onOk={handleRunJs} onCancel={() => setRunJsModalOpen(false)} okText="立即运行">
        <div>将执行当前绑定工作区请求组文件夹下的 <code>run.js</code>。确保该文件存在且配置正确。</div>
      </Modal>

      <Modal title="导出 userInfo.json" open={exportModalOpen} onOk={handleSaveUserInfo} onCancel={() => setExportModalOpen(false)} okText="确认导出">
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