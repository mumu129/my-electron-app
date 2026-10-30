import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Col, Row, Typography, Tag, Input, Button, Form, App as AntApp,
  Popover, Divider, Flex, Empty, Modal, Space, Alert, Popconfirm,
} from 'antd';
import {
  SettingOutlined, CheckOutlined, DeleteOutlined, PlusOutlined,
  EditOutlined, FolderOpenOutlined, ImportOutlined, ReloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
// 替换为新的严格算法库
import { TRANSFORMS, TRANSFORM_GROUPS } from '../utils/strictTransforms';
import { useAlgorithms } from '../store/algorithmStore';
import { useScripts } from '../store/scriptStore';

const { Text } = Typography;
const { TextArea } = Input;

const SCRIPT_TEMPLATE = `// 外部脚本，运行在 Electron 主进程
// 可用变量：
//   input / ctx.config / ctx.responses / ctx.currentStep
//   require
//   USER_DATA_PATH / APP_PATH / RESOURCES_PATH / LIBS_PATH
//
// 主进程里没有 __dirname，require 本地文件请用绝对路径：
//   const path = require('path');
//   const lib = require(path.join(LIBS_PATH, 'xxsdk3.2.min.js'));
//
// 必须 return 一个值。

module.exports = function(input, ctx) {
  return input;
};
`;

/* ============ 本地库面板 ============ */
function LocalLibsCard() {
  const { message } = AntApp.useApp();
  const [libs, setLibs] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!window.electronAPI?.lib) return;
    setLoading(true);
    try {
      const r = await window.electronAPI.lib.list();
      if (r.ok) setLibs(r.libs || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const handleImport = async () => {
    if (!window.electronAPI?.lib) return;
    const r = await window.electronAPI.lib.import();
    if (r.ok && r.imported?.length) {
      message.success(`已导入 ${r.imported.length} 个库`);
      refresh();
    } else if (r.ok) {
      message.info('未选择文件');
    } else if (!r.canceled) {
      message.error(r.error || '导入失败');
    }
  };

  const handleDelete = async (fileName) => {
    const r = await window.electronAPI.lib.delete({ fileName });
    if (r.ok) { message.success('已删除'); refresh(); }
    else message.error(r.error || '删除失败');
  };

  const handleOpenDir = () => window.electronAPI?.lib.openDir();

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Flex align="center" gap={6}>
          <FileTextOutlined />
          <Text strong>本地 JS 库</Text>
          <Tag>{libs.length}</Tag>
        </Flex>
      }
      extra={
        <Space size={6}>
          <Button size="small" icon={<FolderOpenOutlined />} onClick={handleOpenDir}>打开目录</Button>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={refresh}>刷新</Button>
          <Button size="small" type="primary" icon={<ImportOutlined />} onClick={handleImport}>
            导入 .js 文件
          </Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        放进来的 .js 文件会保存在 <code>userData/libs/</code> 下，脚本里用
        <code>require(path.join(LIBS_PATH, '文件名.js'))</code> 直接引用。
      </Text>
      {libs.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有本地库" />
      ) : (
        <Flex wrap gap={8}>
          {libs.map((l) => (
            <Tag
              key={l.fileName}
              color="geekblue"
              style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {l.fileName}
              <Text style={{ fontSize: 10, opacity: 0.7 }}>{(l.size / 1024).toFixed(1)} KB</Text>
              <Popconfirm title={`删除 ${l.fileName}？`} onConfirm={() => handleDelete(l.fileName)}
                okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <DeleteOutlined style={{ cursor: 'pointer' }} />
              </Popconfirm>
            </Tag>
          ))}
        </Flex>
      )}
    </Card>
  );
}

