// src/renderer/src/pages/ProjectDetailPage.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Modal, Input, Tooltip, List, Checkbox, InputNumber, Space, Drawer, Badge, Segmented, Table, Dropdown, Divider, Breadcrumb
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ReloadOutlined, HolderOutlined, PlayCircleOutlined, StopOutlined, FileTextOutlined,
  DownloadOutlined, GlobalOutlined, PlusOutlined, SettingOutlined,
  MoreOutlined, FolderOutlined, SaveOutlined
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useScripts } from '../store/scriptStore';
import { useEnvs } from '../store/envStore';
import RequestWorkbench from '../components/RequestWorkbench';
import usePersistentState from '../hooks/usePersistentState';
import { processTags, updateDecTags, extractVarsOnly } from '../utils/hackTags';

const { Text, Title } = Typography;

const uid = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests, updateSubGroupRequests,
    renameGroup, deleteGroup, reorderGroups, reorderGroupRequests,
    updateRequestFields, applyResponse, resetGroupRequests, resetSelectedRequests,
    updateGroupConfig, updateGroupProxy, updateSubGroup, createGroup
  } = useProjects();
  const { scripts } = useScripts();
  const { envs } = useEnvs();
  const { message } = AntApp.useApp();

  const [activeGroupId, setActiveGroupId] = usePersistentState(`ui-proj-${projectId}-group`, null);
  const [activeLevel, setActiveLevel] = useState('main');
  
  // 执行配置
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [intervalSec, setIntervalSec] = useState(0);
  
  // 执行状态
  const [isRunning, setIsRunning] = useState(false);
  const stopFlagRef = useRef(false);
  const [execLogs, setExecLogs] = useState([]);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);

  // 配置抽屉
  const [subConfigDrawerOpen, setSubConfigDrawerOpen] = useState(false);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyValue, setProxyValue] = useState('');

  // 项目总览页的状态
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  // 工作区路径及导出相关
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

  // ==========================================
  // 文件相关操作
  // ==========================================
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

  // ==========================================
  // 项目总览视图
  // ==========================================
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
        
        {/* 顶部标题区 */}
        <Flex align="center" gap={16} style={{ marginBottom: 32 }}>
          <Button shape="circle" icon={<ArrowLeftOutlined />} onClick={onBack} />
          <div>
            <Title level={3} style={{ margin: 0 }}>{project.name}</Title>
            <Text type="secondary">请求组管理 · 拖拽卡片可排序</Text>
          </div>
          <div style={{ flex: 1 }} />
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
              const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", `${project.name}_export.json`);
              document.body.appendChild(a); a.click(); a.remove();
            }}>导出项目</Button>
            <Popconfirm title="删除项目？" description="不可恢复" onConfirm={() => { deleteProject(projectId); onBack?.(); }}>
              <Button danger icon={<DeleteOutlined />}>删除项目</Button>
            </Popconfirm>
          </Space>
        </Flex>

        {/* 请求组卡片区 */}
        <Row gutter={[24, 24]}>
          {/* 新建请求组卡片 */}
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

          {/* 已有请求组 */}
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

  // ==========================================
  // 请求组详情视图（全屏贴边）
  // ==========================================
  const isSubMode = activeLevel === 'sub';
  const currentReqs = isSubMode ? (activeGroup.subGroup?.requests || []) : activeGroup.requests;
  const subConfig = activeGroup.subGroup || { zones: [], successKeyword: '"code":200', maxRetries: 3, judgeVar: 'level', proxy: '' };
  
  const mainProxy = activeGroup.proxy || '';
  const currentProxy = isSubMode && subConfig.proxy ? subConfig.proxy : mainProxy;

  const setEntries = (updater) => {
    const next = typeof updater === 'function' ? updater(currentReqs) : updater;
    if (!isSubMode) updateGroupRequests(projectId, activeGroup.id, next);
    else updateSubGroupRequests(projectId, activeGroup.id, next);
  };

  const saveSubConfig = (patch) => updateSubGroup(projectId, activeGroup.id, { ...subConfig, ...patch });
  const handleAddZone = () => saveSubConfig({ zones: [...(subConfig.zones || []), { id: uid(), min: 0, max: 0, status: 'none' }] });
  const handleUpdateZone = (id, field, val) => saveSubConfig({ zones: (subConfig.zones || []).map(z => z.id === id ? { ...z, [field]: val } : z) });
  const handleDeleteZone = (id) => saveSubConfig({ zones: (subConfig.zones || []).filter(z => z.id !== id) });
  const handleResetZoneStatus = (id) => saveSubConfig({ zones: (subConfig.zones || []).map(z => z.id === id ? { ...z, status: 'none' } : z) });

  const processSingleEntry = async (entry, ctx, source = 'main') => {
    const uid = entry._uid;
    const req = entry.request || {};
    const method = req.method || 'GET';
    const updates = [];

    try {
      let rawUrl = req.url || '';
      let rawBody = req.postData?.text;
      let rawHeaders = req.headers || [];

      if (rawBody) {
        const newBody = await updateDecTags(rawBody, ctx);
        if (newBody !== rawBody) { req.postData.text = newBody; rawBody = newBody; updates.push({ fieldPath: 'request.postData.text', value: newBody }); }
      }
      const newUrl = await updateDecTags(rawUrl, ctx);
      if (newUrl !== rawUrl) { req.url = newUrl; rawUrl = newUrl; updates.push({ fieldPath: 'request.url', value: newUrl }); }
      
      for (let hidx = 0; hidx < rawHeaders.length; hidx++) {
        const h = rawHeaders[hidx];
        if (h.value) {
          const newHVal = await updateDecTags(h.value, ctx);
          if (newHVal !== h.value) { h.value = newHVal; rawHeaders[hidx] = h; updates.push({ fieldPath: `request.headers.${hidx}.value`, value: newHVal }); }
        }
      }

      rawUrl = await extractVarsOnly(rawUrl, ctx);
      if (rawBody) rawBody = await extractVarsOnly(rawBody, ctx);
      for (let hidx = 0; hidx < rawHeaders.length; hidx++) {
        if (rawHeaders[hidx].value) rawHeaders[hidx].value = await extractVarsOnly(rawHeaders[hidx].value, ctx);
      }

      let finalUrl = await processTags(rawUrl, ctx);
      let finalBody = rawBody ? await processTags(rawBody, ctx) : undefined;
      
      let finalHeaders = {};
      for (const h of rawHeaders) {
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
      }, ...prev]);
      
      if (!isSubMode && source === 'main') {
        applyResponse(projectId, activeGroup.id, uid, { status: res.status, statusText: res.statusText, headers: res.headers || [], content: { text: res.body, size: res.body?.length || 0, mimeType: 'application/json' }, time: res.time });
      }
      return { ...res, _payload: payload };
    } catch (e) {
      ctx.responses.push({ status: 0, headers: [], body: `[ERROR] ${e.message}` });
      setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: req.url, method, status: 'ERR', statusText: e.message, body: '', timeCost: 0, source }, ...prev]);
      return null;
    }
  };

  const executeGroup = async (isSoloSub = false) => {
    stopFlagRef.current = false;
    setIsRunning(true);
    setExecLogs([]);
    pendingSubPayloadRef.current = null;
    message.success(isSoloSub ? `开始单独调试副组` : `开始执行主组流程`);

    const mainReqs = JSON.parse(JSON.stringify(activeGroup.requests));
    const subReqsData = JSON.parse(JSON.stringify(activeGroup.subGroup?.requests || []));

    while (!stopFlagRef.current) {
      const groupCtx = { vars: {}, responses: [], scripts, envs };
      
      if (!isSoloSub) {
        for (let i = 0; i < mainReqs.length; i++) {
          if (stopFlagRef.current) break;
          await processSingleEntry(mainReqs[i], groupCtx, 'main');
          await new Promise(r => setTimeout(r, 50));
        }
      }

      if (subReqsData.length > 0 && !stopFlagRef.current) {
        const judgeVarName = subConfig.judgeVar || 'level';
        const judgeVal = isSoloSub ? 999999 : groupCtx.vars[judgeVarName];
        
        if (judgeVal !== undefined) {
          const currLevel = Number(judgeVal);
          const matchedZone = (subConfig.zones || []).find(z => currLevel >= z.min && currLevel < z.max);
          
          if (isSoloSub || (matchedZone && matchedZone.status === 'none')) {
            let isUsingCache = false;
            let lastSubResponseText = '';
            let currentRetryCount = 1;

            if (pendingSubPayloadRef.current && pendingSubPayloadRef.current.zoneId === (isSoloSub ? 'solo' : matchedZone.id)) {
              isUsingCache = true;
              currentRetryCount = pendingSubPayloadRef.current.retryCount;
              message.warning(`[副组] 原包重试中 (${currentRetryCount}/${subConfig.maxRetries})...`);
              
              for (const p of pendingSubPayloadRef.current.payloads) {
                if (stopFlagRef.current) break;
                const res = await window.electronAPI.httpRequest(p);
                if (res && res.body) lastSubResponseText = res.body;
                setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: p.url, method: p.method, status: res.status, statusText: res.statusText, body: res.body || '', timeCost: res.time, source: 'sub-retry' }, ...prev]);
                await new Promise(r => setTimeout(r, 100));
              }
            } else {
              message.info(`[副组] 正常执行中...`);
              const subCtx = { vars: groupCtx.vars, responses: [], scripts, envs };
              let cachedPayloads = [];
              
              for (let j = 0; j < subReqsData.length; j++) {
                if (stopFlagRef.current) break;
                const res = await processSingleEntry(subReqsData[j], subCtx, 'sub');
                if (res && res._payload) {
                  cachedPayloads.push(res._payload);
                  if (res.body) lastSubResponseText = res.body;
                }
                await new Promise(r => setTimeout(r, 100));
              }
              pendingSubPayloadRef.current = { zoneId: isSoloSub ? 'solo' : matchedZone.id, payloads: cachedPayloads, retryCount: 1 };
            }

            if (lastSubResponseText.includes(subConfig.successKeyword)) {
              message.success(`[副组] 响应成功！`);
              if (!isSoloSub && matchedZone) {
                saveSubConfig({ zones: subConfig.zones.map(z => z.id === matchedZone.id ? { ...z, status: 'success' } : z) });
              }
              pendingSubPayloadRef.current = null;
              if (isSoloSub) break;
            } else {
              if (currentRetryCount >= (subConfig.maxRetries || 3)) {
                message.error(`[副组] 达到最大重试次数，标记为死局！`);
                if (!isSoloSub && matchedZone) {
                  saveSubConfig({ zones: subConfig.zones.map(z => z.id === matchedZone.id ? { ...z, status: 'failed' } : z) });
                }
                pendingSubPayloadRef.current = null;
                if (isSoloSub) break;
              } else {
                message.warning(`[副组] 失败，等待主循环原包重试...`);
                pendingSubPayloadRef.current = { zoneId: isSoloSub ? 'solo' : matchedZone.id, payloads: pendingSubPayloadRef.current.payloads, retryCount: currentRetryCount + 1 };
                if (isSoloSub) break;
              }
            }
          }
        }
      }

      if (stopFlagRef.current || isSoloSub || !intervalSec || intervalSec <= 0) break;
      await new Promise(r => setTimeout(r, intervalSec * 1000));
    }
    setIsRunning(false);
  };

  const moreMenuItems = [
    // 💡 新增：把路径绑定收进菜单
    { key: 'bind', label: `绑定/切换工作区 (${basePath ? '已绑定' : '未绑定'})`, icon: <FolderOutlined />, onClick: handleBindPath },
    { key: 'mkdir', label: '新建请求组文件夹', icon: <FolderOpenOutlined />, onClick: handleCreateFolder },
    { type: 'divider' },
    { key: 'userInfo', label: '导出 userInfo.json', icon: <SaveOutlined />, onClick: handleExportUserInfo },
    { key: 'runJs', label: '运行 run.js', icon: <PlayCircleOutlined />, onClick: () => setRunJsModalOpen(true) },
    { type: 'divider' },
    { key: 'proxy', label: `${isSubMode ? '副组' : '主组'}代理设置`, icon: <GlobalOutlined />, onClick: () => { setProxyValue(isSubMode ? subConfig.proxy : mainProxy); setProxyModalOpen(true); } },
    { key: 'export', label: '导出当前项目', icon: <DownloadOutlined />, onClick: () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
      const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", `${project.name}_export.json`);
      document.body.appendChild(a); a.click(); a.remove();
    }},
    { type: 'divider' },
    { key: 'reset', label: '重置全组请求', icon: <ReloadOutlined />, danger: true, disabled: isRunning || isSubMode, onClick: () => { resetGroupRequests(projectId, activeGroup.id); message.success('主组已重置'); } },
  ];

  return (
    <Flex vertical style={{ height: '100%', background: '#fff' }}>
      
      {/* 💡 顶部极简工具栏 */}
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
          {/* 移除了工作区路径显示 */}
          
          <Tooltip title="查看执行日志">
            <Badge count={execLogs.length} size="small" offset={[-4, 4]}>
              <Button type="text" size="small" shape="circle" icon={<FileTextOutlined />} onClick={() => setLogDrawerOpen(true)} />
            </Badge>
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
            配置
          </Button>
          
          {isRunning ? (
            <Button size="small" danger type="primary" icon={<StopOutlined />} onClick={() => { stopFlagRef.current = true; setIsRunning(false); }}>
              停止
            </Button>
          ) : (
            <Button 
              size="small"
              type="primary" 
              icon={<PlayCircleOutlined />} 
              onClick={() => { if (isSubMode) executeGroup(true); else setRunModalOpen(true); }}
              style={{ 
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', 
                color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' 
              }}
            >
              {isSubMode ? '单独调试' : '启动主组'}
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
            resetSelectedRequests(projectId, activeGroup.id, uids);
            message.success(`已精准重置选中的 ${uids.length} 条请求`);
          }}
          groupConfigs={activeGroup.configs || {}}
          onSaveGroupConfig={(algoKey, config) => updateGroupConfig(projectId, activeGroup.id, algoKey, config)}
          headerTopExtra={null}
          enableDrag={!isSubMode}
          onReorder={(from, to) => reorderGroupRequests(projectId, activeGroup.id, from, to)}
          onUpdateRequest={(uid, updates) => updateRequestFields(projectId, activeGroup.id, uid, updates)}
          onUpdateResponse={(uid, response) => applyResponse(projectId, activeGroup.id, uid, response)}
        />
      </div>

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
                <Input addonBefore="vars." value={subConfig.judgeVar || 'level'} onChange={e => saveSubConfig({ judgeVar: e.target.value })} />
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
        <Space direction="vertical" style={{ marginTop: 12, width: '100%' }}>
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

      <Drawer title="执行结果日志" placement="right" width={600} onClose={() => setLogDrawerOpen(false)} open={logDrawerOpen}>
        <List dataSource={execLogs} renderItem={(item) => (
          <List.Item>
            <Flex vertical style={{ width: '100%', background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}>
              <Flex justify="space-between" align="center">
                <Space>
                  {item.source === 'main' && <Tag color="blue">主组</Tag>}
                  {item.source === 'sub' && <Tag color="purple">副组首次</Tag>}
                  {item.source === 'sub-retry' && <Tag color="orange">副组重试</Tag>}
                  <Tag color={item.status >= 400 || item.status === 'ERR' ? 'error' : 'success'}>{item.status}</Tag>
                  <Text strong>{item.method}</Text>
                  <Text type="secondary">{item.time}</Text>
                </Space>
              </Flex>
              <pre style={{ margin: '8px 0 0', padding: 8, background: '#fff', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{item.body || '（空）'}</pre>
            </Flex>
          </List.Item>
        )} />
      </Drawer>
    </Flex>
  );
}