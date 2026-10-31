// src/renderer/src/pages/ReplayPage.jsx
import React, { useState, useEffect } from 'react';
import { Flex, Typography, Button, App, Space, Splitter, Spin, Empty, Tag } from 'antd';
import { SendOutlined, CodeOutlined } from '@ant-design/icons';
import HackvertorEditor from '../components/HackvertorEditor';
import { processTags } from '../utils/hackTags';

const { Text } = Typography;

export default function ReplayPage({ initialData }) {
  const { message } = App.useApp();

  const [rawText, setRawText] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    if (initialData) {
      setRawText(initialData.rawText || '');
      setResponse(null);
    }
  }, [initialData]);

  // 💡 核心：解析左侧完整报文，提取 Method、URL、Headers 和 Body
  const parseRawRequest = (text) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let method = 'GET', url = '', headers = {}, body = '', idx = 0;
    
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
      if (!line.trim()) { idx++; break; } // 遇到空行，Headers 结束
      const colon = line.indexOf(':');
      if (colon > 0) {
        const k = line.substring(0, colon).trim();
        const v = line.substring(colon + 1).trim();
        headers[k] = v;
      }
    }
    
    if (idx < lines.length) body = lines.slice(idx).join('\n');
    
    return { method, url, headers, body };
  };

  const handleSend = async () => {
    if (!rawText.trim()) return message.warning('请输入请求报文');
    
    // 1. 解析请求
    const parsed = parseRawRequest(rawText);
    if (!parsed.url) return message.error('无法解析出请求 URL，请检查第一行格式（如: GET https://... HTTP/1.1）');

    setSending(true);

    try {
      // 2. 处理标签
      let finalBody = parsed.body;
      if (finalBody) {
        finalBody = await processTags(finalBody);
      }

      // 3. 过滤掉不允许手动设置的 Headers
      const finalHeaders = {};
      for (const [k, v] of Object.entries(parsed.headers)) {
        if (!['host', 'content-length', 'connection'].includes(k.toLowerCase())) {
          finalHeaders[k] = v;
        }
      }

      // 4. 发送
      const r = await window.electronAPI?.httpRequest({
        url: parsed.url,
        method: parsed.method,
        headers: finalHeaders,
        body: finalBody || undefined,
      });

      if (!r) throw new Error('无返回结果');
      setResponse(r);
      message.success('发送成功');
    } catch (e) {
      message.error(`发送失败: ${e.message}`);
      setResponse({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Flex vertical style={{ height: '100%', background: '#f0f2f5' }}>
      {/* 顶部精简区 */}
      <Flex align="center" justify="space-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e8e8e8' }}>
        <Space size={12}>
          <Text strong style={{ fontSize: 16 }}>重发台 (Hackvertor)</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>（直接编辑下方完整 HTTP 报文并发送）</Text>
        </Space>
        <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSend}>
          发送请求
        </Button>
      </Flex>

      <Splitter style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize="50%" min="30%">
          <div style={{ height: '100%', padding: 12, background: '#fff' }}>
            <HackvertorEditor 
              value={rawText} 
              onChange={setRawText} 
              placeholder="在此输入完整的 HTTP 请求报文..." 
              minRows={10}
            />
          </div>
        </Splitter.Panel>

        <Splitter.Panel>
          <Flex vertical style={{ height: '100%', background: '#fff' }}>
            <Flex align="center" style={{ padding: '8px 12px', borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
              <CodeOutlined style={{ marginRight: 6 }} />
              <Text strong style={{ fontSize: 13 }}>响应结果</Text>
            </Flex>
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {sending ? (
                <Flex justify="center" align="center" style={{ height: '100%' }}><Spin tip="发送中..." /></Flex>
              ) : response ? (
                response.error ? (
                  <div style={{ color: '#cf1322', padding: 12, background: '#fff1f0', borderRadius: 6 }}>{response.error}</div>
                ) : (
                  <Flex vertical gap={16}>
                    <Flex gap={12}>
                      <Tag color={response.status >= 400 ? 'error' : 'success'}>{response.status} {response.statusText}</Tag>
                      <Text type="secondary">耗时 {response.time} ms</Text>
                    </Flex>
                    <pre style={{ margin: 0, padding: 12, background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {response.body || '（空）'}
                    </pre>
                  </Flex>
                )
              ) : (
                <Empty description="等待发送" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Flex>
        </Splitter.Panel>
      </Splitter>
    </Flex>
  );
}