import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer, Tabs, Descriptions, Table, Typography, Empty, Tag, Space, Button, App,
  Flex, Modal, Divider, Popconfirm, Input, Popover, InputNumber, Select,
} from 'antd';
import {
  CopyOutlined, ThunderboltOutlined, PlusOutlined, ArrowUpOutlined,
  ArrowDownOutlined, CloseOutlined, DeleteOutlined, InfoCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { decodeContent, formatBytes, formatTime, formatStarted, statusColor } from '../utils/har';
import {
  PARSER_TEMPLATES, PARSER_GROUPS, runParserChain,
  buildCustomTemplates, buildScriptTemplates,
} from '../utils/parsers';
import { useAlgorithms } from '../store/algorithmStore';
import { useScripts } from '../store/scriptStore';

const { Text } = Typography;
const { TextArea } = Input;

function PreBlock({ children, maxHeight = '58vh' }) {
  return (
    <pre style={{
      margin: 0, padding: 12, fontSize: 12, lineHeight: 1.6,
      background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6,
      maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }}>{children}</pre>
  );
}

function configIsFilled(tpl, cfg) {
  const fields = Array.isArray(tpl?.configFields) ? tpl.configFields : [];
  if (fields.length === 0) return true;
  if (!cfg) return false;
  return fields.every((f) => !f.required || (cfg[f.name] && String(cfg[f.name]).trim()));
}

function makeDefaultConfig(tpl) {
  if (!tpl?.configFields) return undefined;
  const out = {};
  for (const f of tpl.configFields) {
    if (f.defaultValue != null && f.defaultValue !== '') out[f.name] = f.defaultValue;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ============ 解析弹窗 ============ */
export function ParserModal({
  open, onClose, value, fieldPath, fieldLabel, onParseResult, projectId,
  initialChain = [], initialSources = [], initialJoin = null, initialJsonSubPath = null,
}) {
  const { getEffectiveConfigMap, getCustomAlgorithms } = useAlgorithms();
  const { scripts } = useScripts();
  const { message } = App.useApp();
  const [chain, setChain] = useState([]);
  const [sources, setSources] = useState([]);
  const [joinMode, setJoinMode] = useState('template');
  const [template, setTemplate] = useState('');
  const [jsonSubPath, setJsonSubPath] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [running, setRunning] = useState(false);
  const [libs, setLibs] = useState([]);

  const configMap = useMemo(() => getEffectiveConfigMap(projectId), [getEffectiveConfigMap, projectId]);
  const customTemplates = useMemo(() => ({
    ...buildCustomTemplates(getCustomAlgorithms(projectId)),
    ...buildScriptTemplates(scripts),
  }), [getCustomAlgorithms, projectId, scripts]);

  useEffect(() => {
    window.electronAPI?.lib?.list?.().then(r => { if (r?.ok) setLibs(r.libs || []) });
  }, [open]);

  const allTemplates = useMemo(() => {
    const base = { ...PARSER_TEMPLATES, ...customTemplates };
    for (const lib of libs) {
      base[`lib:${lib.fileName}`] = {
        label: `库：${lib.fileName}`,
        group: 'lib',
        configFields: [
          { name: 'fnName', label: '函数名', required: true, multiline: false, placeholder: '如 qm' },
          { name: 'args', label: '参数（JSON）', required: false, multiline: true, placeholder: '{"secret":"..."}' },
        ],
      };
    }
    return base;
  }, [customTemplates, libs]);

  const groupsDisplay = useMemo(() => ({ ...PARSER_GROUPS, lib: '本地库' }), []);

  const initRef = useRef({ initialChain, initialSources, initialJoin, initialJsonSubPath });
  useEffect(() => {
    initRef.current = { initialChain, initialSources, initialJoin, initialJsonSubPath };
  }, [initialChain, initialSources, initialJoin, initialJsonSubPath]);

  useEffect(() => {
    if (!open) return;
    const { initialChain, initialSources, initialJoin, initialJsonSubPath } = initRef.current;
    setChain((initialChain || []).map(item => typeof item === 'string' ? { key: item } : item));
    setSources(initialSources || []);
    setShowSources((initialSources || []).length > 0);
    setJoinMode(initialJoin?.joinMode || 'template');
    setTemplate(initialJoin?.template || '');
    setJsonSubPath(initialJsonSubPath || '');
  }, [open]);

  const grouped = useMemo(() => {
    const m = {};
    Object.entries(allTemplates).forEach(([k, tpl]) => {
      (m[tpl.group] ||= []).push([k, tpl]);
    });
    return m;
  }, [allTemplates]);

  const addToChain = (k) => setChain((prev) => [...prev, { key: k }]);
  const removeFromChain = (i) => setChain((prev) => prev.filter((_, idx) => idx !== i));
  const moveChain = (i, d) => setChain((prev) => {
    const n = [...prev]; const j = i + d
    if (j < 0 || j >= n.length) return prev
    ;[n[i], n[j]] = [n[j], n[i]]; return n
  });
  const updateChainCfg = (i, patch) => setChain((prev) => prev.map((it, idx) =>
    idx === i ? { ...it, config: { ...(it.config || {}), ...patch } } : it
  ));

  const addSource = () => setSources((prev) => [...prev, {
    label: `v${prev.length + 1}`, from: 'constant', value: '', chain: [],
  }]);
  const updateSource = (i, patch) => setSources((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const removeSource = (i) => setSources((prev) => prev.filter((_, idx) => idx !== i));

  const run = () => {
    if (!onParseResult) return onClose();
    const cleared = chain.length === 0 && !(showSources && sources.length > 0);
    onParseResult({
      fieldPath, fieldLabel, cleared,
      chain: cleared ? [] : chain,
      valueSources: (showSources && sources.length > 0) ? sources : undefined,
      joinMode,
      template,
      jsonSubPath: jsonSubPath || undefined,
    });
    onClose();
  };

  return (
    <Modal open={open} onCancel={onClose} width={1000} footer={null}
      title={`配置 · ${fieldLabel || fieldPath.join('.')}`} destroyOnHidden>

      {/* 值来源 */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Button size="small" type="link" onClick={() => setShowSources(v => !v)}>
          {showSources ? '▼' : '▶'} 值来源（{sources.length}）{!showSources && ' · 用字段原值'}
        </Button>
        {showSources && (
          <Button size="small" onClick={() => setShowSources(false)}>改用字段原值</Button>
        )}
      </Flex>

      {showSources && (
        <Flex vertical gap={8} style={{ background: '#fafafa', padding: 8, borderRadius: 6, marginBottom: 12 }}>
          {sources.map((s, i) => (
            <Flex key={i} gap={6} align="center" wrap>
              <Input size="small" style={{ width: 100 }} placeholder="标签"
                value={s.label} onChange={(e) => updateSource(i, { label: e.target.value })} />
              <Select size="small" style={{ width: 140 }} value={s.from}
                onChange={(v) => updateSource(i, { from: v })}
                options={[
                  { value: 'constant', label: '常量' },
                  { value: 'timestamp', label: '时间戳' },
                  { value: 'random', label: '随机字符串' },
                  { value: 'ownBody', label: '本请求 body' },
                  { value: 'ownField', label: '本请求字段' },
                  { value: 'ownQuery', label: '本请求 query' },
                  { value: 'ownHeader', label: '本请求 header' },
                  { value: 'prevResponse', label: '上一条响应' },
                  { value: 'atRequest', label: '第 N 条请求' },
                  { value: 'atResponse', label: '第 N 条响应' },
                ]} />
              {s.from === 'constant' && (
                <Input size="small" style={{ flex: 1 }} placeholder="值"
                  value={s.value || ''} onChange={(e) => updateSource(i, { value: e.target.value })} />
              )}
              {s.from === 'timestamp' && (
                <Select size="small" style={{ width: 80 }} value={s.unit || 'ms'}
                  onChange={(v) => updateSource(i, { unit: v })}
                  options={[{ value: 'ms', label: '毫秒' }, { value: 's', label: '秒' }]} />
              )}
              {s.from === 'random' && (
                <InputNumber size="small" style={{ width: 80 }} placeholder="长度"
                  value={s.len || 16} onChange={(v) => updateSource(i, { len: v })} />
              )}
              {['ownBody', 'ownField', 'prevResponse', 'atRequest', 'atResponse'].includes(s.from) && (
                <Input size="small" style={{ flex: 1, minWidth: 150 }} placeholder="路径，如 data.token"
                  value={s.path || ''} onChange={(e) => updateSource(i, { path: e.target.value })} />
              )}
              {['ownQuery', 'ownHeader'].includes(s.from) && (
                <Input size="small" style={{ width: 150 }} placeholder="名称"
                  value={s.path || ''} onChange={(e) => updateSource(i, { path: e.target.value })} />
              )}
              {['atRequest', 'atResponse'].includes(s.from) && (
                <InputNumber size="small" style={{ width: 70 }} placeholder="N"
                  value={s.index ?? 0} onChange={(v) => updateSource(i, { index: v ?? 0 })} />
              )}
              {['ownBody', 'prevResponse', 'atResponse'].includes(s.from) && (
                <Select size="small" style={{ width: 80 }} value={s.parse || 'json'}
                  onChange={(v) => updateSource(i, { parse: v })}
                  options={[{ value: 'json', label: 'JSON' }, { value: 'raw', label: '原文' }]} />
              )}
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSource(i)} />
            </Flex>
          ))}
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addSource}>添加来源</Button>
          <Flex gap={6} align="center" wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>拼接方式</Text>
            <Select size="small" style={{ width: 180 }} value={joinMode} onChange={setJoinMode}
              options={[
                { value: 'template', label: '模板拼接' },
                { value: 'amp', label: '& 连接成 k=v' },
                { value: 'none', label: '直接连接' },
                { value: 'json', label: 'JSON.stringify' },
              ]} />
          </Flex>
          {joinMode === 'template' && (
            <Input.TextArea rows={2} size="small"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder="amount={amount}&secret={secret}&ts={ts}"
              value={template}
              onChange={(e) => setTemplate(e.target.value)} />
          )}
        </Flex>
      )}

      {/* JSON 子键 */}
      <Flex gap={6} align="center" style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>JSON 子键（字段是 JSON 字符串时，定位里面的键）：</Text>
        <Input size="small" style={{ width: 200 }} placeholder="如 sign（留空则整个字段替换）"
          value={jsonSubPath} onChange={(e) => setJsonSubPath(e.target.value)} />
      </Flex>

      {/* 算法链 */}
      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Text strong>算法链（应用到 {showSources ? '拼接结果' : '字段原值'}）</Text>
        {chain.length > 0 && <Button size="small" danger onClick={() => setChain([])}>清空</Button>}
      </Flex>
      <Flex vertical gap={6} style={{ minHeight: 80, padding: 8, background: '#fafafa', borderRadius: 6, marginBottom: 12 }}>
        {chain.map((item, i) => {
          const tpl = allTemplates[item.key];
          const filled = configIsFilled(tpl, item.config);
          return (
            <div key={i} style={{ background: '#fff', borderRadius: 4, padding: 6 }}>
              <Flex align="center" gap={6}>
                <Tag color="blue" style={{ margin: 0 }}>{i + 1}</Tag>
                <Text style={{ flex: 1 }}>{tpl?.label || item.key}</Text>
                {!filled && <Tag color="warning" style={{ margin: 0 }}>未配置</Tag>}
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => moveChain(i, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === chain.length - 1} onClick={() => moveChain(i, 1)} />
                <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => removeFromChain(i)} />
              </Flex>
              {tpl?.configFields?.length > 0 && (
                <Flex vertical gap={4} style={{ marginTop: 4, marginLeft: 20 }}>
                  {tpl.configFields.map((f) => (
                    <div key={f.name}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{f.label}</Text>
                      {f.multiline
                        ? <Input.TextArea rows={2} size="small" style={{ fontFamily: 'monospace', fontSize: 11 }}
                            value={item.config?.[f.name] || ''} onChange={(e) => updateChainCfg(i, { [f.name]: e.target.value })} />
                        : <Input size="small" value={item.config?.[f.name] || ''} onChange={(e) => updateChainCfg(i, { [f.name]: e.target.value })} />}
                    </div>
                  ))}
                </Flex>
              )}
            </div>
          );
        })}
        {chain.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>（空链：{showSources ? '拼接结果直接写入' : '什么也不做'}）</Text>
        )}
      </Flex>

      {/* 算法选择器 */}
      <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12 }}>
        {Object.entries(groupsDisplay).map(([g, label]) => {
          const items = grouped[g] || [];
          if (!items.length) return null;
          return (
            <div key={g} style={{ marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
              <Flex wrap gap={4} style={{ marginTop: 4 }}>
                {items.map(([k, tpl]) => (
                  <Tag key={k} style={{ cursor: 'pointer', margin: 0 }} onClick={() => addToChain(k)}>
                    <PlusOutlined style={{ marginRight: 4 }} />{tpl.label}
                  </Tag>
                ))}
              </Flex>
            </div>
          );
        })}
      </div>

      <Flex justify="flex-end" gap={8}>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" loading={running} onClick={run}>
          {chain.length === 0 && !(showSources && sources.length > 0) ? '解绑' : '应用'}
        </Button>
      </Flex>
    </Modal>
  );
}

function ParserButton({
  value, fieldPath, fieldLabel, onParseResult, projectId,
  initialChain, initialSources, initialJoin, initialJsonSubPath,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" type="text"
        icon={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
        title={`选择解析算法${fieldLabel ? `（${fieldLabel}）` : ''}`}
        onClick={() => setOpen(true)} style={{ flexShrink: 0 }} />
      <ParserModal open={open} onClose={() => setOpen(false)}
        value={value} fieldPath={fieldPath} fieldLabel={fieldLabel}
        onParseResult={onParseResult} projectId={projectId}
        initialChain={initialChain}
        initialSources={initialSources}
        initialJoin={initialJoin}
        initialJsonSubPath={initialJsonSubPath} />
    </>
  );
}

/* ============ 字段行 ============ */
function FieldWithParser({
  value, fieldPath, fieldLabel, onParseResult, readonly, projectId, assignments,
}) {
  const { getCustomAlgorithms } = useAlgorithms();
  const { scripts } = useScripts();
  const allTemplates = useMemo(() => ({
    ...PARSER_TEMPLATES,
    ...buildCustomTemplates(getCustomAlgorithms(projectId)),
    ...buildScriptTemplates(scripts),
  }), [getCustomAlgorithms, projectId, scripts]);

  const bound = useMemo(() => {
    if (!assignments) return null;
    return assignments.find((a) => JSON.stringify(a.fieldPath) === JSON.stringify(fieldPath));
  }, [assignments, fieldPath]);

  const chainItems = useMemo(() => {
    if (!bound?.chain) return [];
    return bound.chain.map((item) => {
      const key = typeof item === 'string' ? item : item.key;
      const tpl = allTemplates[key];
      return {
        key,
        label: tpl?.label || key,
        config: typeof item === 'object' ? item.config : undefined,
        group: tpl?.group,
      };
    });
  }, [bound, allTemplates]);

  const [editorOpen, setEditorOpen] = useState(false);

  const handleRemoveBinding = () => {
    if (!onParseResult) return;
    onParseResult({
      fieldPath, fieldLabel, chain: [], steps: [],
      originalValue: value, parsedValue: value, cleared: true,
    });
  };

  const chainPopover = (
    <div style={{ minWidth: 280, maxWidth: 480 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 12 }}>{fieldLabel || fieldPath.join('.')} · 算法链</Text>
        {!readonly && (
          <Button size="small" type="primary" ghost icon={<EditOutlined />}
            onClick={() => setEditorOpen(true)}>
            编辑
          </Button>
        )}
      </Flex>
      {bound?.jsonSubPath && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
          JSON 子键：{bound.jsonSubPath}
        </Text>
      )}
      {bound?.valueSources && bound.valueSources.length > 0 && (
        <Flex wrap gap={4} style={{ marginBottom: 6 }}>
          <Tag color="cyan" style={{ margin: 0 }}>值来源 ×{bound.valueSources.length}</Tag>
          {bound.valueSources.map((s) => (
            <Tag key={s.label} style={{ margin: 0 }}>{s.label}:{s.from}</Tag>
          ))}
        </Flex>
      )}
      {chainItems.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>（无链）</Text>
      ) : (
        <Flex vertical gap={4}>
          {chainItems.map((c, i) => (
            <Flex key={`${c.key}-${i}`} align="center" gap={6}>
              <Tag color="blue" style={{ margin: 0, minWidth: 22, textAlign: 'center' }}>{i + 1}</Tag>
              <Text style={{ flex: 1, fontSize: 12 }}>{c.label}</Text>
              {c.group === 'custom' && <Tag color="purple" style={{ margin: 0 }}>自定义</Tag>}
              {c.group === 'external' && <Tag color="geekblue" style={{ margin: 0 }}>脚本</Tag>}
              {c.group === 'lib' && <Tag color="cyan" style={{ margin: 0 }}>本地库</Tag>}
            </Flex>
          ))}
        </Flex>
      )}
      {!readonly && chainItems.length > 0 && <Divider style={{ margin: '8px 0' }} />}
      {!readonly && chainItems.length > 0 && (
        <Flex justify="flex-end" gap={6}>
          <Popconfirm title="删除此字段的全部算法链？" onConfirm={handleRemoveBinding}>
            <Button size="small" danger icon={<DeleteOutlined />}>删除全部</Button>
          </Popconfirm>
        </Flex>
      )}
    </div>
  );

  return (
    <Flex vertical style={{ width: '100%' }}>
      <Flex align="flex-start" gap={4}>
        <Text style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }}>{value}</Text>
        {!readonly && (
          <ParserButton value={String(value ?? '')} fieldPath={fieldPath} fieldLabel={fieldLabel}
            onParseResult={onParseResult} projectId={projectId}
            initialChain={bound?.chain || []}
            initialSources={bound?.valueSources || []}
            initialJoin={{ joinMode: bound?.joinMode, template: bound?.template }}
            initialJsonSubPath={bound?.jsonSubPath || ''} />
        )}
      </Flex>
      {bound && (chainItems.length > 0 || bound.valueSources?.length > 0 || bound.jsonSubPath) && (
        <Flex align="center" gap={4} wrap style={{ marginTop: 4 }}>
          <Popover content={chainPopover} trigger="click" placement="bottomLeft"
            title={<Text style={{ fontSize: 12 }}>字段配置详情</Text>}>
            <Tag color="purple" style={{ margin: 0, cursor: 'pointer' }}>
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              已配置{chainItems.length > 0 ? ` · 链×${chainItems.length}` : ''}
              {bound.valueSources?.length > 0 ? ` · 来源×${bound.valueSources.length}` : ''}
            </Tag>
          </Popover>
          {chainItems.slice(0, 3).map((c, i) => (
            <Tag key={`${c.key}-${i}`} style={{ margin: 0 }}>{i + 1}. {c.label}</Tag>
          ))}
          {chainItems.length > 3 && <Tag style={{ margin: 0 }}>+{chainItems.length - 3}</Tag>}
        </Flex>
      )}
      {!readonly && (
        <ParserModal open={editorOpen} onClose={() => setEditorOpen(false)}
          value={String(value ?? '')} fieldPath={fieldPath} fieldLabel={fieldLabel}
          onParseResult={onParseResult} projectId={projectId}
          initialChain={bound?.chain || []}
          initialSources={bound?.valueSources || []}
          initialJoin={{ joinMode: bound?.joinMode, template: bound?.template }}
          initialJsonSubPath={bound?.jsonSubPath || ''} />
      )}
    </Flex>
  );
}

