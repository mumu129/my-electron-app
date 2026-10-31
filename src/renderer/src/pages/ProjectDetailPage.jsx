// src/renderer/src/pages/ProjectDetailPage.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Button, Card, Col, Row, Flex, Tag, Typography, Empty, Popconfirm,
  App as AntApp, Modal, Input, Tooltip, List, Checkbox, InputNumber, Space, Drawer, Badge,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FolderOpenOutlined,
  EditOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ReloadOutlined, HolderOutlined, PlayCircleOutlined, StopOutlined, FileTextOutlined,
  DownloadOutlined, GlobalOutlined, DiffOutlined
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useScripts } from '../store/scriptStore';
import { useEnvs } from '../store/envStore';
import RequestWorkbench from '../components/RequestWorkbench';
import WorkareaToolbar from '../components/WorkareaToolbar';
import usePersistentState from '../hooks/usePersistentState';
import { processTags, updateDecTags, extractVarsOnly } from '../utils/hackTags';

const { Text } = Typography;

export default function ProjectDetailPage({ projectId, onBack }) {
  const {
    projects, deleteProject, updateGroupRequests,
    renameGroup, moveGroup, deleteGroup, reorderGroups,
    updateRequestFields, applyResponse, resetGroupRequests,
    reorderGroupRequests, updateGroupConfig, updateGroupProxy,
  } = useProjects();
  const { scripts } = useScripts();
  const { envs } = useEnvs();
  const { message } = AntApp.useApp();

  const [activeGroupId, setActiveGroupId] = usePersistentState(`ui-proj-${projectId}-group`, null);
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedExportReqs, setSelectedExportReqs] = useState([]);
  
  // 执行配置
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [intervalSec, setIntervalSec] = useState(0);
  const [concurrency, setConcurrency] = useState(1);
  const [stopOnError, setStopOnError] = useState(false);
  const [assertString, setAssertString] = useState('');
  
  // 执行状态
  const [isRunning, setIsRunning] = useState(false);
  const stopFlagRef = useRef(false);
  const [execLogs, setExecLogs] = useState([]);
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [diffView, setDiffView] = useState(null);

  // 代理配置
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyValue, setProxyValue] = useState('');

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  useEffect(() => {
    if (!project) return;
    if (activeGroupId && !project.groups.find((g) => g.id === activeGroupId)) setActiveGroupId(null);
  }, [activeGroupId, project, setActiveGroupId]);

  if (!project) return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="项目不存在" /></Flex>;

  const activeGroup = project.groups.find((g) => g.id === activeGroupId);
  const groupProxy = activeGroup?.proxy || '';

  const handleDeleteProject = () => { deleteProject(projectId); message.success(`已删除`); onBack?.(); };
  const handleDeleteGroup = (g) => { deleteGroup(projectId, g.id); if (activeGroupId === g.id) setActiveGroupId(null); };
  const openRename = (g) => { setRenamingGroup(g); setRenameValue(g.name); };
  const confirmRename = () => { if (renamingGroup && renameValue.trim()) { renameGroup(projectId, renamingGroup.id, renameValue.trim()); setRenamingGroup(null); } };
  
  const handleDragStart = (e, idx) => { setDraggingIndex(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); };
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dropIndex !== idx) setDropIndex(idx); };
  const handleDrop = (e, idx) => { e.preventDefault(); if (draggingIndex != null && draggingIndex !== idx) reorderGroups(projectId, draggingIndex, idx); setDraggingIndex(null); setDropIndex(null); };

  const handleExportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name}_export.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

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
      
      const isStress = concurrency > 1;
      let totalSent = 0;
      let totalSuccess = 0;
      let totalFailed = 0;

      let currentReqs = JSON.parse(JSON.stringify(activeGroup.requests));
      
      const processRequest = async (entry, ctx) => {
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
            if (rawHeaders[hidx].value) {
              rawHeaders[hidx].value = await extractVarsOnly(rawHeaders[hidx].value, ctx);
            }
          }

          let finalUrl = await processTags(rawUrl, ctx);
          let finalBody = rawBody ? await processTags(rawBody, ctx) : undefined;
          
          let finalHeaders = {};
          for (const h of rawHeaders) {
            if (h.name && !['host', 'content-length', 'connection'].includes(h.name.toLowerCase())) {
              finalHeaders[h.name] = await processTags(h.value || '', ctx);
            }
          }

          const hasCookieHeader = Object.keys(finalHeaders).some(k => k.toLowerCase() === 'cookie');
          if (!hasCookieHeader && Array.isArray(req.cookies) && req.cookies.length > 0) {
            finalHeaders['Cookie'] = req.cookies.map(c => `${c.name}=${c.value}`).join('; ');
          }

          if (updates.length > 0 && !isStress) {
            updateRequestFields(projectId, activeGroup.id, uid, updates);
          }

          const res = await window.electronAPI.httpRequest({
            url: finalUrl, method, headers: finalHeaders, body: finalBody, proxy: groupProxy || undefined
          });

          totalSent++;
          const isSuccess = res.status >= 200 && res.status < 400;
          if (isSuccess) totalSuccess++; else totalFailed++;

          if (stopOnError) {
            if (res.status >= 400 || (assertString && !res.body.includes(assertString))) {
              stopFlagRef.current = true;
              message.error(`执行中断：断言失败 (状态码 ${res.status})`);
            }
          }

          ctx.responses.push({ status: res.status, headers: res.headers, body: res.body });

          if (!isStress) {
            setExecLogs(prev => [{ 
              id: Date.now() + Math.random(), 
              time: new Date().toLocaleTimeString(), 
              url: finalUrl, 
              method, 
              status: res.status, 
              statusText: res.statusText, 
              body: res.body || '', 
              timeCost: res.time 
            }, ...prev]);

            applyResponse(projectId, activeGroup.id, uid, { status: res.status, statusText: res.statusText, headers: res.headers || [], content: { text: res.body, size: res.body?.length || 0, mimeType: 'application/json' }, time: res.time });
          }
          
        } catch (e) {
          totalSent++;
          totalFailed++;
          ctx.responses.push({ status: 0, headers: [], body: `[ERROR] ${e.message}` });
          if (!isStress) {
            setExecLogs(prev => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), url: req.url, method, status: 'ERR', statusText: e.message, body: '', timeCost: 0 }, ...prev]);
          }
        }
      };

      while (!stopFlagRef.current) {
        if (isStress) {
          const tasks = [];
          for (let c = 0; c < concurrency; c++) {
            for (let i = 0; i < currentReqs.length; i++) {
              if (stopFlagRef.current) break;
              const ctxClone = { vars: {}, responses: [], scripts, envs };
              tasks.push(processRequest(currentReqs[i], ctxClone));
            }
          }
          await Promise.all(tasks);
        } else {
          const groupCtx = { vars: {}, responses: [], scripts, envs };
          for (let i = 0; i < currentReqs.length; i++) {
            if (stopFlagRef.current) break;
            await processRequest(currentReqs[i], groupCtx);
            await new Promise(r => setTimeout(r, 50));
          }
        }
        
        if (stopFlagRef.current || !intervalSec || intervalSec <= 0) break;
        await new Promise(r => setTimeout(r, intervalSec * 1000));
      }
      
      setIsRunning(false);
      if (isStress) {
        message.info(`压测结束：共发送 ${totalSent} 个请求，成功 ${totalSuccess} 个，失败 ${totalFailed} 个`);
      }
    };

    const handleShowDiff = (currentIdx) => {
      const current = execLogs[currentIdx];
      const prev = execLogs[currentIdx + 1];
      if (!prev) return message.warning('没有上一条日志可供对比');
      
      try {
        const cObj = JSON.parse(current.body);
        const pObj = JSON.parse(prev.body);
        const diff = [];
        for (let k in cObj) {
          if (JSON.stringify(pObj[k]) !== JSON.stringify(cObj[k])) {
            diff.push({ field: k, oldVal: pObj[k], newVal: cObj[k] });
          }
        }
        if (diff.length === 0) return message.info('两次响应完全相同');
        setDiffView(diff);
      } catch {
        message.warning('响应不是标准 JSON，无法对比');
      }
    };

    return (
      <Flex vertical style={{ height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RequestWorkbench
            entries={activeGroup.requests} setEntries={setGroupEntries} projectId={projectId}
            showSelection={false} showAddToProject={false}
            groupConfigs={activeGroup.configs || {}}
            onSaveGroupConfig={(algoKey, config) => updateGroupConfig(projectId, activeGroup.id, algoKey, config)}
            headerTopExtra={
              <Flex align="center" gap={8} wrap>
                <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setActiveGroupId(null)}>返回</Button>
                <Text strong>{project.name} / {activeGroup.name}</Text>
                <Tag>{activeGroup.requests.length} 条</Tag>
                <Button size="small" icon={<GlobalOutlined />} onClick={() => { setProxyValue(activeGroup.proxy || ''); setProxyModalOpen(true); }}>
                  {activeGroup.proxy ? '已设代理' : '代理'}
                </Button>
                <WorkareaToolbar projectName={project.name} groupName={activeGroup.name} groupRequests={activeGroup.requests} onFieldSelectForExport={() => { setSelectedExportReqs([]); setExportModalOpen(true); }} />
                <div style={{ flex: 1 }} />
                <Badge count={execLogs.length} size="small"><Button size="small" icon={<FileTextOutlined />} onClick={() => setLogDrawerOpen(true)}>执行日志</Button></Badge>
                {isRunning ? <Button size="small" danger type="primary" icon={<StopOutlined />} onClick={() => { stopFlagRef.current = true; setIsRunning(false); }}>停止</Button> : <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => setRunModalOpen(true)}>执行 / 压测</Button>}
                <Button size="small" icon={<ReloadOutlined />} disabled={isRunning} onClick={() => resetGroupRequests(projectId, activeGroup.id)}>重置</Button>
              </Flex>
            }
            enableDrag={true}
            onReorder={(from, to) => reorderGroupRequests(projectId, activeGroup.id, from, to)}
            onUpdateRequest={(uid, updates) => updateRequestFields(projectId, activeGroup.id, uid, updates)}
            onUpdateResponse={(uid, response) => applyResponse(projectId, activeGroup.id, uid, response)}
          />
        </div>
        
        <Modal title="请求组网络代理" open={proxyModalOpen} onOk={() => { updateGroupProxy(projectId, activeGroup.id, proxyValue); setProxyModalOpen(false); }} onCancel={() => setProxyModalOpen(false)} okText="保存">
          <Input placeholder="如 http://127.0.0.1:7890 (留空则不使用)" value={proxyValue} onChange={(e) => setProxyValue(e.target.value)} />
        </Modal>

        <Modal title="执行请求组" open={runModalOpen} onOk={() => { setRunModalOpen(false); executeGroup(); }} onCancel={() => setRunModalOpen(false)} okText="开始执行">
          <Space direction="vertical" style={{ marginTop: 12, width: '100%' }}>
            <div>发送前自动处理标签，变量和请求响应会跨请求联动。</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span>定时循环（秒，0 仅一次）：</span>
              <InputNumber min={0} value={intervalSec} onChange={setIntervalSec} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>并发数量（大于1开启压测）：</span>
              <InputNumber min={1} max={50} value={concurrency} onChange={setConcurrency} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 修复了 >= 引起的 JSX 语法报错 */}
              <span>失败自动停止（状态码 &gt;= 400）：</span>
              <Checkbox checked={stopOnError} onChange={e => setStopOnError(e.target.checked)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>断言包含字符串（不包含则停止）：</span>
              <Input placeholder="例如: success" value={assertString} onChange={e => setAssertString(e.target.value)} />
            </div>
          </Space>
        </Modal>

        <Drawer title="执行结果日志" placement="right" width={600} onClose={() => setLogDrawerOpen(false)} open={logDrawerOpen}>
          <List dataSource={execLogs} renderItem={(item, idx) => (
            <List.Item>
              <Flex vertical style={{ width: '100%', background: '#fafafa', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <Flex justify="space-between" align="center">
                  <Space><Tag color={item.status >= 400 || item.status === 'ERR' ? 'error' : 'success'}>{item.status}</Tag><Text strong>{item.method}</Text><Text type="secondary">{item.time}</Text></Space>
                  <Button size="small" type="text" icon={<DiffOutlined />} onClick={() => handleShowDiff(idx)}>对比上一条</Button>
                </Flex>
                <pre style={{ margin: '8px 0 0', padding: 8, background: '#fff', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{item.body || '（空）'}</pre>
              </Flex>
            </List.Item>
          )} />
        </Drawer>

        <Modal title="JSON 差异对比 (Diff)" open={!!diffView} onCancel={() => setDiffView(null)} footer={null} width={600}>
          <List
            dataSource={diffView || []}
            renderItem={d => (
              <List.Item>
                <Flex vertical style={{ width: '100%' }}>
                  <Text strong style={{ color: '#722ed1', marginBottom: 4 }}>字段: {d.field}</Text>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    <div style={{ color: '#cf1322', background: '#fff1f0', padding: '4px 8px', borderRadius: 4 }}>- 旧: {JSON.stringify(d.oldVal)}</div>
                    <div style={{ color: '#389e0d', background: '#f6ffed', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>+ 新: {JSON.stringify(d.newVal)}</div>
                  </div>
                </Flex>
              </List.Item>
            )}
          />
        </Modal>

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
        <Button icon={<DownloadOutlined />} onClick={handleExportProject}>导出项目</Button>
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