import { useEffect, useMemo, useState } from 'react';
import {
  Splitter, Flex, Input, Select, Segmented, Typography, Tag,
  Button, Empty, Spin, App, Checkbox, Popover, Listy,
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import RequestDetail from './RequestDetail';
import ParsePreviewPanel from './ParsePreviewPanel';
import useElementSize from '../hooks/useElementSize';
import { useAlgorithms } from '../store/algorithmStore';
import {
  formatTime, statusColor, parseUrlParts, genUid,
} from '../utils/har';
import { applyAssignmentsToEntry } from '../utils/applyAssignments';

const { Text } = Typography;

const METHOD_COLOR = {
  GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red',
  PATCH: 'purple', HEAD: 'default', OPTIONS: 'default',
};

const STATUS_RANGE = {
  ALL: () => true,
  '2xx': (s) => s >= 200 && s < 300,
  '3xx': (s) => s >= 300 && s < 400,
  '4xx': (s) => s >= 400 && s < 500,
  '5xx': (s) => s >= 500,
};

const PRESET_TAGS = [
  { label: '重点关注', color: 'error' },
  { label: '已分析', color: 'success' },
  { label: '性能问题', color: 'warning' },
  { label: 'Bug', color: 'magenta' },
  { label: '待办', color: 'processing' },
  { label: '忽略', color: 'default' },
];

function TagManager({ currentTags, onChange }) {
  const [input, setInput] = useState('');
  const add = (label, color) => {
    const l = (label || '').trim();
    if (!l) return;
    if (currentTags.some((t) => t.label === l)) { setInput(''); return; }
    onChange([...currentTags, { label: l, color: color || 'default' }]);
    setInput('');
  };
  const remove = (label) => onChange(currentTags.filter((t) => t.label !== label));
  const content = (
    <div style={{ width: 240 }}>
      <Flex gap={4} wrap style={{ marginBottom: 8 }}>
        {PRESET_TAGS.map((p) => (
          <Tag key={p.label} color={p.color} style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => add(p.label, p.color)}>{p.label}</Tag>
        ))}
      </Flex>
      <Flex gap={4}>
        <Input size="small" placeholder="自定义标签" value={input}
          onChange={(e) => setInput(e.target.value)} onPressEnter={() => add(input)} />
        <Button size="small" type="primary" onClick={() => add(input)}>加</Button>
      </Flex>
      {currentTags.length > 0 && (
        <>
          <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>当前标签</div>
          <Flex gap={4} wrap style={{ marginTop: 4 }}>
            {currentTags.map((t) => (
              <Tag key={t.label} color={t.color} closable
                onClose={(e) => { e.preventDefault(); remove(t.label); }}>{t.label}</Tag>
            ))}
          </Flex>
        </>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottom">
      <Button size="small" type="dashed" icon={<PlusOutlined />}
        onClick={(e) => e.stopPropagation()} style={{ fontSize: 11 }}>标签</Button>
    </Popover>
  );
}

export default function RequestWorkbench({
  entries, setEntries, projectId,
  showSelection = true, showAddToProject = false, onAddToProject,
  headerExtra = null, headerTopExtra = null, emptyNode = null,
}) {
  const { message } = App.useApp();
  const { getEffectiveConfigMap } = useAlgorithms();
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('ALL');
  const [statusRange, setStatusRange] = useState('ALL');
  const [currentUid, setCurrentUid] = useState(null);
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [parsePreview, setParsePreview] = useState(null);

  const [listRef, { height: listHeight }, measure] = useElementSize();

  useEffect(() => {
    if (!entries.some((e) => !e._uid)) return;
    const patched = entries.map((e) => e._uid ? e : { ...e, _uid: genUid() });
    setEntries(patched);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    const id = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(id);
  }, [entries, measure]);

  const current = useMemo(
    () => entries.find((e) => e._uid === currentUid) || null,
    [entries, currentUid]
  );

  const methods = useMemo(() => {
    const set = new Set(entries.map((e) => e.request?.method).filter(Boolean));
    return [{ value: 'ALL', label: '全部方法' }].concat([...set].map((m) => ({ value: m, label: m })));
  }, [entries]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rangeFn = STATUS_RANGE[statusRange] || STATUS_RANGE.ALL;
    return entries.filter((e) => {
      const m = e.request?.method;
      const s = e.response?.status || 0;
      if (method !== 'ALL' && m !== method) return false;
      if (!rangeFn(s)) return false;
      if (!kw) return true;
      return (
        (e.request?.url || '').toLowerCase().includes(kw) ||
        (e.response?.content?.mimeType || '').toLowerCase().includes(kw) ||
        m?.toLowerCase().includes(kw)
      );
    });
  }, [entries, keyword, method, statusRange]);

  const allChecked = filtered.length > 0 && filtered.every((e) => selectedUids.has(e._uid));
  const someChecked = filtered.some((e) => selectedUids.has(e._uid));

  const toggleSelect = (entry) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(entry._uid)) next.delete(entry._uid);
      else next.add(entry._uid);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const next = new Set(selectedUids);
    if (allChecked) filtered.forEach((e) => next.delete(e._uid));
    else filtered.forEach((e) => next.add(e._uid));
    setSelectedUids(next);
  };

  const updateTags = (uid, tags) => {
    setEntries((prev) => prev.map((e) => (e._uid === uid ? { ...e, tags } : e)));
  };

 // 保持其他代码不变，只替换 handleParseResult：