function HeaderTable({ headers, emptyText = '无', scope, onParseResult, readonly, projectId, assignments }) {
  const dataSource = useMemo(
    () => (headers || []).map((h, i) => ({ ...h, key: `${h.name}-${i}`, _index: i })),
    [headers]
  );
  if (!dataSource.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return (
    <Table size="small" pagination={false} dataSource={dataSource}
      columns={[
        { title: '名称', dataIndex: 'name', width: '30%', render: (v) => <Text strong>{v}</Text> },
        {
          title: '值', dataIndex: 'value',
          render: (v, rec) => (
            <FieldWithParser value={v} fieldPath={[...scope, rec._index, 'value']}
              fieldLabel={rec.name} onParseResult={onParseResult}
              readonly={readonly} projectId={projectId} assignments={assignments} />
          ),
        },
      ]} />
  );
}

function General({ entry, onParseResult, readonly, projectId, assignments }) {
  const req = entry.request || {};
  const res = entry.response || {};
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="请求地址">
        <FieldWithParser value={req.url} fieldPath={['request', 'url']} fieldLabel="URL"
          onParseResult={onParseResult} readonly={readonly} projectId={projectId}
          assignments={assignments} />
      </Descriptions.Item>
      <Descriptions.Item label="请求方法">{req.method}</Descriptions.Item>
      <Descriptions.Item label="状态码">
        <Tag color={statusColor(res.status)}>{res.status} {res.statusText || ''}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="HTTP 版本">{req.httpVersion || '-'}</Descriptions.Item>
      <Descriptions.Item label="MIME">{res.content?.mimeType || '-'}</Descriptions.Item>
      <Descriptions.Item label="服务器 IP">{res._serverIPAddress || entry.serverIPAddress || '-'}</Descriptions.Item>
      <Descriptions.Item label="响应大小">{formatBytes(res.content?.size ?? res.bodySize)}</Descriptions.Item>
      <Descriptions.Item label="总耗时">{formatTime(entry.time)}</Descriptions.Item>
      <Descriptions.Item label="开始时间">{formatStarted(entry.startedDateTime)}</Descriptions.Item>
    </Descriptions>
  );
}

