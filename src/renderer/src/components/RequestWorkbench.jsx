import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Splitter, Flex, Input, Select, Segmented, Typography, Tag,
  Button, Empty, Spin, App, Checkbox, Popover, Listy, Divider, Popconfirm, Space,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, ThunderboltOutlined, HolderOutlined,
  EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import RequestDetail, { ParserModal } from './RequestDetail';
import ParsePreviewPanel from './ParsePreviewPanel';
import useElementSize from '../hooks/useElementSize';
import { useAlgorithms } from '../store/algorithmStore';
import { useScripts } from '../store/scriptStore';
import { formatTime, statusColor, parseUrlParts, genUid } from '../utils/har';
import { applyAssignmentsToEntry } from '../utils/applyAssignments';
import { buildCustomTemplates, buildScriptTemplates, PARSER_TEMPLATES } from '../utils/parsers';

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

/* ==================== 静态资源类型（可配置） ==================== */
const STATIC_TYPES_STORAGE_KEY = 'har-workbench-static-types-v1';

const STATIC_TYPE_DEFS = [
  {
    key: 'image', label: '图片',
    mimePrefixes: ['image/'], mimeExact: [],
    exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'tiff', 'tif'],
  },
  {
    key: 'audio', label: '音频',
    mimePrefixes: ['audio/'], mimeExact: [],
    exts: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
  },
  {
    key: 'video', label: '视频',
    mimePrefixes: ['video/'], mimeExact: [],
    exts: ['mp4', 'webm', 'm4v', 'mov', 'avi', 'mkv'],
  },
  {
    key: 'font', label: '字体',
    mimePrefixes: ['font/'],
    mimeExact: [
      'application/font-woff', 'application/x-font-woff',
      'application/font-woff2', 'application/x-font-ttf',
      'application/x-font-truetype', 'application/x-font-otf',
      'application/x-font-opentype', 'application/vnd.ms-fontobject',
    ],
    exts: ['woff', 'woff2', 'ttf', 'otf', 'eot'],
  },
  {
    key: 'css', label: 'CSS',
    mimePrefixes: [], mimeExact: ['text/css'],
    exts: ['css'],
  },
  {
    key: 'js', label: 'JS',
    mimePrefixes: [],
    mimeExact: [
      'text/javascript', 'application/javascript',
      'application/x-javascript', 'application/ecmascript',
    ],
    exts: ['js', 'mjs', 'cjs'],
  },
  {
    key: 'html', label: 'HTML',
    mimePrefixes: [],
    mimeExact: ['text/html', 'application/xhtml+xml'],
    exts: ['html', 'htm', 'xhtml'],
  },
  {
    key: 'map', label: 'SourceMap',
    mimePrefixes: [], mimeExact: [],
    exts: ['map'],
  },
];

function getMime(entry) {
  return String(entry?.response?.content?.mimeType || '').toLowerCase().split(';')[0].trim();
}

function getPathExt(entry) {
  const url = entry?.request?.url || '';
  let pathname = '';
  try { pathname = new URL(url).pathname.toLowerCase(); }
  catch { pathname = String(url).toLowerCase().split('?')[0].split('#')[0]; }
  const m = pathname.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function matchesType(entry, def) {
  const mime = getMime(entry);
  if (mime) {
    for (const p of def.mimePrefixes) if (mime.startsWith(p)) return true;
    if (def.mimeExact.includes(mime)) return true;
  }
  const ext = getPathExt(entry);
  if (ext && def.exts.includes(ext)) return true;
  return false;
}

function makeStaticMatcher(enabledKeys) {
  const types = STATIC_TYPE_DEFS.filter((t) => enabledKeys.includes(t.key));
  return (entry) => types.some((t) => matchesType(entry, t));
}

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

function ChainManagerPopover({ entry, allTemplates, onEdit, onRemove, children }) {
  const assignments = entry._parseAssignments || [];
  const content = (
    <div style={{ minWidth: 320, maxWidth: 500 }}>
      <Text strong style={{ fontSize: 12 }}>字段配置（共 {assignments.length} 条）</Text>
      <Divider style={{ margin: '8px 0' }} />
      {assignments.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>（无）</Text>
      ) : (
        <Flex vertical gap={8}>
          {assignments.map((a, ai) => {
            const fieldLabel = Array.isArray(a.fieldPath) ? a.fieldPath.join('.') : String(a.fieldPath);
            const chain = Array.isArray(a.chain) ? a.chain : [];
            return (
              <div key={ai} style={{ background: '#fafafa', borderRadius: 4, padding: 8 }}>
                <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
                  <Tag color="purple" style={{ margin: 0 }}>字段</Tag>
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} ellipsis
                    title={fieldLabel}>
                    {fieldLabel}
                  </Text>
                  <Button size="small" type="text" icon={<EditOutlined />}
                    onClick={() => onEdit(a)} title="编辑" />
                  <Popconfirm title="删除此条链？" onConfirm={() => onRemove(a)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} title="删除" />
                  </Popconfirm>
                </Flex>
                {a.jsonSubPath && (
                  <Tag color="cyan" style={{ margin: '0 4px 4px 0', fontSize: 11 }}>JSON 键：{a.jsonSubPath}</Tag>
                )}
                {a.valueSources && a.valueSources.length > 0 && (
                  <Tag color="cyan" style={{ margin: '0 4px 4px 0', fontSize: 11 }}>
                    多来源 ×{a.valueSources.length}
                  </Tag>
                )}
                <Flex wrap gap={4}>
                  {chain.map((item, i) => {
                    const key = typeof item === 'string' ? item : item.key;
                    return (
                      <Tag key={i} style={{ margin: 0, fontSize: 11 }}>
                        {i + 1}. {allTemplates[key]?.label || key}
                      </Tag>
                    );
                  })}
                </Flex>
              </div>
            );
          })}
        </Flex>
      )}
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomLeft">
      {children}
    </Popover>
  );
}

