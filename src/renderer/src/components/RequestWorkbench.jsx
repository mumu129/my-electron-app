// src/renderer/src/components/RequestWorkbench.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Splitter, Flex, Input, Select, Segmented, Typography, Tag,
  Button, Empty, App, Checkbox, Popconfirm, Space, Tooltip
} from 'antd';
import { SearchOutlined, DeleteOutlined, FilterOutlined, RollbackOutlined } from '@ant-design/icons';
import RequestDetail from './RequestDetail';
import { formatTime, statusColor, parseUrlParts, genUid } from '../utils/har';

const { Text } = Typography;

const METHOD_COLOR = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple', HEAD: 'default', OPTIONS: 'default' };
const STATUS_RANGE = { ALL: () => true, '2xx': (s) => s >= 200 && s < 300, '3xx': (s) => s >= 300 && s < 400, '4xx': (s) => s >= 400 && s < 500, '5xx': (s) => s >= 500 };

// 💡 核心：通过注入 CSS 放大侧边栏收缩/拖拽按钮
const splitterStyles = `
  /* 加宽拖拽条的可点击区域 */
  .ant-splitter-bar-dragger {
    width: 14px !important;
  }
  /* 拖拽条内部的小竖线加粗 */
  .ant-splitter-bar-dragger::before {
    width: 4px !important;
    background-color: #d9d9d9 !important;
    border-radius: 4px !important;
    transition: all 0.2s;
  }
  /* 悬停时竖线变蓝 */
  .ant-splitter-bar-dragger:hover::before,
  .ant-splitter-bar-dragger:active::before {
    background-color: #1677ff !important;
  }
  /* 放大收缩箭头图标 */
  .ant-splitter-bar-collapse-bar {
    width: 20px !important;
    height: 48px !important;
    font-size: 14px !important;
    background: #fff !important;
    border: 1px solid #d9d9d9 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
    border-radius: 6px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: #595959 !important;
  }
  .ant-splitter-bar-collapse-bar:hover {
    color: #1677ff !important;
    border-color: #1677ff !important;
  }
`;

export default function RequestWorkbench({
  entries, setEntries, projectId,
  showSelection = false, showAddToProject = false, onAddToProject,
  onResetSelected,
  headerExtra = null, headerTopExtra = null, emptyNode = null,
  enableDrag = false, onReorder,
  onUpdateRequest, onUpdateResponse, onSendRequest,
  groupConfigs = {}, onSaveGroupConfig,
}) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('ALL');
  const [statusRange, setStatusRange] = useState('ALL');
  const [filterHost, setFilterHost] = useState('ALL');
  const [filterMime, setFilterMime] = useState('ALL');
  const [excludeKeyword, setExcludeKeyword] = useState('');

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [currentUid, setCurrentUid] = useState(null);
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [activeTabKey, setActiveTabKey] = useState('request');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  useEffect(() => {
  if (!entries.some((e) => !e._uid)) return;
  // 💡 [修复 #4] 函数式 updater，避免与 store 其它更新冲突
  setEntries((prev) => prev.map((e) => (e._uid ? e : { ...e, _uid: genUid() })));
}, [entries, setEntries]);

  const current = useMemo(() => entries.find((e) => e._uid === currentUid) || null, [entries, currentUid]);
  const chainContext = useMemo(() => {
    const responses = entries.map((e, i) => ({ index: i, response: e.response || { status: 0, statusText: '', headers: [], body: '' }, entry: e }));
    const currentStep = currentUid ? entries.findIndex((e) => e._uid === currentUid) : -1;
    return { responses, currentStep };
  }, [entries, currentUid]);

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
      
      if (kw && !((e.request?.url || '').toLowerCase().includes(kw) || m?.toLowerCase().includes(kw))) return false;
      
      if (exKw) {
        const bodyStr = (e.response?.content?.text || '').toLowerCase();
        if ((e.request?.url || '').toLowerCase().includes(exKw) || bodyStr.includes(exKw)) return false;
      }

      return true;
    });
  }, [entries, keyword, method, statusRange, filterHost, filterMime, excludeKeyword]);

  // 💡 [修复 #10] O(n) 建一次索引，避免每行都 entries.indexOf(e) 的 O(n²)