function RawBlockWithParser({ title, value, fieldPath, fieldLabel, onParseResult, readonly, projectId, assignments }) {
  if (!value) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`无${title}`} />;
  return (
    <Flex vertical style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
      </Flex>
      <FieldWithParser value={value} fieldPath={fieldPath} fieldLabel={fieldLabel}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId}
        assignments={assignments} />
    </Flex>
  );
}

function RequestPayload({ postData, onParseResult, readonly, projectId, assignments }) {
  if (!postData) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无请求体" />;
  const { mimeType = '', text = '', params } = postData;
  const isForm = mimeType.includes('x-www-form-urlencoded') && Array.isArray(params);
  return (
    <Flex vertical gap={12} style={{ width: '100%' }}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Content-Type">{mimeType || '-'}</Descriptions.Item>
      </Descriptions>
      {isForm ? (
        <HeaderTable headers={params.map((p) => ({ name: p.name, value: p.value }))}
          scope={['request', 'postData', 'params']} onParseResult={onParseResult}
          readonly={readonly} projectId={projectId} assignments={assignments} />
      ) : (
        <RawBlockWithParser title="请求体原始文本" value={text}
          fieldPath={['request', 'postData', 'text']} fieldLabel="请求体"
          onParseResult={onParseResult} readonly={readonly} projectId={projectId}
          assignments={assignments} />
      )}
    </Flex>
  );
}

