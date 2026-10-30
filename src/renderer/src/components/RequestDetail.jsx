// src/renderer/src/components/RequestDetail.jsx
import React, { useState } from 'react';
import { Flex, Typography, Tag, Button, Empty, Space, App, Segmented } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useReplay } from '../store/replayStore';
import HackvertorEditor from './HackvertorEditor';

const { Text } = Typography;

export default function RequestDetail({ entry, onUpdateRequest }) {
  const { message } = App.useApp();
  const { sendToReplay } = useReplay();
  const [activeTab, setActiveTab] = useState('request');

  const req = entry?.request || {};
  const res = entry?.response || {};

  // 生成原始请求报文
  const getRawRequest = () => {
    if (!entry) return '';
    let s = `${req.method || 'GET'} ${req.url || ''} HTTP/1.1\n`;
    const seenHeaders = new Set();
    const uniqueHeaders = [];
    const headersArr = req.headers || [];
    for (let i = headersArr.length - 1; i >= 0; i--) {
      const h = headersArr[i];
      if (h && h.name && !seenHeaders.has(h.name.toLowerCase())) {
        seenHeaders.add(h.name.toLowerCase());
        uniqueHeaders.unshift(h);
      }
    }
    uniqueHeaders.forEach(h => { s += `${h.name}: ${h.value}\n`; });
    s += '\n';
    
    let body = req.postData?.text || '';
    if (body.match(/^[A-Z]+\s+.*?\s+HTTP\/1\.1/)) {
      const firstLineEnd = body.indexOf('\n\n');
      if (firstLineEnd > -1) body = body.slice(firstLineEnd + 2);
    }
    if (body) s += body;
    return s;
  };

  const [localRaw, setLocalRaw] = useState(getRawRequest);
  const [prevUid, setPrevUid] = useState(entry?._uid);

  // 核心修复：不再用 useEffect（它是异步的，会导致点击太快发送旧数据）。改用渲染期同步更新。
  if (entry?._uid !== prevUid) {
    setPrevUid(entry?._uid);
    setLocalRaw(getRawRequest());
  }

  if (!entry) {
    return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="未选择请求" /></Flex>;
  }

  let rawRes = `HTTP/1.1 ${res.status} ${res.statusText}\n`;
  (res.headers || []).forEach(h => { if (h.name) rawRes += `${h.name}: ${h.value}\n`; });
  rawRes += '\n';
  if (res.content?.text) rawRes += res.content.text;

  const parseRawRequest = (rawText) => {
    const lines = rawText.replace(/\r\n/g, '\n').split('\n');
    let method = 'GET', url = '', headers = [], body = '', idx = 0;
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine) {
        const parts = firstLine.split(/\s+/);
        if (parts.length >= 2) { method = parts[0]; url = parts[1]; }
        else if (parts.length === 1) { url = parts[0]; }
      }
      idx = 1;
    }
    for (; idx < lines.length; idx++) {
      const line = lines[idx];
      if (!line.trim()) { idx++; break; }
      const colon = line.indexOf(':');
      if (colon > 0) headers.push({ name: line.substring(0, colon).trim(), value: line.substring(colon + 1).trim() });
    }
    if (idx < lines.length) body = lines.slice(idx).join('\n');
    return { method, url, headers, body };
  };

  const handleSendToReplay = () => {
    sendToReplay({
      _id: Date.now().toString(), // 给个唯一 id 强制刷新
      method: req.method || 'GET',
      url: req.url || '',
      rawText: localRaw
    });
    message.success('已推送至重发台');
  };

  const handleSaveRequest = (newText) => {
    setLocalRaw(newText); 
    if (onUpdateRequest && entry) {
      const parsed = parseRawRequest(newText);
      onUpdateRequest(entry._uid, [
        { fieldPath: 'request.method', value: parsed.method },
        { fieldPath: 'request.url', value: parsed.url },
        { fieldPath: 'request.headers', value: parsed.headers },
        { fieldPath: 'request.postData.text', value: parsed.body }
      ]);
    }
  };

  return (
    <Flex vertical style={{ height: '100%', padding: '0 16px 16px 16px', background: '#f0f2f5' }}>
      <Flex align="center" justify="space-between" style={{ padding: '12px 0' }}>
        <Space size={12}>
          <Tag color="blue" style={{ margin: 0, fontSize: 14, padding: '2px 8px' }}>{req.method}</Tag>
          <Tag color={res.status >= 400 ? 'error' : 'success'} style={{ margin: 0, fontSize: 14, padding: '2px 8px' }}>{res.status}</Tag>
          <Text style={{ fontSize: 14, fontWeight: 500, maxWidth: 600 }} ellipsis>{req.url}</Text>
        </Space>
        <Button type="primary" size="middle" icon={<SendOutlined />} onClick={handleSendToReplay}>
          发送到重发台
        </Button>
      </Flex>

      <div style={{ flex: 1, minHeight: 0, background: '#fff', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Segmented
            options={[{ label: '请求包 (Request)', value: 'request' }, { label: '响应包 (Response)', value: 'response' }]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>
        
        <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
          {activeTab === 'request' ? (
            <HackvertorEditor value={localRaw} onChange={handleSaveRequest} readOnly={false} />
          ) : (
            <HackvertorEditor value={rawRes} readOnly={true} />
          )}
        </div>
      </div>
    </Flex>
  );
}