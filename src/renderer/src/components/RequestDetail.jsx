// src/renderer/src/components/RequestDetail.jsx
import React, { useState } from 'react';
import { Flex, Typography, Tag, Button, Empty, Space, App, Segmented } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useReplay } from '../App';
import HackvertorEditor from './HackvertorEditor';

const { Text } = Typography;

export default function RequestDetail({ entry, onUpdateRequest }) {
  const { message } = App.useApp();
  const { sendToReplay } = useReplay();
  const [activeTab, setActiveTab] = useState('request');

  if (!entry) return <Flex justify="center" align="center" style={{ height: '100%' }}><Empty description="未选择请求" /></Flex>;

  const req = entry.request || {};
  const res = entry.response || {};

  const getRawRequest = () => {
    let s = `${req.method} ${req.url} HTTP/1.1\n`;
    (req.headers || []).forEach(h => { if (h.name) s += `${h.name}: ${h.value}\n`; });
    s += '\n';
    if (req.postData?.text) s += req.postData.text;
    return s;
  };

  const getRawResponse = () => {
    let s = `HTTP/1.1 ${res.status} ${res.statusText}\n`;
    (res.headers || []).forEach(h => { if (h.name) s += `${h.name}: ${h.value}\n`; });
    s += '\n';
    if (res.content?.text) s += res.content.text;
    return s;
  };

  const rawReq = getRawRequest();
  const rawRes = getRawResponse();

  const handleSendToReplay = () => {
    sendToReplay({
      method: req.method || 'GET',
      url: req.url || '',
      rawText: rawReq
    });
    message.success('已推送至重发台');
  };

  const handleSaveRequest = (newText) => {
    if (onUpdateRequest) {
      onUpdateRequest(entry._uid, [{ fieldPath: 'request.postData.text', value: newText }]);
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
            <HackvertorEditor value={rawReq} onChange={handleSaveRequest} readOnly={false} />
          ) : (
            <HackvertorEditor value={rawRes} readOnly={true} />
          )}
        </div>
      </div>
    </Flex>
  );
}