function ResponseBody({ content, onParseResult, readonly, projectId, assignments }) {
  const decoded = decodeContent(content);
  if (!content || !content.text) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无响应体" />;
  if (decoded.isImage) {
    return (
      <div style={{ textAlign: 'center' }}>
        <img src={decoded.text} alt="response" style={{ maxWidth: '100%', maxHeight: '58vh', objectFit: 'contain' }} />
      </div>
    );
  }
  return (
    <RawBlockWithParser title="响应体原始文本" value={decoded.text}
      fieldPath={['response', 'content', 'text']} fieldLabel="响应体"
      onParseResult={onParseResult} readonly={readonly} projectId={projectId}
      assignments={assignments} />
  );
}

function Timings({ entry }) {
  const t = entry.timings || {};
  const rows = [
    ['阻塞 Blocked', t.blocked], ['DNS', t.dns], ['连接 Connect', t.connect],
    ['SSL', t.ssl], ['发送 Send', t.send], ['等待 TTFB', t.wait], ['接收 Receive', t.receive],
  ].filter(([, v]) => typeof v === 'number' && v >= 0);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无耗时信息" />;
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="总计">{formatTime(entry.time)}</Descriptions.Item>
      {rows.map(([k, v]) => <Descriptions.Item key={k} label={k}>{`${v} ms`}</Descriptions.Item>)}
    </Descriptions>
  );
}