/* ============ 内置算法配置 ============ */
function GlobalConfigForm({ algorithmKey }) {
  const { algorithms, updateGlobalAlgorithm, removeGlobalAlgorithm } = useAlgorithms();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const tpl = TRANSFORMS[algorithmKey];
  const existing = algorithms.global?.[algorithmKey]?.config || {};

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateGlobalAlgorithm(algorithmKey, { enabled: true, config: values });
      message.success(`${tpl.label} 已配置`);
    } catch (e) {}
  };
  const handleClear = () => {
    removeGlobalAlgorithm(algorithmKey);
    message.success(`已清除 ${tpl.label}`);
  };
  const content = (
    <div style={{ width: 400 }}>
      <Form form={form} layout="vertical" initialValues={existing} size="small">
        {tpl.configFields?.map((f) => (
          <Form.Item key={f.name} name={f.name} label={f.label}>
            {f.multiline ? <Input.TextArea rows={3} /> : <Input />}
          </Form.Item>
        ))}
      </Form>
      <Flex justify="space-between">
        <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClear}>清除</Button>
        <Button size="small" type="primary" onClick={handleSave}>保存</Button>
      </Flex>
    </div>
  );
  return (
    <Popover content={content} trigger="click" title={`配置 ${tpl.label}`} placement="bottomRight">
      <Button size="small" icon={<SettingOutlined />}>配置</Button>
    </Popover>
  );
}

/* ============ 脚本编辑器 ============ */
function ScriptEditorModal({ open, editName, onClose }) {
  const { scripts, createScript, updateScript } = useScripts();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [configFields, setConfigFields] = useState([]);
  const isEdit = !!editName;

  React.useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const def = scripts[editName] || {};
      form.setFieldsValue({
        name: editName,
        label: def.label || editName,
        description: def.description || '',
        code: def.code || SCRIPT_TEMPLATE,
      });
      setConfigFields(def.configFields || []);
    } else {
      form.setFieldsValue({ name: '', label: '', description: '', code: SCRIPT_TEMPLATE });
      setConfigFields([]);
    }
  }, [open, editName, scripts, form, isEdit]);

  const addField = () => setConfigFields((prev) => [...prev, { name: '', label: '', defaultValue: '', required: true }]);
  const updateField = (i, patch) => setConfigFields((prev) => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeField = (i) => setConfigFields((prev) => prev.filter((_, idx) => idx !== i));

  const handleOk = async () => {
    const v = await form.validateFields();
    const name = (v.name || '').trim().replace(/\.js$/, '');
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      message.warning('脚本名只能包含字母、数字、下划线、短横线');
      return;
    }
    const cleanedFields = configFields
      .filter((f) => (f.name || '').trim())
      .map((f) => ({
        name: f.name.trim(),
        label: (f.label || f.name).trim(),
        required: f.required !== false,
        defaultValue: f.defaultValue || '',
      }));
    const payload = { label: v.label || name, description: v.description || '', code: v.code, configFields: cleanedFields };
    if (isEdit) { updateScript(editName, payload); message.success('已保存'); }
    else { createScript(name, payload); message.success('已创建'); }
    onClose();
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={handleOk} width={900}
      title={isEdit ? `编辑脚本 ${editName}` : '新建脚本'}
      okText="保存" cancelText="取消" destroyOnHidden>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="name" label="脚本名（唯一）" rules={[{ required: true }]}>
              <Input disabled={isEdit} placeholder="如 xxsdk-sign" />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="label" label="显示名称" rules={[{ required: true }]}>
              <Input placeholder="如 xx 签名" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="说明（可选）">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Divider orientation="left" plain>配置字段（可选）</Divider>
        <Flex vertical gap={8} style={{ marginBottom: 12 }}>
          {configFields.map((f, i) => (
            <Flex key={i} gap={6} align="center">
              <Input size="small" style={{ width: 140 }} placeholder="字段名"
                value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} />
              <Input size="small" style={{ width: 160 }} placeholder="显示名"
                value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
              <Input size="small" style={{ flex: 1 }} placeholder="默认值"
                value={f.defaultValue} onChange={(e) => updateField(i, { defaultValue: e.target.value })} />
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeField(i)} />
            </Flex>
          ))}
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addField}>添加配置字段</Button>
        </Flex>
        <Form.Item name="code" label="脚本代码" rules={[{ required: true }]}>
          <TextArea rows={18} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Form.Item>
      </Form>
      <Alert type="info" showIcon
        message="主进程执行，可以 require 本地 .js 库（LIBS_PATH 指向 userData/libs）。" />
    </Modal>
  );
}

