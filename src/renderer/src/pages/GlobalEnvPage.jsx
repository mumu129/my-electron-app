// src/renderer/src/pages/GlobalEnvPage.jsx
import React, { useState } from 'react';
import { Flex, Typography, Button, Input, List, App as AntApp, Space, Card, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEnvs } from '../store/envStore';

const { Text } = Typography;

export default function GlobalEnvPage() {
  const { envs, setEnv, removeEnv } = useEnvs();
  const { message } = AntApp.useApp();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (!newKey.trim()) return message.warning('请输入变量名');
    setEnv(newKey.trim(), newValue);
    setNewKey('');
    setNewValue('');
    message.success('已添加环境变量');
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Card title={<Text strong>全局环境变量配置</Text>} extra={<Text type="secondary">报文内使用 <Text code>{'<@env:变量名>默认值</@env:变量名>'}</Text></Text>}>
        <Flex gap={8} style={{ marginBottom: 16 }}>
          <Input placeholder="变量名 (如 BASE_URL)" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ width: 200 }} />
          <Input placeholder="变量值" value={newValue} onChange={e => setNewValue(e.target.value)} style={{ flex: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>
        </Flex>
        <Divider />
        <List
          dataSource={Object.entries(envs)}
          locale={{ emptyText: '暂无环境变量' }}
          renderItem={([key, value]) => (
            <List.Item actions={[<Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeEnv(key)}>删除</Button>]}>
              <Flex gap={16} style={{ width: '100%', alignItems: 'center' }}>
                <Text strong style={{ width: 200, fontFamily: 'monospace' }}>{key}</Text>
                <Input value={value} onChange={e => setEnv(key, e.target.value)} style={{ flex: 1 }} />
              </Flex>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}