export default function RequestDetail({
  entry, open, onClose, inline = false, onParseResult,
  readonly = false, hideHeader = false, tabsKey, projectId,
  activeKey, onTabChange,
}) {
  const { message } = App.useApp();
  if (!entry) return null;
  const req = entry.request || {};
  const res = entry.response || {};
  const assignments = entry._parseAssignments || [];

  const items = [
    { key: 'general', label: '概览',
      children: <General entry={entry} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} assignments={assignments} /> },
    { key: 'query', label: 'Query',
      children: <HeaderTable headers={req.queryString} emptyText="无 Query 参数"
        scope={['request', 'queryString']} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} assignments={assignments} /> },
    { key: 'reqHeaders', label: '请求头',
      children: <HeaderTable headers={req.headers} scope={['request', 'headers']}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId}
        assignments={assignments} /> },
    { key: 'payload', label: '请求体',
      children: <RequestPayload postData={req.postData} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} assignments={assignments} /> },
    { key: 'resHeaders', label: '响应头',
      children: <HeaderTable headers={res.headers} scope={['response', 'headers']}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId}
        assignments={assignments} /> },
    { key: 'resBody', label: '响应体',
      children: <ResponseBody content={res.content} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} assignments={assignments} /> },
    {
      key: 'cookies', label: 'Cookies',
      children: (
        <Flex vertical gap={12} style={{ width: '100%' }}>
          <Text strong>请求 Cookies</Text>
          <HeaderTable headers={req.cookies} scope={['request', 'cookies']}
            onParseResult={onParseResult} readonly={readonly} projectId={projectId}
            assignments={assignments} />
          <Text strong>响应 Cookies</Text>
          <HeaderTable headers={res.cookies} scope={['response', 'cookies']}
            onParseResult={onParseResult} readonly={readonly} projectId={projectId}
            assignments={assignments} />
        </Flex>
      ),
    },
    { key: 'timings', label: '耗时', children: <Timings entry={entry} /> },
  ];

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(req.url); message.success('已复制 URL'); }
    catch { message.warning('当前环境不支持剪贴板'); }
  };

  const tabsProps = { items };
  if (activeKey !== undefined) tabsProps.activeKey = activeKey;
  if (onTabChange) tabsProps.onChange = onTabChange;

  const content = (
    <Tabs
      key={activeKey === undefined ? (tabsKey || entry._uid || entry.startedDateTime) : undefined}
      {...tabsProps}
    />
  );

  if (inline) {
    return (
      <Flex vertical style={{ height: '100%', background: '#fff' }}>
        {!hideHeader && (
          <Flex align="center" gap={8}
            style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <Tag style={{ margin: 0 }}>{req.method}</Tag>
            <Tag color={statusColor(res.status)} style={{ margin: 0 }}>{res.status}</Tag>
            <Text ellipsis style={{ flex: 1, minWidth: 0 }}>{req.url}</Text>
            <Button size="small" icon={<CopyOutlined />} onClick={copyUrl}>复制</Button>
          </Flex>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 16px' }}>{content}</div>
      </Flex>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} width={760} destroyOnHidden
      title={
        <Space size={8}>
          <Tag>{req.method}</Tag>
          <Tag color={statusColor(res.status)}>{res.status}</Tag>
          <Text ellipsis style={{ maxWidth: 480 }}>{req.url}</Text>
          <Button size="small" icon={<CopyOutlined />} onClick={copyUrl}>复制</Button>
        </Space>
      }
      styles={{ body: { paddingTop: 8 } }}>
      {content}
    </Drawer>
  );
}