import React, { useState } from 'react';
import {
  Card, Row, Col, Tag, Button, Flex, Typography, Modal, Form, Input,
  Popconfirm, App as AntApp, Divider, Empty,
} from 'antd';
import { SettingOutlined, CheckOutlined } from '@ant-design/icons';
// 替换为新的严格算法库
import { TRANSFORMS, TRANSFORM_GROUPS } from '../utils/strictTransforms';
import { useAlgorithms } from '../store/algorithmStore';

const { Text } = Typography;

function AlgorithmConfigCard({ projectId, algorithmKey, tpl }) {
  const { algorithms, updateProjectAlgorithm, removeProjectAlgorithm } = useAlgorithms();
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  const globalConfig = algorithms.global?.[algorithmKey]?.config;
  const projectConfig = algorithms.projects?.[projectId]?.[algorithmKey]?.config;

  const openEdit = () => {
    form.setFieldsValue(projectConfig || globalConfig || {});
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateProjectAlgorithm(projectId, algorithmKey, { enabled: true, config: values });
      message.success(`已保存 ${tpl.label} 的项目配置`);
      setEditing(false);
    } catch (e) { console.error(e); }
  };

  const handleFollowGlobal = () => {
    removeProjectAlgorithm(projectId, algorithmKey);
    message.success(`已恢复 ${tpl.label} 到全局配置`);
  };

  if (!tpl.configFields) {
    return (
      <Card size="small" variant="borderless">
        <Flex align="center" gap={6}>
          <Text strong>{tpl.label}</Text>
          <Tag color="success" icon={<CheckOutlined />}>无需配置</Tag>
        </Flex>
      </Card>
    );
  }

  const statusTag = projectConfig
    ? <Tag color="success">项目已覆盖</Tag>
    : globalConfig
    ? <Tag color="processing">跟随全局</Tag>
    : <Tag color="default">未配置</Tag>;

  return (
    <Card
      size="small"
      variant="borderless"
      title={
        <Flex align="center" gap={6}>
          <Text strong>{tpl.label}</Text>
          {statusTag}
        </Flex>
      }
      extra={
        <Flex gap={4}>
          <Button size="small" icon={<SettingOutlined />} onClick={openEdit}>编辑</Button>
          {projectConfig && (
            <Popconfirm title="恢复使用全局配置？" onConfirm={handleFollowGlobal}>
              <Button size="small">跟随全局</Button>
            </Popconfirm>
          )}
        </Flex>
      }
    >
      <Flex vertical gap={4}>
        {tpl.configFields.map((f) => (
          <Text key={f.name} type="secondary" style={{ fontSize: 11 }}>
            {f.label}：{projectConfig?.[f.name] ? '项目覆盖' : globalConfig?.[f.name] ? '全局' : '未设置'}
          </Text>
        ))}
      </Flex>

      <Modal
        title={`${tpl.label} · 项目配置`}
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={handleSave}
        okText="保存"
        destroyOnHidden
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          保存后仅作用于当前项目；空字段继承全局配置
        </Text>
        <Form form={form} layout="vertical">
          {tpl.configFields.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label}>
              {f.multiline ? <Input.TextArea rows={3} /> : <Input />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Card>
  );
}

export default function AlgorithmConfigPanel({ projectId, title }) {
  // 使用 encoding 作为默认组
  const [activeGroup, setActiveGroup] = useState('encoding');

  if (!projectId) return <Empty description="请先选择一个项目" />;

  const groups = Object.entries(TRANSFORM_GROUPS).filter(([k]) => k !== 'chain');
  const inGroup = Object.entries(TRANSFORMS).filter(([, tpl]) => tpl.group === activeGroup);

  return (
    <div>
      {title && (
        <>
          <Text strong>{title}</Text>
          <Divider style={{ margin: '8px 0 12px' }} />
        </>
      )}
      <Flex gap={6} style={{ marginBottom: 12 }} wrap>
        {groups.map(([g, label]) => (
          <Button key={g} size="small"
            type={activeGroup === g ? 'primary' : 'default'}
            onClick={() => setActiveGroup(g)}>{label}</Button>
        ))}
      </Flex>
      <Row gutter={[16, 16]}>
        {inGroup.map(([key, tpl]) => (
          <Col key={key} xs={24} sm={12} md={8}>
            <AlgorithmConfigCard projectId={projectId} algorithmKey={key} tpl={tpl} />
          </Col>
        ))}
      </Row>
    </div>
  );
}