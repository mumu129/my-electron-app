import React, { useEffect, useState } from 'react';
import {
  Flex, Typography, Select, Empty, Divider, Button, Card, Form, Input,
  App as AntApp, Alert, Space, Row, Col, Modal, Tag, Popconfirm,
} from 'antd';
import {
  SaveOutlined, GlobalOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useProjects } from '../store/projectStore';
import { useAlgorithms } from '../store/algorithmStore';
import AlgorithmConfigPanel from '../components/AlgorithmConfigPanel';

const { Text } = Typography;
const { TextArea } = Input;

const JS_TEMPLATE = `// 自定义 JS 表达式：运行在渲染进程沙箱（不能 require）
// 可用变量：
//   input       — 链上一步的输出（字符串）
//   responses   — 本轮已完成请求 [{ index, response: { status, statusText, headers, body } }]
//   currentStep — 当前请求索引（0 开始）
//
// 必须 return 一个值（字符串或对象）

// 示例：把第 0 个请求响应体里的 sign 拼进 input
// const prev = JSON.parse(responses[0]?.response?.body || '{}');
// return input + '&sign=' + (prev.sign || '');

return input;
`;

function JsEditorModal({ open, projectId, initialName, initialDef, onClose }) {
  const { addCustomAlgorithm, updateCustomAlgorithm } = useAlgorithms();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const isEdit = !!initialName;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initialName || '',
      label: initialDef?.label || '',
      description: initialDef?.description || '',
      code: initialDef?.code || JS_TEMPLATE,
    });
  }, [open, initialName, initialDef, form]);

  const handleOk = async () => {
    const v = await form.validateFields();
    const name = (v.name || '').trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      message.warning('名称只能包含字母、数字、下划线、短横线，且不能以数字开头');
      return;
    }
    const payload = { label: v.label || name, description: v.description || '', code: v.code };
    if (isEdit) updateCustomAlgorithm(projectId, initialName, payload);
    else addCustomAlgorithm(projectId, name, payload);
    message.success(isEdit ? '已保存' : '已添加');
    onClose();
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={handleOk} width={800}
      title={isEdit ? `编辑 ${initialName}` : '添加自定义 JS 表达式'}
      okText="保存" cancelText="取消" destroyOnHidden>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="name" label="名称（唯一标识，创建后不可改）" rules={[{ required: true }]}>
              <Input disabled={isEdit} placeholder="如 sign" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="label" label="显示名称" rules={[{ required: true }]}>
              <Input placeholder="如 签名生成" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="说明（可选）">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="code" label="代码" rules={[{ required: true }]}>
          <TextArea rows={16} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Form.Item>
      </Form>
      <Alert
        type="info"
        showIcon
        message="运行在渲染进程（浏览器沙箱），不能 require。要用 Node 模块请到「全局算法 → 外部脚本」用主进程脚本。"
      />
    </Modal>
  );
}

function CustomJsList({ projectId }) {
  const { getCustomAlgorithms, removeCustomAlgorithm } = useAlgorithms();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const list = Object.entries(getCustomAlgorithms(projectId) || {});

  return (
    <Card
      size="small"
      title={<Text strong>自定义 JS 表达式</Text>}
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditing(null); setOpen(true); }}>
          新建
        </Button>
      }
    >
      {list.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有自定义 JS，点「新建」开始" />
      ) : (
        <Row gutter={[12, 12]}>
          {list.map(([name, def]) => (
            <Col key={name} xs={24} sm={12} md={8}>
              <Card size="small" variant="borderless"
                title={<Flex align="center" gap={6}><Text strong>{def.label}</Text><Tag color="purple">JS</Tag></Flex>}
                extra={
                  <Space size={2}>
                    <Button size="small" type="text" icon={<EditOutlined />}
                      onClick={() => { setEditing({ name, def }); setOpen(true); }} />
                    <Popconfirm title={`删除「${def.label}」？`}
                      onConfirm={() => { removeCustomAlgorithm(projectId, name); message.success('已删除'); }}
                      okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                }>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>key: {name}</Text>
                {def.description && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{def.description}</Text>
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <JsEditorModal open={open} projectId={projectId}
        initialName={editing?.name} initialDef={editing?.def}
        onClose={() => setOpen(false)} />
    </Card>
  );
}

function ProxyConfig({ projectId }) {
  const { projects, updateProjectProxy } = useProjects();
  const { message } = AntApp.useApp();
  const project = projects.find((p) => p.id === projectId);
  const [proxy, setProxy] = useState(project?.proxy || '');

  useEffect(() => { setProxy(project?.proxy || ''); }, [projectId, project?.proxy]);

  const handleSave = () => {
    const v = proxy.trim();
    if (v && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) {
      message.warning('格式：http://127.0.0.1:7890 或 socks5://127.0.0.1:1080');
      return;
    }
    updateProjectProxy(projectId, v);
    message.success(v ? `已设置代理：${v}` : '已清除代理');
  };

  return (
    <Card
      size="small"
      title={<Space><GlobalOutlined /><Text strong>网络代理</Text></Space>}
      extra={
        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>
          保存
        </Button>
      }
      style={{ marginBottom: 16 }}
    >
      <Flex gap={8} align="center">
        <Input
          placeholder="如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080（留空表示不使用代理）"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          style={{ flex: 1 }}
        />
      </Flex>
      <Alert type="info" showIcon style={{ marginTop: 8 }}
        message="该项目的「按顺序执行」会用此代理。留空使用系统默认网络。" />
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState();

  if (projects.length === 0) {
    return <Flex justify="center" align="center" style={{ height: '100%' }}>
      <Empty description="还没有项目" />
    </Flex>;
  }

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Flex align="center" gap={12}>
          <Text strong style={{ fontSize: 16 }}>项目设置</Text>
          <Select style={{ width: 220 }} placeholder="选择项目" value={projectId}
            onChange={setProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        </Flex>
        <Text type="secondary" style={{ fontSize: 12 }}>项目配置优先于全局配置</Text>
      </Flex>
      <Divider style={{ margin: '8px 0 12px' }} />

      {!projectId ? (
        <Empty description="请选择要配置的项目" />
      ) : (
        <>
          <ProxyConfig projectId={projectId} />
          <Divider />
          <CustomJsList projectId={projectId} />
          <Divider />
          <AlgorithmConfigPanel projectId={projectId} />
        </>
      )}
    </div>
  );
}