export default function GlobalAlgorithmPage() {
  const { algorithms } = useAlgorithms();
  const { scripts, removeScript } = useScripts();
  const { message } = AntApp.useApp();
  const [activeGroup, setActiveGroup] = useState('encoding'); // 默认切到编码组
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState(null);

  const byGroup = useMemo(() => {
    const result = {};
    Object.entries(TRANSFORMS).forEach(([key, tpl]) => {
      (result[tpl.group] ||= []).push([key, tpl]);
    });
    return result;
  }, []);

  // 去除 chain 组的展示（因为 chain 依赖上下文）
  const groups = Object.entries(TRANSFORM_GROUPS).filter(([k]) => k !== 'chain');
  const scriptList = Object.entries(scripts || {});

  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <LocalLibsCard />
      <Divider />

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        title={
          <Flex align="center" gap={6}>
            <Text strong>外部脚本（主进程执行）</Text>
            <Tag>{scriptList.length}</Tag>
          </Flex>
        }
        extra={
          <Button size="small" type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditingName(null); setEditorOpen(true); }}>
            新建脚本
          </Button>
        }
      >
        {scriptList.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有脚本" />
        ) : (
          <Row gutter={[12, 12]}>
            {scriptList.map(([name, def]) => (
              <Col key={name} xs={24} sm={12} md={8}>
                <Card size="small" variant="borderless"
                  title={<Flex align="center" gap={6}><Text strong>{def.label || name}</Text><Tag color="geekblue">脚本</Tag></Flex>}
                  extra={
                    <Space size={2}>
                      <Button size="small" type="text" icon={<EditOutlined />}
                        onClick={() => { setEditingName(name); setEditorOpen(true); }} />
                      <Popconfirm title={`删除「${def.label || name}」？`}
                        onConfirm={() => { removeScript(name); message.success('已删除'); }}
                        okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  }>
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>name: {name}</Text>
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
      </Card>

      <Divider />

      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 16 }}>内置算法</Text>
      </Flex>
      <Flex gap={6} style={{ marginBottom: 12 }} wrap>
        {groups.map(([g, label]) => (
          <Button key={g} size="small" type={activeGroup === g ? 'primary' : 'default'}
            onClick={() => setActiveGroup(g)}>{label}</Button>
        ))}
      </Flex>
      <Row gutter={[16, 16]}>
        {(byGroup[activeGroup] || []).map(([key, tpl]) => {
          const state = algorithms.global?.[key];
          const configured = !tpl.configFields || !!state?.config;
          return (
            <Col key={key} xs={24} sm={12} md={8} lg={6}>
              <Card size="small" variant="borderless"
                title={
                  <Flex align="center" gap={6}>
                    <Text strong>{tpl.label}</Text>
                    {configured ? <Tag color="success" icon={<CheckOutlined />}>可用</Tag> : <Tag color="warning">待配置</Tag>}
                  </Flex>
                }
                extra={tpl.configFields ? <GlobalConfigForm algorithmKey={key} /> : null}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {tpl.configFields ? `需要配置：${tpl.configFields.map((f) => f.name).join(' / ')}` : '无需配置'}
                </Text>
              </Card>
            </Col>
          );
        })}
      </Row>

      <ScriptEditorModal open={editorOpen} editName={editingName}
        onClose={() => setEditorOpen(false)} />
    </div>
  );
}