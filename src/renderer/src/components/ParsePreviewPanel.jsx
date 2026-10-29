import React, { useMemo, useState } from 'react';
import {
  Flex, Typography, Button, Tag, Empty, App as AntApp, Alert,
} from 'antd';
import {
  CloseOutlined, CopyOutlined, ThunderboltOutlined, SendOutlined,
  UpOutlined, DownOutlined,
} from '@ant-design/icons';
import RequestDetail from './RequestDetail';
import { formatBytes, statusColor } from '../utils/har';
import { buildHeadersFromEntry, buildBodyFromEntry } from '../utils/httpShared';

const { Text } = Typography;

function cleanEntry(entry) {
  if (!entry) return null;
  const { _uid, tags, _addedAt, _initialRequest, _initialResponse, _parseAssignments, ...rest } = entry;
  return rest;
}

async function doSend(entry) {
  const req = entry?.request || {};
  const method = (req.method || 'GET').toUpperCase();
  const headers = buildHeadersFromEntry(req);
  const body = buildBodyFromEntry(req, method);
  const payload = { url: req.url, method, headers, body };
  const started = performance.now();

  if (window.electronAPI?.httpRequest) {
    const r = await window.electronAPI.httpRequest(payload);
    return {
      status: r.status, statusText: r.statusText, headers: r.headers || [],
      body: r.body || '', time: r.time || Math.round(performance.now() - started),
      size: new Blob([r.body || '']).size,
    };
  }
  const res = await fetch(req.url, { method, headers, body });
  const text = await res.text();
  return {
    status: res.status, statusText: res.statusText,
    headers: [...res.headers.entries()].map(([k, v]) => ({ name: k, value: v })),
    body: text, time: Math.round(performance.now() - started),
    size: new Blob([text]).size,
  };
}

export default function ParsePreviewPanel({
  parsed, onClose, projectId,
  activeKey, onTabChange,
}) {
  const { message } = AntApp.useApp();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendExpanded, setSendExpanded] = useState(false);

  // ⬇ 关键防御：entry 缺失直接当空状态
  const entry = parsed?.entry;
  const hasEntry = !!(entry && entry.request);

  const jsonText = useMemo(() => {
    if (!hasEntry) return '';
    return JSON.stringify(cleanEntry(entry), null, 2);
  }, [entry, hasEntry]);

  // 空状态（包括 parsed 有值但 entry 缺失的情况）
  if (!parsed || !hasEntry) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%', background: '#fafafa' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary" style={{ fontSize: 12 }}>
              点击任一字段右侧 <ThunderboltOutlined style={{ color: '#1677ff' }} /> 选择解析算法
            </Text>
          } />
      </Flex>
    );
  }

  const req = entry.request;

  const copy = async () => {
    try { await navigator.clipboard.writeText(jsonText); message.success('已复制'); }
    catch { message.warning('复制失败'); }
  };

  const handleSend = async () => {
    setSending(true); setSendExpanded(true); setSendResult(null);
    try { setSendResult(await doSend(entry)); }
    catch (e) { setSendResult({ error: String(e?.message || e) }); }
    finally { setSending(false); }
  };

  const tabsKey = `${entry._uid || entry.startedDateTime || 'preview'}-${(parsed.chain || [])
    .map((c) => (typeof c === 'string' ? c : c.key)).join('>')}`;

  return (
    <Flex vertical style={{ height: '100%', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
      <Flex align="center" gap={6} wrap
        style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <ThunderboltOutlined style={{ color: '#1677ff' }} />
        <Text strong>解析预览</Text>
        {(parsed.chain || []).map((c, i) => {
          const label = typeof c === 'string' ? c : (c.label || c.key);
          return <Tag key={i} color="blue" style={{ margin: 0 }}>{i + 1}. {label}</Tag>;
        })}
        {parsed.fieldLabel && <Tag>字段：{parsed.fieldLabel}</Tag>}
        {parsed.autoLoaded && <Tag color="geekblue">来自已绑定算法</Tag>}
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<CopyOutlined />} onClick={copy}>复制</Button>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </Flex>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <RequestDetail
          entry={entry}
          inline
          readonly
          hideHeader
          tabsKey={tabsKey}
          projectId={projectId}
          activeKey={activeKey}
          onTabChange={onTabChange}
        />
      </div>

      <div style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Flex align="center" gap={8} style={{ padding: '8px 12px' }}>
          <Tag style={{ margin: 0 }}>{req.method}</Tag>
          <Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 12 }} title={req.url}>{req.url}</Text>
          <Button size="small"
            icon={sendExpanded ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setSendExpanded((v) => !v)}>
            {sendExpanded ? '收起结果' : '展开结果'}
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSend}>
            发送此请求
          </Button>
        </Flex>
        {sendExpanded && (
          <div style={{ maxHeight: 220, overflow: 'auto', padding: '0 12px 10px' }}>
            {!sendResult && !sending && (
              <Text type="secondary" style={{ fontSize: 12 }}>点击「发送此请求」后展示响应</Text>
            )}
            {sendResult?.error && (
              <Alert type="error" message="发送失败" description={sendResult.error} showIcon />
            )}
            {sendResult && !sendResult.error && (
              <Flex vertical gap={6}>
                <Flex align="center" gap={8} wrap>
                  <Tag color={statusColor(sendResult.status)} style={{ margin: 0 }}>
                    {sendResult.status} {sendResult.statusText}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>耗时 {sendResult.time} ms</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>大小 {formatBytes(sendResult.size)}</Text>
                </Flex>
                <pre style={{
                  margin: 0, padding: 8, fontSize: 11, lineHeight: 1.5,
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 4,
                  maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>{sendResult.body || '（空响应体）'}</pre>
              </Flex>
            )}
          </div>
        )}
      </div>
    </Flex>
  );
}