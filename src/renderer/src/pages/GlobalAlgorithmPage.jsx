import React, { useMemo, useState } from 'react';
import {
  Card, Col, Row, Typography, Tag, Input, Button, Form, App as AntApp,
  Popover, Divider, Flex, Empty,
} from 'antd';
import { SettingOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { PARSER_TEMPLATES, PARSER_GROUPS } from '../utils/parsers';
import { useAlgorithms } from '../store/algorithmStore';

const { Text } = Typography;

function GlobalConfigForm({ algorithmKey, onClose }) {
  const { algorithms, updateGlobalAlgorithm, removeGlobalAlgorithm } = useAlgorithms();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const tpl = PARSER_TEMPLATES[algorithmKey];
  const existing = algorithms.global?.[algorithmKey]?.config || {};

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateGlobalAlgorithm(algorithmKey, { enabled: true, config: values });
      message.success(`${tpl.label} 已配置`);
      onClose?.();
    } catch (e) { console.error(e); }
  };

  const handleClear = () => {
    removeGlobalAlgorithm(algorithmKey);
    message.success(`已清除 ${tpl.label} 全局配置`);
    onClose?.();
  };

  const content = (
    <div style={{ width: 400 }}>
      <Form form={form} layout="vertical" initialValues={existing} size="small">
        {tpl.configFields.map((f) => (
          <Form.Item key={f.name} name={f.name} label={f.label}>
            {f.multiline ? <Input.TextArea rows={3} /> : <Input />}
          </Form.Item>
        ))}
      </Form>
      <Flex justify="space-between">
        <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClear}>清除</Button>
        <Flex gap={6}>
          <Button size="small" onClick={onClose}>取消</Button>
          <Button size="small" type="primary" onClick={handleSave}>保存</Button>
        </Flex>
      </Flex>
    </div>
  );

  return (
    <Popover content={content} trigger="click" title={`配置 ${tpl.label}`} placement="bottomRight">
      <Button size="small" icon={<SettingOutlined />}>配置</Button>
    </Popover>
  );
}

export default function GlobalAlgorithmPage() {
  const { algorithms } = useAlgorithms();
  const [activeGroup, setActiveGroup] = useState('symmetric');

  const byGroup = useMemo(() => {
    const result = { encode: [], hash: [], symmetric: [], asymmetric: [] };
    Object.entries(PARSER_TEMPLATES).forEach(([key, tpl]) => {
      result[tpl.group]?.push([key, tpl]);
    });
    return result;
  }, []);

  const groups = Object.entries(PARSER_GROUPS);
  const currentList = byGroup[activeGroup] || [];

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 16 }}>全局算法</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          全局配置作为默认值，项目可覆盖
        </Text>
      </Flex>
      <Divider style={{ margin: '8px 0 12px' }} />

      <Flex gap={6} style={{ marginBottom: 12 }} wrap>
        {groups.map(([g, label]) => (
          <Button key={g} size="small"
            type={activeGroup === g ? 'primary' : 'default'}
            onClick={() => setActiveGroup(g)}>{label}</Button>
        ))}
      </Flex>

      {currentList.length === 0 ? (
        <Empty description="该分组下暂无算法" />
      ) : (
        <Row gutter={[16, 16]}>
          {currentList.map(([key, tpl]) => {
            const state = algorithms.global?.[key];
            const configured = !tpl.configFields || !!state?.config;
            return (
              <Col key={key} xs={24} sm={12} md={8} lg={6}>
                <Card
                  size="small"
                  variant="borderless"
                  title={
                    <Flex align="center" gap={6}>
                      <Text strong>{tpl.label}</Text>
                      {configured
                        ? <Tag color="success" icon={<CheckOutlined />}>可用</Tag>
                        : <Tag color="warning">待配置</Tag>}
                    </Flex>
                  }
                  extra={tpl.configFields ? <GlobalConfigForm algorithmKey={key} onClose={() => {}} /> : null}
                >
                  <Flex vertical gap={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>分组：{PARSER_GROUPS[tpl.group]}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      需配置：{tpl.configFields ? '是' : '否'}
                    </Text>
                    {state?.config && (
                      <Text style={{ fontSize: 11, color: '#52c41a' }}>已保存配置 ✓</Text>
                    )}
                  </Flex>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}