const entriesIndexMap = useMemo(() => {
  const m = new Map();
  entries.forEach((e, i) => m.set(e._uid, i));
  return m;
}, [entries]);

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
  // 💡 [修复 #4] 函数式删除，基于 store 内最新列表
  const idx = entries.findIndex((e) => e._uid === entry._uid);
  if (idx < 0) return;
  setEntries((prev) => prev.filter((e) => e._uid !== entry._uid));
  if (currentUid === entry._uid) {
    const next = entries.filter((e) => e._uid !== entry._uid);
    setCurrentUid(next[idx]?._uid || next[idx - 1]?._uid || null);
  }
  setSelectedUids((prev) => { const n = new Set(prev); n.delete(entry._uid); return n; });
};

  const handleAddClick = () => {
    const selected = entries.filter((e) => selectedUids.has(e._uid));
    onAddToProject?.(selected);
    setSelectedUids(new Set());
  };

  const handleResetClick = () => {
    const selected = Array.from(selectedUids);
    onResetSelected?.(selected);
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
          {(showSelection || onResetSelected) && (
            <Checkbox checked={isChecked} onChange={() => toggleSelect(entry)} onClick={(e) => e.stopPropagation()} />
          )}
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
    <>
      <style>{splitterStyles}</style>
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
                    <Tooltip title={showAdvancedFilters ? "收起筛选" : "展开高级筛选"}>
                      <Button 
                        size="small" 
                        type={showAdvancedFilters ? "primary" : "default"} 
                        icon={<FilterOutlined />} 
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} 
                      />
                    </Tooltip>
                  </Flex>
                  
                  {showAdvancedFilters && (
                    <Flex vertical gap={8} style={{ padding: 8, background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                      <Flex gap={8}>
                        <Select size="small" value={filterHost} onChange={setFilterHost} options={hosts} style={{ flex: 1 }} />
                        <Select size="small" value={filterMime} onChange={setFilterMime} options={mimes} style={{ flex: 1 }} />
                      </Flex>
                      <Flex gap={8}>
                        <Select size="small" value={method} onChange={setMethod} options={methods} style={{ width: 100 }} />
                        <Segmented size="small" value={statusRange} onChange={setStatusRange} options={[{ value: 'ALL', label: '全部' }, { value: '2xx', label: '2xx' }, { value: '3xx', label: '3xx' }, { value: '4xx', label: '4xx' }, { value: '5xx', label: '5xx' }]} />
                      </Flex>
                      <Flex gap={8}>
                        <Input allowClear size="small" placeholder="排除关键字(URL或Body)" value={excludeKeyword} onChange={(e) => setExcludeKeyword(e.target.value)} style={{ borderColor: excludeKeyword ? '#ff4d4f' : '' }} />
                      </Flex>
                    </Flex>
                  )}

                  <Flex justify="space-between" align="center">
                    <Text type="secondary" style={{ fontSize: 12 }}>共 {filtered.length} 条</Text>
                    <Flex gap={8} align="center">
                      <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleSelectAll}>
                        <Text style={{ fontSize: 12 }}>已选 {selectedUids.size}</Text>
                      </Checkbox>
                      {showAddToProject && (
                        <Button size="small" type="primary" disabled={selectedUids.size === 0} onClick={handleAddClick}>添加到项目</Button>
                      )}
                      {onResetSelected && (
                        <Button size="small" icon={<RollbackOutlined />} disabled={selectedUids.size === 0} onClick={handleResetClick}>重置选中</Button>
                      )}
                    </Flex>
                  </Flex>
                </>
              )}
            </Flex>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {entries.length === 0 ? (emptyNode || <Empty style={{ marginTop: 50 }} description="暂无请求" />) : filtered.map((e) => renderRow(e, entriesIndexMap.get(e._uid)))}
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
    </>
  );
}