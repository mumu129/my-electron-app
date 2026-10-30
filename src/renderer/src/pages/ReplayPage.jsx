import React, { useState, useEffect } from 'react';
import { Flex, Typography, Button, App, Input, Select, Space, Splitter, Spin, Empty, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import HackvertorEditor from '../components/HackvertorEditor';
import { processTags } from '../utils/hackTags';

const { Text } = Typography;

export default function ReplayPage({ initialData }) {
  const { message } = App.useApp();

  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    if (initialData) {
      setMethod(initialData.method || 'GET');
      setUrl(initialData.url || '');
      setRawText(initialData.rawText || '');
      setResponse(null);
    }
  }, [initialData]);

  const handleSend = async () => {
    if (!url) return message.warning('请输入请求 URL');
    setSending(true);

    try {
      // 核心：发送前调用 processTags 的 serialize 模式，将标签转为加密后的真实内容
      const finalBody = await processTags(rawText, 'serialize');

      const r = await window.electronAPI?.httpRequest({
        url, method,
        headers: { 'Content-Type': 'application/json' },
        body: (method !== 'GET' && method !== 'HEAD') ? finalBody : undefined,
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
      <Flex align="center" justify="space-between" style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e8e8e8' }}>
        <Space size={12}>
          <Text strong style={{ fontSize: 16 }}>重发台 (Hackvertor)</Text>
          <Select value={method} onChange={setMethod} style={{ width: 100 }} options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => ({ value: m, label: m }))} />
          <Input value={url} onChange={e => setUrl(e.target.value)} style={{ width: 500 }} placeholder="https://..." />
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
              placeholder="在此输入原始请求体..." 
              minRows={10}
            />
          </div>
        </Splitter.Panel>

        <Splitter.Panel>
          <Flex vertical style={{ height: '100%', background: '#fff' }}>
            <Flex align="center" style={{ padding: '8px 12px', borderBottom: '1px solid #e8e8e8', background: '#fafafa' }}>
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