export default function RequestWorkbench({
  entries, setEntries, projectId,
  showSelection = true, showAddToProject = false, onAddToProject,
  headerExtra = null, headerTopExtra = null, emptyNode = null,
  enableDrag = false,
  onReorder,
}) {
  const { message } = App.useApp();
  const { getEffectiveConfigMap, getCustomAlgorithms } = useAlgorithms();
  const { scripts } = useScripts();
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('ALL');
  const [statusRange, setStatusRange] = useState('ALL');
  const [currentUid, setCurrentUid] = useState(null);
  const [selectedUids, setSelectedUids] = useState(() => new Set());
  const [parsePreview, setParsePreview] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState('general');
  const [hideStatic, setHideStatic] = useState(false);

  // 静态资源类型（持久化）
  const [staticTypes, setStaticTypes] = useState(() => {
    const all = STATIC_TYPE_DEFS.map((t) => t.key);
    try {
      const raw = localStorage.getItem(STATIC_TYPES_STORAGE_KEY);
      if (!raw) return all;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return all;
      return arr.filter((k) => STATIC_TYPE_DEFS.some((t) => t.key === k));
    } catch { return all; }
  });

  useEffect(() => {
    try { localStorage.setItem(STATIC_TYPES_STORAGE_KEY, JSON.stringify(staticTypes)); } catch {}
  }, [staticTypes]);

  const staticMatcher = useMemo(() => makeStaticMatcher(staticTypes), [staticTypes]);

  const [editingAssignment, setEditingAssignment] = useState(null);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);

  const [listRef, { height: listHeight }, measure] = useElementSize();

  const scriptsRef = useRef(scripts);
  useEffect(() => { scriptsRef.current = scripts; }, [scripts]);
  const getCfgMapRef = useRef(getEffectiveConfigMap);
  useEffect(() => { getCfgMapRef.current = getEffectiveConfigMap; }, [getEffectiveConfigMap]);
  const getCustomRef = useRef(getCustomAlgorithms);
  useEffect(() => { getCustomRef.current = getCustomAlgorithms; }, [getCustomAlgorithms]);

  const allTemplates = useMemo(() => ({
    ...PARSER_TEMPLATES,
    ...buildCustomTemplates(getCustomAlgorithms(projectId)),
    ...buildScriptTemplates(scripts),
  }), [getCustomAlgorithms, projectId, scripts]);

  useEffect(() => {
    if (!entries.some((e) => !e._uid)) return;
    setEntries(entries.map((e) => e._uid ? e : { ...e, _uid: genUid() }));
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

  const staticCount = useMemo(
    () => entries.filter((e) => staticMatcher(e)).length,
    [entries, staticMatcher]
  );

  const assignmentsKey = current ? JSON.stringify(current._parseAssignments || []) : '';

  useEffect(() => {
    if (!current) { setParsePreview(null); return; }
    const assignments = current._parseAssignments || [];
    if (assignments.length === 0) { setParsePreview(null); return; }

    if (parsePreview?.entry?._uid === current._uid && parsePreview?.steps?.length) return;

    let cancelled = false;
    (async () => {
      try {
        const configMap = getCfgMapRef.current(projectId);
        const customTemplates = {
          ...buildCustomTemplates(getCustomRef.current(projectId)),
          ...buildScriptTemplates(scriptsRef.current),
        };
        const result = await applyAssignmentsToEntry(
          current, assignments, configMap, { steps: [] },
          { preserveTemplates: true, customTemplates }
        );
        if (cancelled) return;
        const previewEntry = result.entry || { ...current, request: result.request };
        if (!previewEntry?.request) { setParsePreview(null); return; }
        setParsePreview({
          entry: previewEntry,
          chain: [], steps: [],
          fieldPath: null, fieldLabel: null,
          originalValue: null, parsedValue: null,
          autoLoaded: true,
        });
      } catch (e) {
        console.error('[Workbench] 自动加载预览失败:', e);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?._uid, assignmentsKey, projectId]);

  const methods = useMemo(() => {
    const set = new Set(entries.map((e) => e.request?.method).filter(Boolean));
    return [{ value: 'ALL', label: '全部方法' }].concat([...set].map((m) => ({ value: m, label: m })));
  }, [entries]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const rangeFn = STATUS_RANGE[statusRange] || STATUS_RANGE.ALL;
    return entries.filter((e) => {
      if (hideStatic && staticMatcher(e)) return false;
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
  }, [entries, keyword, method, statusRange, hideStatic, staticMatcher]);

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

  const handleDeleteEntry = (entry) => {
    const idx = entries.findIndex((e) => e._uid === entry._uid);
    if (idx < 0) return;
    const next = entries.filter((e) => e._uid !== entry._uid);
    setEntries(next);

    if (currentUid === entry._uid) {
      const fallback = next[idx] || next[idx - 1] || null;
      setCurrentUid(fallback?._uid || null);
      setParsePreview(null);
    }

    setSelectedUids((prev) => {
      if (!prev.has(entry._uid)) return prev;
      const n = new Set(prev);
      n.delete(entry._uid);
      return n;
    });

    message.success('已删除请求');
  };

  const handleClearStatic = () => {
    if (staticTypes.length === 0) {
      message.warning('请先在「类型」里至少勾选一种静态资源类型');
      return;
    }
    const toRemove = new Set(entries.filter((e) => staticMatcher(e)).map((e) => e._uid));
    if (toRemove.size === 0) {
      message.info('没有匹配当前勾选类型的静态资源');
      return;
    }
    const next = entries.filter((e) => !toRemove.has(e._uid));
    setEntries(next);

    if (currentUid && toRemove.has(currentUid)) {
      setCurrentUid(next[0]?._uid || null);
      setParsePreview(null);
    }

    setSelectedUids((prev) => {
      const n = new Set(prev);
      toRemove.forEach((uid) => n.delete(uid));
      return n;
    });

    message.success(`已清除 ${toRemove.size} 条静态资源请求`);
  };

  const handleParseResult = async (result) => {
    if (!current) return;
    try {
      let newAssignments;
      if (result.cleared) {
        newAssignments = (current._parseAssignments || []).filter(
          (a) => JSON.stringify(a.fieldPath) !== JSON.stringify(result.fieldPath)
        );
      } else {
        const existing = current._parseAssignments || [];
        const pathKey = JSON.stringify(result.fieldPath);
        const newEntry = {
          fieldPath: result.fieldPath,
          jsonSubPath: result.jsonSubPath,
          valueSources: result.valueSources,
          joinMode: result.joinMode,
          template: result.template,
          chain: result.chain,
        };
        newAssignments = existing.some((a) => JSON.stringify(a.fieldPath) === pathKey)
          ? existing.map((a) => JSON.stringify(a.fieldPath) === pathKey ? newEntry : a)
          : [...existing, newEntry];
      }

      setEntries((prev) => prev.map((e) =>
        e._uid === current._uid ? { ...e, _parseAssignments: newAssignments } : e
      ));

      if (newAssignments.length === 0) { setParsePreview(null); return; }

      const configMap = getEffectiveConfigMap(projectId);
      const customTemplates = {
        ...buildCustomTemplates(getCustomAlgorithms(projectId)),
        ...buildScriptTemplates(scripts),
      };

      const target = newAssignments.find(
        (a) => JSON.stringify(a.fieldPath) === JSON.stringify(result.fieldPath)
      );

      const r = await applyAssignmentsToEntry(
        current, target ? [target] : [], configMap, { steps: [] },
        { preserveTemplates: true, customTemplates }
      );

      setParsePreview({
        entry: r.entry || { ...current, request: r.request },
        chain: result.chain || [],
        steps: [],
        fieldPath: result.fieldPath,
        fieldLabel: result.fieldLabel,
        originalValue: null,
        parsedValue: null,
      });
    } catch (e) {
      console.error('[Workbench] 应用失败:', e);
      message.error(String(e?.message || e));
    }
  };

  const handleRemoveAssignment = (assignment) => {
    if (!current) return;
    const newAssignments = (current._parseAssignments || []).filter(
      (a) => JSON.stringify(a.fieldPath) !== JSON.stringify(assignment.fieldPath)
    );
    setEntries((prev) =>
      prev.map((e) => e._uid === current._uid ? { ...e, _parseAssignments: newAssignments } : e)
    );
    message.success(`已删除字段 ${assignment.fieldPath.join('.')} 的配置`);
    if (newAssignments.length === 0) setParsePreview(null);
  };

  const handleEditAssignment = (assignment) => {
    setEditingAssignment(assignment);
  };

  const handleAddClick = () => {
    const selected = entries.filter((e) => selectedUids.has(e._uid));
    onAddToProject?.(selected);
    setSelectedUids(new Set());
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
    if (from != null && from !== idx && onReorder) onReorder(from, idx);
    setDraggingIndex(null);
    setDropIndex(null);
  };
  const handleDragEnd = () => { setDraggingIndex(null); setDropIndex(null); };

  const renderRow = (entry, idx) => {
    const req = entry.request || {};
    const res = entry.response || {};
    const parts = parseUrlParts(req.url);
    const isCurrent = currentUid === entry._uid;
    const isChecked = selectedUids.has(entry._uid);
    const tags = entry.tags || [];
    const assignmentsCount = (entry._parseAssignments || []).length;
    const isStatic = staticMatcher(entry);

    const rowContent = (
      <div onClick={() => setCurrentUid(entry._uid)}
        style={{
          padding: '6px 10px', cursor: 'pointer', fontSize: 12,
          background: isCurrent ? '#e6f4ff' : 'transparent',
          borderBottom: '1px solid #f0f0f0',
          opacity: draggingIndex === idx ? 0.4 : (isStatic ? 0.75 : 1),
          outline: (dropIndex === idx && draggingIndex !== idx) ? '2px dashed #1677ff' : 'none',
        }}>
        <Flex align="center" gap={6} style={{ minWidth: 0 }}>
          {enableDrag && (
            <HolderOutlined style={{ color: '#bfbfbf', cursor: 'grab', flexShrink: 0 }} />
          )}
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
          {isStatic && (
            <Tag color="default" style={{ margin: 0, fontSize: 10, opacity: 0.75 }}>静态</Tag>
          )}
          {assignmentsCount > 0 && (
            <ChainManagerPopover
              entry={entry}
              allTemplates={allTemplates}
              onEdit={handleEditAssignment}
              onRemove={handleRemoveAssignment}
            >
              <Tag color="purple" style={{ margin: 0, cursor: 'pointer' }}>
                <ThunderboltOutlined style={{ marginRight: 2 }} />配置 ×{assignmentsCount}
              </Tag>
            </ChainManagerPopover>
          )}
          <Text type="secondary" style={{ flexShrink: 0, width: 60, textAlign: 'right' }}>
            {formatTime(entry.time)}
          </Text>
          <Popconfirm
            title="删除这条请求？"
            description="会同时移除它的字段配置"
            onConfirm={(e) => { e?.stopPropagation?.(); handleDeleteEntry(entry); }}
            onCancel={(e) => e?.stopPropagation?.()}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
              title="删除请求"
              style={{ flexShrink: 0 }}
            />
          </Popconfirm>
        </Flex>
        <Flex align="center" gap={4} wrap style={{ marginTop: 4, paddingLeft: showSelection || enableDrag ? 24 : 0 }}>
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

    if (!enableDrag) return <div key={entry._uid}>{rowContent}</div>;

    return (
      <div key={entry._uid}
        draggable
        onDragStart={(e) => handleDragStart(e, idx)}
        onDragOver={(e) => handleDragOver(e, idx)}
        onDrop={(e) => handleDrop(e, idx)}
        onDragEnd={handleDragEnd}>
        {rowContent}
      </div>
    );
  };

  const listyAvailable = typeof Listy === 'function' || (Listy && Listy.$$typeof);
  const hasEntries = entries.length > 0;

  // 类型选择 Popover 内容
  const typesPopoverContent = (
    <div style={{ minWidth: 240 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 12 }}>静态资源类型</Text>
        <Space size={2}>
          <Button size="small" type="link"
            onClick={() => setStaticTypes(STATIC_TYPE_DEFS.map((t) => t.key))}>
            全选
          </Button>
          <Button size="small" type="link"
            onClick={() => setStaticTypes([])}>
            清空
          </Button>
        </Space>
      </Flex>
      <Flex vertical gap={4}>
        {STATIC_TYPE_DEFS.map((t) => (
          <Checkbox
            key={t.key}
            checked={staticTypes.includes(t.key)}
            onChange={(e) => {
              setStaticTypes((prev) => {
                if (e.target.checked) return [...new Set([...prev, t.key])];
                return prev.filter((k) => k !== t.key);
              });
            }}
          >
            <Text style={{ fontSize: 12 }}>{t.label}</Text>
          </Checkbox>
        ))}
      </Flex>
      <Divider style={{ margin: '8px 0' }} />
      <Text type="secondary" style={{ fontSize: 11 }}>
        被勾选的类型会被「隐藏」和「清除」操作处理。配置会记住。
      </Text>
    </div>
  );

  return (
    <>
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

                  {/* 静态资源控制 */}
                  <Flex justify="space-between" align="center" gap={6} wrap>
                    <Flex align="center" gap={6} wrap>
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        content={typesPopoverContent}
                        title={<Text style={{ fontSize: 12 }}>选择哪些类型视为静态资源</Text>}
                      >
                        <Button size="small">
                          类型 {staticTypes.length}/{STATIC_TYPE_DEFS.length}
                        </Button>
                      </Popover>
                      <Checkbox
                        checked={hideStatic}
                        onChange={(e) => setHideStatic(e.target.checked)}
                        disabled={staticTypes.length === 0}
                      >
                        <Text style={{ fontSize: 12 }}>
                          隐藏静态{staticCount > 0 ? `（${staticCount}）` : ''}
                        </Text>
                      </Checkbox>
                    </Flex>
                    {staticTypes.length > 0 && staticCount > 0 && (
                      <Popconfirm
                        title={`删除全部 ${staticCount} 条静态资源请求？`}
                        description="仅删除当前勾选类型的资源"
                        onConfirm={handleClearStatic}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button size="small" danger>清除静态资源</Button>
                      </Popconfirm>
                    )}
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
                  {filtered.map((entry) => renderRow(entry, entries.indexOf(entry)))}
                </div>
              ) : listHeight > 0 ? (
                <Listy virtual items={filtered} rowKey={(r) => r._uid}
                  height={listHeight} itemRender={(entry) => renderRow(entry, entries.indexOf(entry))} />
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
                <RequestDetail
                  entry={current} inline projectId={projectId}
                  onParseResult={handleParseResult}
                  activeKey={activeTabKey}
                  onTabChange={setActiveTabKey}
                />
              ) : (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                  <Empty description="从左侧选择一条请求查看详情" />
                </Flex>
              )}
            </Splitter.Panel>
            <Splitter.Panel>
              <ParsePreviewPanel
                parsed={parsePreview}
                projectId={projectId}
                onClose={() => setParsePreview(null)}
                activeKey={activeTabKey}
                onTabChange={setActiveTabKey}
              />
            </Splitter.Panel>
          </Splitter>
        </Splitter.Panel>
      </Splitter>

      {editingAssignment && current && (
        <ParserModal
          open={!!editingAssignment}
          onClose={() => setEditingAssignment(null)}
          value={String(
            (() => {
              const keys = editingAssignment.fieldPath;
              let cur = current;
              for (const k of keys) { if (cur == null) return ''; cur = cur[k]; }
              return cur ?? '';
            })()
          )}
          fieldPath={editingAssignment.fieldPath}
          fieldLabel={editingAssignment.fieldPath.join('.')}
          onParseResult={async (result) => {
            await handleParseResult(result);
            setEditingAssignment(null);
          }}
          projectId={projectId}
          initialChain={editingAssignment.chain || []}
          initialSources={editingAssignment.valueSources || []}
          initialJoin={{ joinMode: editingAssignment.joinMode, template: editingAssignment.template }}
          initialJsonSubPath={editingAssignment.jsonSubPath || ''}
        />
      )}
    </>
  );
}