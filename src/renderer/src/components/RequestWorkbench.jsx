// src/renderer/src/components/RequestWorkbench.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Splitter, Flex, Input, Select, Segmented, Typography, Tag,
  Button, Empty, App, Checkbox, Popconfirm, Space, Tooltip
} from 'antd';
import { SearchOutlined, DeleteOutlined, FilterOutlined } from '@ant-design/icons';
import RequestDetail from './RequestDetail';
import { formatTime, statusColor, parseUrlParts, genUid } from '../utils/har';

const { Text } = Typography;

const METHOD_COLOR = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple', HEAD: 'default', OPTIONS: 'default' };
const STATUS_RANGE = { ALL: () => true, '2xx': (s) => s >= 200 && s < 300, '3xx': (s) => s >= 300 && s < 400, '4xx': (s) => s >= 400 && s < 500, '5xx': (s) => s >= 500 };

export default function RequestWorkbench({
  entries, setEntries, projectId,
  showSelection = false, showAddToProject = false, onAddToProject,
  headerExtra = null, headerTopExtra = null, emptyNode = null,
  enableDrag = false, onReorder,
  onUpdateRequest, onUpdateResponse, onSendRequest,
  groupConfigs = {}, onSaveGroupConfig,
}) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('ALL');
  const [statusRange, setStatusRange] = useState('ALL');
  
  // 多维筛选状态
  const [filterHost, setFilterHost] = useState('ALL');
  const [filterMime, setFilterMime] = useState('ALL');
  const [excludeKeyword, setExcludeKeyword] = useState('');

  const [currentUid, setCurrentUid] = useState(null);
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [activeTabKey, setActiveTabKey] = useState('request');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  useEffect(() => {
    if (!entries.some((e) => !e._uid)) return;
    setEntries(entries.map((e) => (e._uid ? e : { ...e, _uid: genUid() })));
  }, [entries, setEntries]);

  const current = useMemo(() => entries.find((e) => e._uid === currentUid) || null, [entries, currentUid]);
  const chainContext = useMemo(() => {
    const responses = entries.map((e, i) => ({ index: i, response: e.response || { status: 0, statusText: '', headers: [], body: '' }, entry: e }));
    const currentStep = currentUid ? entries.findIndex((e) => e._uid === currentUid) : -1;
    return { responses, currentStep };
  }, [entries, currentUid]);

  // 提取所有域名和 Mime 用于筛选
  const hosts = useMemo(() => {
    const set = new Set();
    entries.forEach(e => {
      const parts = parseUrlParts(e.request?.url);
      if (parts.host) set.add(parts.host);
    });
    return [{ value: 'ALL', label: '全部域名' }, ...Array.from(set).map(h => ({ value: h, label: h }))];
  }, [entries]);

  const mimes = useMemo(() => {
    const set = new Set();
    entries.forEach(e => {
      const mime = e.response?.content?.mimeType || 'unknown';
      if (mime) set.add(mime);
    });
    return [{ value: 'ALL', label: '全部类型' }, ...Array.from(set).map(m => ({ value: m, label: m }))];
  }, [entries]);

  const methods = useMemo(() => {
    const set = new Set(entries.map((e) => e.request?.method).filter(Boolean));
    return [{ value: 'ALL', label: '全部方法' }].concat([...set].map((m) => ({ value: m, label: m })));
  }, [entries]);

  // 核心过滤逻辑
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const exKw = excludeKeyword.trim().toLowerCase();
    const rangeFn = STATUS_RANGE[statusRange] || STATUS_RANGE.ALL;
    
    return entries.filter((e) => {
      const m = e.request?.method;
      const s = e.response?.status || 0;
      const parts = parseUrlParts(e.request?.url);
      const mime = e.response?.content?.mimeType || 'unknown';

      if (method !== 'ALL' && m !== method) return false;
      if (filterHost !== 'ALL' && parts.host !== filterHost) return false;
      if (filterMime !== 'ALL' && mime !== filterMime) return false;
      if (!rangeFn(s)) return false;
      
      // 包含关键字
      if (kw && !((e.request?.url || '').toLowerCase().includes(kw) || m?.toLowerCase().includes(kw))) return false;
      
      // 排除关键字 (URL或Body)
      if (exKw) {
        const bodyStr = (e.response?.content?.text || '').toLowerCase();
        if ((e.request?.url || '').toLowerCase().includes(exKw) || bodyStr.includes(exKw)) return false;
      }

      return true;
    });
  }, [entries, keyword, method, statusRange, filterHost, filterMime, excludeKeyword]);

  const allChecked = filtered.length > 0 && filtered.every((e) => selectedUids.has(e._uid));
  const someChecked = filtered.some((e) => selectedUids.has(e._uid));

  const toggleSelect = (entry) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(entry._uid)) next.delete(entry._uid); else next.add(entry._uid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const next = new Set(selectedUids);
    if (allChecked) filtered.forEach((e) => next.delete(e._uid)); else filtered.forEach((e) => next.add(e._uid));
    setSelectedUids(next);
  };

  const handleDeleteEntry = (entry) => {
    const idx = entries.findIndex((e) => e._uid === entry._uid);
    if (idx < 0) return;
    const next = entries.filter((e) => e._uid !== entry._uid);
    setEntries(next);
    if (currentUid === entry._uid) setCurrentUid(next[idx]?._uid || next[idx - 1]?._uid || null);
    setSelectedUids((prev) => { const n = new Set(prev); n.delete(entry._uid); return n; });
  };

  const handleAddClick = () => {
    const selected = entries.filter((e) => selectedUids.has(e._uid));
    onAddToProject?.(selected);
    setSelectedUids(new Set());
  };

  const handleDragStart = (e, idx) => { setDraggingIndex(idx); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dropIndex !== idx) setDropIndex(idx); };
  const handleDrop = (e, idx) => { e.preventDefault(); if (draggingIndex != null && draggingIndex !== idx && onReorder) onReorder(draggingIndex, idx); setDraggingIndex(null); setDropIndex(null); };

  const renderRow = (entry, idx) => {
    const req = entry.request || {};
    const res = entry.response || {};
    const parts = parseUrlParts(req.url);
    const isCurrent = currentUid === entry._uid;
    const isChecked = selectedUids.has(entry._uid);

    const rowContent = (
      <div onClick={() => setCurrentUid(entry._uid)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, background: isCurrent ? '#e6f4ff' : 'transparent', borderBottom: '1px solid #f0f0f0', opacity: draggingIndex === idx ? 0.4 : 1, outline: (dropIndex === idx && draggingIndex !== idx) ? '2px dashed #1677ff' : 'none' }}>
        <Flex align="center" gap={8}>
          {showSelection && <Checkbox checked={isChecked} onChange={() => toggleSelect(entry)} onClick={(e) => e.stopPropagation()} />}
          <Tag color={METHOD_COLOR[req.method] || 'default'} style={{ margin: 0, minWidth: 50, textAlign: 'center' }}>{req.method}</Tag>
          <Tag color={statusColor(res.status)} style={{ margin: 0, minWidth: 40, textAlign: 'center' }}>{res.status}</Tag>
          <Text ellipsis style={{ flex: 1, minWidth: 0 }} title={req.url}>{parts.host}{parts.path}</Text>
          <Text type="secondary" style={{ flexShrink: 0, width: 60, textAlign: 'right' }}>{formatTime(entry.time)}</Text>
          <Popconfirm title="删除这条请求？" onConfirm={(e) => { e?.stopPropagation?.(); handleDeleteEntry(entry); }}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Flex>
      </div>
    );

    return (
      <div key={entry._uid} draggable={enableDrag} onDragStart={(e) => handleDragStart(e, idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={(e) => handleDrop(e, idx)}>
        {rowContent}
      </div>
    );
  };

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="35%" min="20%" collapsible>
        <Flex vertical style={{ height: '100%', background: '#fff', borderRight: '1px solid #f0f0f0' }}>
          <Flex vertical gap={8} style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
            {headerTopExtra}
            {headerExtra}
            {entries.length > 0 && (
              <>
                <Flex gap={8}>
                  <Input allowClear size="small" prefix={<SearchOutlined />} placeholder="搜索 URL..." value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ flex: 1 }} />
                  <Input allowClear size="small" placeholder="排除关键字" value={excludeKeyword} onChange={(e) => setExcludeKeyword(e.target.value)} style={{ width: 120, borderColor: excludeKeyword ? '#ff4d4f' : '' }} />
                </Flex>
                <Flex gap={8}>
                  <Select size="small" value={filterHost} onChange={setFilterHost} options={hosts} style={{ flex: 1 }} />
                  <Select size="small" value={filterMime} onChange={setFilterMime} options={mimes} style={{ flex: 1 }} />
                </Flex>
                <Flex gap={8}>
                  <Select size="small" value={method} onChange={setMethod} options={methods} style={{ width: 100 }} />
                  <Segmented size="small" value={statusRange} onChange={setStatusRange} options={[{ value: 'ALL', label: '全部' }, { value: '2xx', label: '2xx' }, { value: '3xx', label: '3xx' }, { value: '4xx', label: '4xx' }, { value: '5xx', label: '5xx' }]} />
                </Flex>
                <Flex justify="space-between" align="center">
                  <Text type="secondary" style={{ fontSize: 12 }}>共 {filtered.length} 条</Text>
                  {showSelection && (
                    <Flex gap={8} align="center">
                      <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleSelectAll}>
                        <Text style={{ fontSize: 12 }}>已选 {selectedUids.size}</Text>
                      </Checkbox>
                      {showAddToProject && (
                        <Button size="small" type="primary" disabled={selectedUids.size === 0} onClick={handleAddClick}>添加到项目</Button>
                      )}
                    </Flex>
                  )}
                </Flex>
              </>
            )}
          </Flex>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {entries.length === 0 ? (emptyNode || <Empty style={{ marginTop: 50 }} description="暂无请求" />) : filtered.map((e) => renderRow(e, entries.indexOf(e)))}
          </div>
        </Flex>
      </Splitter.Panel>
      <Splitter.Panel>
        {current ? (
          <RequestDetail
            entry={current}
            activeKey={activeTabKey}
            onTabChange={setActiveTabKey}
            chainContext={chainContext}
            onUpdateRequest={onUpdateRequest}
            onUpdateResponse={onUpdateResponse}
            onSendRequest={onSendRequest}
            groupConfigs={groupConfigs}
            onSaveGroupConfig={onSaveGroupConfig}
          />
        ) : (
          <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="从左侧选择一条请求" /></Flex>
        )}
      </Splitter.Panel>
    </Splitter>
  );
}