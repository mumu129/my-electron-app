import { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Tabs, Descriptions, Table, Typography, Empty, Tag, Space, Button, App,
  Flex, Modal, Divider,
} from 'antd';
import {
  CopyOutlined, ThunderboltOutlined, PlusOutlined, ArrowUpOutlined,
  ArrowDownOutlined, CloseOutlined,
} from '@ant-design/icons';
import {
  decodeContent, formatBytes, formatTime, formatStarted, statusColor,
} from '../utils/har';
import { PARSER_TEMPLATES, PARSER_GROUPS, runParserChain } from '../utils/parsers';
import { useAlgorithms } from '../store/algorithmStore';

const { Text } = Typography;

function PreBlock({ children, maxHeight = '58vh' }) {
  return (
    <pre style={{
      margin: 0, padding: 12, fontSize: 12, lineHeight: 1.6,
      background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6,
      maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }}>{children}</pre>
  );
}

function ParserModal({ open, onClose, value, fieldPath, fieldLabel, onParseResult, projectId }) {
  const { getEffectiveConfigMap } = useAlgorithms();
  const { message } = App.useApp();
  const [chain, setChain] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const configMap = useMemo(
    () => getEffectiveConfigMap(projectId),
    [getEffectiveConfigMap, projectId]
  );

  useEffect(() => {
    if (open) { setChain([]); setResult(null); }
  }, [open]);

  const grouped = useMemo(() => {
    const m = {};
    Object.entries(PARSER_TEMPLATES).forEach(([k, tpl]) => {
      (m[tpl.group] ||= []).push([k, tpl]);
    });
    return m;
  }, []);

  const add = (k) => { setChain((prev) => [...prev, k]); setResult(null); };
  const remove = (i) => { setChain((prev) => prev.filter((_, idx) => idx !== i)); setResult(null); };
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

  const run = async () => {
    if (!chain.length) { message.warning('请先选择至少一个算法'); return; }
    setRunning(true);
    try {
      const { finalValue, steps } = await runParserChain(chain, String(value), configMap);
      setResult({ finalValue, steps });
      if (onParseResult) {
        onParseResult({
          fieldPath,
          fieldLabel,
          chain: chain.map((k) => ({ key: k, label: PARSER_TEMPLATES[k]?.label || k })),
          steps,
          originalValue: value,
          parsedValue: finalValue,
        });
      }
    } catch (e) {
      message.error(String(e.message || e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={880}
      footer={null}
      title={`解析 · ${fieldLabel || fieldPath.join('.')}`}
      destroyOnHidden
    >
      <Flex gap={16} style={{ minHeight: 260 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>原始值</Text>
          <PreBlock maxHeight="26vh">{value}</PreBlock>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            解析链路（点击下方算法依次加入，用上下按钮调整顺序）
          </Text>
          <div style={{
            minHeight: 96, padding: 8, background: '#fafafa',
            border: '1px dashed #d9d9d9', borderRadius: 6,
          }}>
            {chain.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>（尚未选择算法）</Text>
            ) : (
              <Flex vertical gap={4}>
                {chain.map((k, i) => {
                  const tpl = PARSER_TEMPLATES[k];
                  return (
                    <Flex key={`${k}-${i}`} align="center" gap={6}>
                      <Tag color="blue" style={{ margin: 0, minWidth: 24, textAlign: 'center' }}>
                        {i + 1}
                      </Tag>
                      <Text style={{ flex: 1, fontSize: 12 }}>
                        {tpl?.label || k}
                        {tpl?.configFields && !configMap[k] && (
                          <Text type="warning" style={{ fontSize: 11, marginLeft: 6 }}>（未配置）</Text>
                        )}
                      </Text>
                      <Button size="small" type="text" icon={<ArrowUpOutlined />}
                        disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="small" type="text" icon={<ArrowDownOutlined />}
                        disabled={i === chain.length - 1} onClick={() => move(i, 1)} />
                      <Button size="small" type="text" danger icon={<CloseOutlined />}
                        onClick={() => remove(i)} />
                    </Flex>
                  );
                })}
              </Flex>
            )}
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {Object.entries(PARSER_GROUPS).map(([g, label]) => (
              <div key={g} style={{ marginBottom: 6 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                <Flex wrap gap={4} style={{ marginTop: 4 }}>
                  {(grouped[g] || []).map(([k, tpl]) => (
                    <Tag
                      key={k}
                      color={tpl.configFields && !configMap[k] ? 'warning' : 'default'}
                      style={{ cursor: 'pointer', margin: 0 }}
                      onClick={() => add(k)}
                    >
                      <PlusOutlined style={{ marginRight: 4 }} />
                      {tpl.label}
                    </Tag>
                  ))}
                </Flex>
              </div>
            ))}
          </div>
        </div>
      </Flex>

      {result && (
        <div style={{ marginTop: 16 }}>
          <Divider style={{ margin: '4px 0 8px' }}>
            <Text style={{ fontSize: 12 }}>执行结果</Text>
          </Divider>
          <Flex vertical gap={6}>
            {result.steps.map((s, i) => (
              <div key={i} style={{ background: '#fafafa', borderRadius: 4, padding: 8 }}>
                <Text strong style={{ fontSize: 12 }}>Step {i + 1} · {s.label}</Text>
                <PreBlock maxHeight="16vh">{s.output}</PreBlock>
              </div>
            ))}
          </Flex>
        </div>
      )}

      <Flex justify="flex-end" gap={8} style={{ marginTop: 16 }}>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" loading={running} onClick={run}>应用解析</Button>
      </Flex>
    </Modal>
  );
}

function ParserButton({ value, fieldPath, fieldLabel, onParseResult, projectId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small" type="text"
        icon={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
        title={`选择解析算法${fieldLabel ? `（${fieldLabel}）` : ''}`}
        onClick={() => setOpen(true)}
        style={{ flexShrink: 0 }}
      />
      <ParserModal
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        fieldPath={fieldPath}
        fieldLabel={fieldLabel}
        onParseResult={onParseResult}
        projectId={projectId}
      />
    </>
  );
}

function HeaderTable({ headers, emptyText = '无', scope, onParseResult, readonly, projectId }) {
  const dataSource = useMemo(
    () => (headers || []).map((h, i) => ({ ...h, key: `${h.name}-${i}`, _index: i })),
    [headers]
  );
  if (!dataSource.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }
  return (
    <Table
      size="small"
      pagination={false}
      dataSource={dataSource}
      columns={[
        { title: '名称', dataIndex: 'name', width: '30%', render: (v) => <Text strong>{v}</Text> },
        {
          title: '值',
          dataIndex: 'value',
          render: (v, rec) => (
            <Flex align="flex-start" gap={4}>
              <Text style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }}>{v}</Text>
              {!readonly && v && (
                <ParserButton
                  value={v}
                  fieldLabel={rec.name}
                  fieldPath={[...scope, rec._index, 'value']}
                  onParseResult={onParseResult}
                  projectId={projectId}
                />
              )}
            </Flex>
          ),
        },
      ]}
    />
  );
}

function General({ entry, onParseResult, readonly, projectId }) {
  const req = entry.request || {};
  const res = entry.response || {};
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label="请求地址">
        <Flex align="flex-start" gap={4}>
          <Text copyable style={{ wordBreak: 'break-all', flex: 1 }}>{req.url}</Text>
          {!readonly && req.url && (
            <ParserButton value={req.url} fieldLabel="URL"
              fieldPath={['request', 'url']} onParseResult={onParseResult}
              projectId={projectId} />
          )}
        </Flex>
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

function RawBlockWithParser({ title, value, fieldPath, fieldLabel, onParseResult, readonly, projectId }) {
  if (!value) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`无${title}`} />;
  return (
    <Flex vertical style={{ width: '100%' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
        {!readonly && (
          <ParserButton value={value} fieldLabel={fieldLabel}
            fieldPath={fieldPath} onParseResult={onParseResult} projectId={projectId} />
        )}
      </Flex>
      <PreBlock>{value}</PreBlock>
    </Flex>
  );
}

function RequestPayload({ postData, onParseResult, readonly, projectId }) {
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
          readonly={readonly} projectId={projectId} />
      ) : (
        <RawBlockWithParser
          title="请求体原始文本" value={text}
          fieldPath={['request', 'postData', 'text']} fieldLabel="请求体"
          onParseResult={onParseResult} readonly={readonly} projectId={projectId}
        />
      )}
    </Flex>
  );
}

function ResponseBody({ content, onParseResult, readonly, projectId }) {
  const decoded = decodeContent(content);
  if (!content || !content.text) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无响应体" />;
  }
  if (decoded.isImage) {
    return (
      <div style={{ textAlign: 'center' }}>
        <img src={decoded.text} alt="response"
          style={{ maxWidth: '100%', maxHeight: '58vh', objectFit: 'contain' }} />
      </div>
    );
  }
  return (
    <RawBlockWithParser
      title="响应体原始文本" value={decoded.text}
      fieldPath={['response', 'content', 'text']} fieldLabel="响应体"
      onParseResult={onParseResult} readonly={readonly} projectId={projectId}
    />
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
}) {
  const { message } = App.useApp();
  if (!entry) return null;
  const req = entry.request || {};
  const res = entry.response || {};

  const items = [
    { key: 'general', label: '概览',
      children: <General entry={entry} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} /> },
    { key: 'query', label: 'Query',
      children: <HeaderTable headers={req.queryString} emptyText="无 Query 参数"
        scope={['request', 'queryString']} onParseResult={onParseResult}
        readonly={readonly} projectId={projectId} /> },
    { key: 'reqHeaders', label: '请求头',
      children: <HeaderTable headers={req.headers} scope={['request', 'headers']}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId} /> },
    { key: 'payload', label: '请求体',
      children: <RequestPayload postData={req.postData}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId} /> },
    { key: 'resHeaders', label: '响应头',
      children: <HeaderTable headers={res.headers} scope={['response', 'headers']}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId} /> },
    { key: 'resBody', label: '响应体',
      children: <ResponseBody content={res.content}
        onParseResult={onParseResult} readonly={readonly} projectId={projectId} /> },
    {
      key: 'cookies', label: 'Cookies',
      children: (
        <Flex vertical gap={12} style={{ width: '100%' }}>
          <Text strong>请求 Cookies</Text>
          <HeaderTable headers={req.cookies} scope={['request', 'cookies']}
            onParseResult={onParseResult} readonly={readonly} projectId={projectId} />
          <Text strong>响应 Cookies</Text>
          <HeaderTable headers={res.cookies} scope={['response', 'cookies']}
            onParseResult={onParseResult} readonly={readonly} projectId={projectId} />
        </Flex>
      ),
    },
    { key: 'timings', label: '耗时', children: <Timings entry={entry} /> },
  ];

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(req.url);
      message.success('已复制 URL');
    } catch { message.warning('当前环境不支持剪贴板'); }
  };

  const content = <Tabs key={tabsKey || entry._uid || entry.startedDateTime} items={items} />;

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
      styles={{ body: { paddingTop: 8 } }}
    >
      {content}
    </Drawer>
  );
}