const handleParseResult = async (result) => {
  if (!current) return;
  try {
    // 1) 记录算法链到 entry
    const existing = current._parseAssignments || [];
    const pathKey = JSON.stringify(result.fieldPath);
    const newAssignments = existing.some((a) => JSON.stringify(a.fieldPath) === pathKey)
      ? existing.map((a) => JSON.stringify(a.fieldPath) === pathKey
          ? { ...a, chain: result.chain.map((c) => c.key) }
          : a)
      : [...existing, { fieldPath: result.fieldPath, chain: result.chain.map((c) => c.key) }];

    setEntries((prev) =>
      prev.map((e) =>
        e._uid === current._uid ? { ...e, _parseAssignments: newAssignments } : e
      )
    );

    // 2) 预览：preserveTemplates=true，模板字段保持原样，仅应用算法链
    const configMap = getEffectiveConfigMap(projectId);
    const { request: previewRequest } = await applyAssignmentsToEntry(
      current,
      newAssignments,
      configMap,
      { steps: [] },
      { preserveTemplates: true }
    );

    setParsePreview({
      entry: { ...current, request: previewRequest },
      chain: result.chain,
      steps: result.steps,
      fieldPath: result.fieldPath,
      fieldLabel: result.fieldLabel,
      originalValue: result.originalValue,
      parsedValue: result.parsedValue,
    });
  } catch (e) {
    console.error('[RequestWorkbench] 应用解析失败:', e);
    message.error(String(e?.message || e));
  }
};

  const handleAddClick = () => {
    const selected = entries.filter((e) => selectedUids.has(e._uid));
    onAddToProject?.(selected);
    setSelectedUids(new Set());
  };

  const renderRow = (entry) => {
    const req = entry.request || {};
    const res = entry.response || {};
    const parts = parseUrlParts(req.url);
    const isCurrent = currentUid === entry._uid;
    const isChecked = selectedUids.has(entry._uid);
    const tags = entry.tags || [];
    const hasAssignments = (entry._parseAssignments || []).length > 0;

    return (
      <div onClick={() => setCurrentUid(entry._uid)}
        style={{
          padding: '6px 10px', cursor: 'pointer', fontSize: 12,
          background: isCurrent ? '#e6f4ff' : 'transparent',
          borderBottom: '1px solid #f0f0f0',
        }}>
        <Flex align="center" gap={6} style={{ minWidth: 0 }}>
          {showSelection && (
            <Checkbox checked={isChecked}
              onChange={(e) => { e.stopPropagation(); toggleSelect(entry); }}
              onClick={(e) => e.stopPropagation()} />
          )}
          <Tag color={METHOD_COLOR[req.method] || 'default'}
            style={{ margin: 0, minWidth: 46, textAlign: 'center' }}>{req.method}</Tag>
          <Tag color={statusColor(res.status)}
            style={{ margin: 0, minWidth: 40, textAlign: 'center' }}>{res.status}</Tag>
          <Text ellipsis style={{ width: 120, color: '#595959' }} title={parts.host}>{parts.host}</Text>
          <Text ellipsis style={{ flex: 1, minWidth: 0 }} title={parts.path}>{parts.path}</Text>
          {hasAssignments && <Tag color="purple" style={{ margin: 0 }}>有算法</Tag>}
          <Text type="secondary" style={{ flexShrink: 0, width: 60, textAlign: 'right' }}>
            {formatTime(entry.time)}
          </Text>
        </Flex>
        <Flex align="center" gap={4} wrap style={{ marginTop: 4, paddingLeft: showSelection ? 24 : 0 }}>
          {tags.map((t) => (
            <Tag key={t.label} color={t.color} closable
              onClose={(e) => {
                e.preventDefault(); e.stopPropagation();
                updateTags(entry._uid, tags.filter((x) => x.label !== t.label));
              }}>{t.label}</Tag>
          ))}
          <TagManager currentTags={tags} onChange={(next) => updateTags(entry._uid, next)} />
        </Flex>
      </div>
    );
  };

  const listyAvailable = typeof Listy === 'function' || (Listy && Listy.$$typeof);
  const hasEntries = entries.length > 0;

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="42%" min="25%" max="65%">
        <Flex vertical style={{ height: '100%', background: '#fff' }}>
          <Flex vertical gap={8}
            style={{ padding: 10, borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            {headerTopExtra}
            {headerExtra}
            {hasEntries && (
              <>
                <Flex gap={6} wrap>
                  <Input allowClear size="small" prefix={<SearchOutlined />}
                    placeholder="搜索 URL / 方法 / MIME" style={{ flex: 1, minWidth: 140 }}
                    value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                  <Select size="small" value={method} onChange={setMethod}
                    options={methods} style={{ width: 90 }} />
                </Flex>
                <Flex justify="space-between" align="center" gap={6}>
                  <Segmented size="small" value={statusRange} onChange={setStatusRange}
                    options={[
                      { value: 'ALL', label: '全部' }, { value: '2xx', label: '2xx' },
                      { value: '3xx', label: '3xx' }, { value: '4xx', label: '4xx' },
                      { value: '5xx', label: '5xx' },
                    ]} />
                  <Text type="secondary" style={{ fontSize: 11 }}>{filtered.length} 条</Text>
                </Flex>
                {(showSelection || showAddToProject) && (
                  <Flex justify="space-between" align="center" gap={6}>
                    {showSelection ? (
                      <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked}
                        onChange={toggleSelectAll}>
                        <Text style={{ fontSize: 12 }}>已选 {selectedUids.size}</Text>
                      </Checkbox>
                    ) : <span />}
                    {showAddToProject && (
                      <Button size="small" type="primary" icon={<PlusOutlined />}
                        disabled={selectedUids.size === 0}
                        onClick={handleAddClick}>添加到项目</Button>
                    )}
                  </Flex>
                )}
              </>
            )}
          </Flex>

          <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            {!hasEntries ? (
              emptyNode || (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                  <Empty description="暂无请求" />
                </Flex>
              )
            ) : !listyAvailable ? (
              <div style={{ height: '100%', overflow: 'auto' }}>
                {filtered.map((entry) => <div key={entry._uid}>{renderRow(entry)}</div>)}
              </div>
            ) : listHeight > 0 ? (
              <Listy virtual items={filtered} rowKey={(r) => r._uid}
                height={listHeight} itemRender={(entry) => renderRow(entry)} />
            ) : (
              <Flex justify="center" align="center" style={{ height: '100%' }}><Spin /></Flex>
            )}
          </div>
        </Flex>
      </Splitter.Panel>

      <Splitter.Panel>
        <Splitter orientation="vertical">
          <Splitter.Panel defaultSize="55%" min="25%">
            {current ? (
              <RequestDetail entry={current} inline projectId={projectId}
                onParseResult={handleParseResult} />
            ) : (
              <Flex justify="center" align="center" style={{ height: '100%' }}>
                <Empty description="从左侧选择一条请求查看详情" />
              </Flex>
            )}
          </Splitter.Panel>
          <Splitter.Panel>
            <ParsePreviewPanel parsed={parsePreview} projectId={projectId}
              onClose={() => setParsePreview(null)} />
          </Splitter.Panel>
        </Splitter>
      </Splitter.Panel>
    </Splitter>
  );
}