import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer, Tabs, Descriptions, Table, Typography, Empty, Tag, Space, Button, App,
  Flex, Modal, Divider, Popconfirm, Input,
} from 'antd';
import {
  CopyOutlined, ThunderboltOutlined, PlusOutlined, ArrowUpOutlined,
  ArrowDownOutlined, CloseOutlined, DeleteOutlined, InfoCircleOutlined,
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
function ParserModal({
  open, onClose, value, fieldPath, fieldLabel, onParseResult, projectId,
  initialChain = [],
}) {
  const { getEffectiveConfigMap, getCustomAlgorithms } = useAlgorithms();
  const { scripts } = useScripts();
  const { message } = App.useApp();
  const [chain, setChain] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const configMap = useMemo(() => getEffectiveConfigMap(projectId), [getEffectiveConfigMap, projectId]);
  const customTemplates = useMemo(() => ({
    ...buildCustomTemplates(getCustomAlgorithms(projectId)),
    ...buildScriptTemplates(scripts),
  }), [getCustomAlgorithms, projectId, scripts]);
  const allTemplates = useMemo(
    () => ({ ...PARSER_TEMPLATES, ...customTemplates }),
    [customTemplates]
  );

  // initialChain 用 ref，避免父组件 rerender 触发 useEffect 重置用户编辑
  const initialChainRef = useRef(initialChain);
  useEffect(() => {
    initialChainRef.current = initialChain;
  }, [initialChain]);

  // 只在弹窗打开时把已绑定的链加载进来
  useEffect(() => {
    if (!open) return;
    const src = initialChainRef.current || [];
    console.log('[ParserModal] 打开，加载已绑定 chain:', src);
    const normalized = src.map((item) => {
      if (typeof item === 'string') {
        return { key: item, config: makeDefaultConfig(allTemplates[item]) };
      }
      return {
        key: item.key,
        config: item.config ?? makeDefaultConfig(allTemplates[item.key]),
      };
    });
    setChain(normalized);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const m = {};
    Object.entries(allTemplates).forEach(([k, tpl]) => {
      (m[tpl.group] ||= []).push([k, tpl]);
    });
    return m;
  }, [allTemplates]);

  const add = (k) => {
    const tpl = allTemplates[k];
    setChain((prev) => [...prev, { key: k, config: makeDefaultConfig(tpl) }]);
    setResult(null);
  };
  const remove = (i) => { setChain((prev) => prev.filter((_, idx) => idx !== i)); setResult(null); };
  const clearAll = () => { setChain([]); setResult(null); };
  const move = (i, dir) => {
    setChain((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setResult(null);
  };
  const updateItemConfig = (i, patch) => {
    setChain((prev) => prev.map((item, idx) =>
      idx === i ? { ...item, config: { ...(item.config || {}), ...patch } } : item
    ));
    setResult(null);
  };

  const run = async () => {
    // 空链 = 解绑
    if (!chain.length) {
      if (onParseResult) {
        onParseResult({
          fieldPath, fieldLabel, chain: [], steps: [],
          originalValue: value, parsedValue: value, cleared: true,
        });
      }
      onClose();
      return;
    }
    setRunning(true);
    try {
      const { finalValue, steps } = await runParserChain(
        chain, String(value), configMap, { steps: [] }, customTemplates
      );
      setResult({ finalValue, steps });
      if (onParseResult) {
        onParseResult({
          fieldPath, fieldLabel,
          chain: chain.map((item) => ({
            key: item.key,
            label: allTemplates[item.key]?.label || item.key,
            ...(item.config ? { config: item.config } : {}),
          })),
          steps, originalValue: value, parsedValue: finalValue,
        });
      }
      // ⬇ 应用后自动关闭
      onClose();
    } catch (e) {
      message.error(String(e.message || e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} width={1000} footer={null}
      title={`解析 · ${fieldLabel || fieldPath.join('.')}`} destroyOnHidden>
      <Flex gap={16} style={{ minHeight: 300 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>原始值</Text>
          <PreBlock maxHeight="32vh">{value}</PreBlock>
        </div>

        <div style={{ flex: 1.2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Flex justify="space-between" align="center">
            <Text type="secondary" style={{ fontSize: 12 }}>算法链</Text>
            {chain.length > 0 && (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={clearAll}>清空链</Button>
            )}
          </Flex>

          <div style={{
            minHeight: 120, maxHeight: '34vh', overflow: 'auto', padding: 8, background: '#fafafa',
            border: '1px dashed #d9d9d9', borderRadius: 6,
          }}>
            {chain.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>（空链：应用后解绑此字段）</Text>
            ) : (
              <Flex vertical gap={8}>
                {chain.map((item, i) => {
                  const tpl = allTemplates[item.key];
                  const filled = configIsFilled(tpl, item.config);
                  return (
                    <div key={`${item.key}-${i}`} style={{ background: '#fff', borderRadius: 6, padding: 8 }}>
                      <Flex align="center" gap={6}>
                        <Tag color="blue" style={{ margin: 0, minWidth: 24, textAlign: 'center' }}>{i + 1}</Tag>
                        <Text style={{ flex: 1, fontSize: 12 }} strong>{tpl?.label || item.key}</Text>
                        {tpl?.group === 'custom' && <Tag color="purple" style={{ margin: 0 }}>自定义</Tag>}
                        {tpl?.group === 'external' && <Tag color="geekblue" style={{ margin: 0 }}>脚本</Tag>}
                        {!filled && <Tag color="warning" style={{ margin: 0 }}>未配置</Tag>}
                        <Button size="small" type="text" icon={<ArrowUpOutlined />}
                          disabled={i === 0} onClick={() => move(i, -1)} />
                        <Button size="small" type="text" icon={<ArrowDownOutlined />}
                          disabled={i === chain.length - 1} onClick={() => move(i, 1)} />
                        <Button size="small" type="text" danger icon={<CloseOutlined />}
                          onClick={() => remove(i)} />
                      </Flex>

                      {tpl?.configFields && tpl.configFields.length > 0 && (
                        <Flex vertical gap={6} style={{ marginTop: 6, marginLeft: 28 }}>
                          {tpl.configFields.map((f) => (
                            <div key={f.name}>
                              <Flex align="center" gap={4} style={{ marginBottom: 2 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>{f.label}</Text>
                                {f.helpText && (
                                  <Tag color="default" style={{ margin: 0, fontSize: 10, cursor: 'help' }}
                                    title={f.helpText}>
                                    <InfoCircleOutlined /> 变量说明
                                  </Tag>
                                )}
                              </Flex>
                              {f.multiline ? (
                                <TextArea size="small" rows={6}
                                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                                  placeholder={f.placeholder || f.label}
                                  value={item.config?.[f.name] || ''}
                                  onChange={(e) => updateItemConfig(i, { [f.name]: e.target.value })} />
                              ) : (
                                <Input size="small"
                                  placeholder={f.placeholder || f.label}
                                  value={item.config?.[f.name] || ''}
                                  onChange={(e) => updateItemConfig(i, { [f.name]: e.target.value })} />
                              )}
                            </div>
                          ))}
                        </Flex>
                      )}
                    </div>
                  );
                })}
              </Flex>
            )}
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {Object.entries(PARSER_GROUPS).map(([g, label]) => {
              const list = grouped[g] || [];
              if (list.length === 0) return null;
              return (
                <div key={g} style={{ marginBottom: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                  <Flex wrap gap={4} style={{ marginTop: 4 }}>
                    {list.map(([k, tpl]) => (
                      <Tag key={k}
                        color={
                          tpl.group === 'external' ? 'geekblue'
                            : (Array.isArray(tpl.configFields) && tpl.configFields.length > 0 && !configMap[k] ? 'warning' : 'default')
                        }
                        style={{ cursor: 'pointer', margin: 0 }}
                        onClick={() => add(k)}>
                        <PlusOutlined style={{ marginRight: 4 }} />
                        {tpl.label}
                      </Tag>
                    ))}
                  </Flex>
                </div>
              );
            })}
          </div>
        </div>
      </Flex>

      <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" loading={running} onClick={run}>
          {chain.length === 0 ? '解绑此字段' : '应用解析'}
        </Button>
      </Flex>
    </Modal>
  );
}

function ParserButton({ value, fieldPath, fieldLabel, onParseResult, projectId, initialChain }) {
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
        initialChain={initialChain} />
    </>
  );
}

/* ============ 字段行 ============ */
function FieldWithParser({ value, fieldPath, fieldLabel, onParseResult, readonly, projectId, assignments }) {
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

  const chainLabels = useMemo(() => {
    if (!bound?.chain) return [];
    return bound.chain.map((item) => {
      const key = typeof item === 'string' ? item : item.key;
      return allTemplates[key]?.label || key;
    });
  }, [bound, allTemplates]);

  const handleRemoveBinding = () => {
    if (!onParseResult) return;
    onParseResult({
      fieldPath, fieldLabel, chain: [], steps: [],
      originalValue: value, parsedValue: value, cleared: true,
    });
  };

  return (
    <Flex vertical style={{ width: '100%' }}>
      <Flex align="flex-start" gap={4}>
        <Text style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }}>{value}</Text>
        {!readonly && (
          <ParserButton value={String(value ?? '')} fieldPath={fieldPath} fieldLabel={fieldLabel}
            onParseResult={onParseResult} projectId={projectId}
            initialChain={bound?.chain || []} />
        )}
      </Flex>
      {bound && chainLabels.length > 0 && (
        <Flex align="center" gap={4} wrap style={{ marginTop: 4 }}>
          <Tag color="purple" style={{ margin: 0 }}>算法链</Tag>
          {chainLabels.map((l, i) => (
            <Tag key={i} style={{ margin: 0 }}>{i + 1}. {l}</Tag>
          ))}
          {!readonly && (
            <Popconfirm title="清除此字段的算法链绑定？" onConfirm={handleRemoveBinding}>
              <Button size="small" type="text" danger icon={<CloseOutlined />} />
            </Popconfirm>
          )}
        </Flex>
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