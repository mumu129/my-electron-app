import React, { useMemo, useState } from 'react';
import {
  Flex, Typography, Button, Tag, Empty, App as AntApp, Alert,
} from 'antd';
import {
  CloseOutlined, CopyOutlined, ThunderboltOutlined, SendOutlined, UpOutlined, DownOutlined,
} from '@ant-design/icons';
import RequestDetail from './RequestDetail';
import { formatBytes, statusColor } from '../utils/har';

const { Text } = Typography;

function cleanEntry(entry) {
  if (!entry) return null;
  const { _uid, tags, _addedAt, ...rest } = entry;
  return rest;
}

const BLACKLIST_HEADERS = new Set([
  'host', 'content-length', 'connection', 'accept-encoding', 'content-encoding',
  'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-connection',
  'referer', 'origin', 'cookie',
]);

async function doSend(entry) {
  const req = entry.request || {};
  const start = performance.now();

  const headers = {};
  (req.headers || []).forEach((h) => {
    if (!h?.name) return;
    if (h.name.startsWith(':')) return;
    if (BLACKLIST_HEADERS.has(h.name.toLowerCase())) return;
    headers[h.name] = h.value;
  });

  let body;
  const method = (req.method || 'GET').toUpperCase();
  const isBodyLess = method === 'GET' || method === 'HEAD';
  if (!isBodyLess) {
    if (req.postData?.text) body = req.postData.text;
    else if (Array.isArray(req.postData?.params)) {
      body = req.postData.params
        .map((p) => `${encodeURIComponent(p.name || '')}=${encodeURIComponent(p.value || '')}`)
        .join('&');
    }
  }

  const payload = { url: req.url, method, headers, body };

  // 优先走 Electron 主进程代理（避免 CORS），没接入时降级 fetch
  if (window.electronAPI?.httpRequest) {
    const result = await window.electronAPI.httpRequest(payload);
    const text = result.body || '';
    return {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers || [],
      body: text,
      time: Math.round(performance.now() - start),
      size: new Blob([text]).size,
    };
  }

  const res = await fetch(req.url, { method, headers, body });
  const text = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()].map(([k, v]) => ({ name: k, value: v })),
    body: text,
    time: Math.round(performance.now() - start),
    size: new Blob([text]).size,
  };
}

export default function ParsePreviewPanel({ parsed, onClose }) {
  const { message } = AntApp.useApp();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [sendExpanded, setSendExpanded] = useState(false);

  const jsonText = useMemo(() => {
    if (!parsed?.entry) return '';
    return JSON.stringify(cleanEntry(parsed.entry), null, 2);
  }, [parsed]);

  if (!parsed) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%', background: '#fafafa' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary" style={{ fontSize: 12 }}>
              点击任一字段右侧 <ThunderboltOutlined style={{ color: '#1677ff' }} /> 选择解析算法，此处将展示解析后的完整请求
            </Text>
          }
        />
      </Flex>
    );
  }

  const entry = parsed.entry;
  const req = entry.request || {};

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      message.success('已复制解析后的完整请求');
    } catch { message.warning('复制失败'); }
  };

  const handleSend = async () => {
    setSending(true);
    setSendExpanded(true);
    setSendResult(null);
    try {
      const r = await doSend(entry);
      setSendResult(r);
    } catch (e) {
      setSendResult({ error: String(e?.message || e) });
    } finally {
      setSending(false);
    }
  };

  const tabsKey = `${entry._uid || entry.startedDateTime}-${parsed.chain?.map((c) => c.key).join('>')}`;

  return (
    <Flex vertical style={{ height: '100%', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
      {/* 顶部：链路信息 + 复制 / 关闭 */}
      <Flex align="center" gap={6} wrap
        style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <ThunderboltOutlined style={{ color: '#1677ff' }} />
        <Text strong>解析预览</Text>
        {(parsed.chain || []).map((c, i) => (
          <Tag key={`${c.key}-${i}`} color="blue" style={{ margin: 0 }}>
            {i + 1}. {c.label}
          </Tag>
        ))}
        {parsed.fieldLabel && <Tag>字段：{parsed.fieldLabel}</Tag>}
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<CopyOutlined />} onClick={copy}>复制完整请求</Button>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </Flex>

      {/* 中部：与上方请求详情一致的 Tabs 展示（只读） */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <RequestDetail
          entry={entry}
          inline
          readonly
          hideHeader
          tabsKey={tabsKey}
        />
      </div>

      {/* 底部：发送已解析请求 */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Flex align="center" gap={8} style={{ padding: '8px 12px' }}>
          <Tag style={{ margin: 0 }}>{req.method}</Tag>
          <Text ellipsis style={{ flex: 1, minWidth: 0, fontSize: 12 }} title={req.url}>
            {req.url}
          </Text>
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