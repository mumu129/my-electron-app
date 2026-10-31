// src/renderer/src/pages/GlobalAlgorithmPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Switch,Card, Col, Row, Typography, Tag, Input, Button, Form, App as AntApp,
  Popover, Divider, Flex, Empty, Modal, Space, Alert, Popconfirm, Dropdown, Checkbox,
} from 'antd';

import {
  SettingOutlined, CheckOutlined, DeleteOutlined, PlusOutlined,
  EditOutlined, FolderOpenOutlined, ImportOutlined, ReloadOutlined,
  FileTextOutlined, CodeOutlined, FolderAddOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { TRANSFORMS, TRANSFORM_GROUPS } from '../utils/strictTransforms';
import { useAlgorithms } from '../store/algorithmStore';
import { useScripts } from '../store/scriptStore';

const { Text } = Typography;
const { TextArea } = Input;

// 💡 内置详细的 Context 提示文档
const SCRIPT_PLACEHOLDER = `// ==========================================
// 外部脚本（在 Electron 主进程 Node.js 环境中运行）
// ==========================================

// 【1. 环境变量与模块】
// require: 可以直接 require 第三方模块或本地文件。
// const path = require('path');
// const crypto = require('crypto');

// LIBS_PATH: 本地库目录（存放你导入的 .js 文件）
// USER_DATA_PATH: 应用用户数据目录
// APP_PATH / RESOURCES_PATH: 应用资源目录

// 【2. 函数签名】
// module.exports = function(input, ctx) { ... }

// 【3. 参数详解】
// input: string
//   - 当前标签包裹的原始文本，即 <@script:名> 中间的内容。
//
// ctx: object (上下文环境)
//   - ctx.config: object
//     当前标签上传入的参数。例如标签是 <@script:name:key=123,iv=456>，
//     那么 ctx.config = { key: '123', iv: '456' }。
//
//   - ctx.responses: array
//     如果是在请求组中执行，可获取前面请求的响应。
//     格式: [ { index: 0, response: { status: 200, body: '...' } } ]
//
//   - ctx.currentStep: number
//     当前执行到请求组中的第几个请求（索引）。

// 【4. 必须返回结果】
// 可以返回字符串、数字、对象（引擎会自动转 JSON）。
//
// 示例：
// const lib = require(path.join(LIBS_PATH, 'xxsdk.js'));
// module.exports = function(input, ctx) {
//   const key = ctx.config.key || 'default';
//   return lib.encrypt(input, key);
// };`;

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
    form.resetFields();
    message.success(`已清除 ${tpl.label}`);
  };

  const content = (
    <div style={{ width: 400 }}>
      <Form form={form} layout="vertical" size="small">
        {tpl.configFields?.map((f) => (
          <Form.Item
            key={f.name}
            name={f.name}
            label={f.label}
            // 💡 布尔字段用 Switch：内部仍存 'true'/'false'，与标签参数格式一致
            valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
            getValueProps={f.type === 'boolean' ? (v) => ({ checked: v === 'true' || v === true }) : undefined}
            getValueFromEvent={f.type === 'boolean' ? (checked) => (checked ? 'true' : 'false') : undefined}
          >
            {f.type === 'boolean'
              ? <Switch size="small" checkedChildren="开" unCheckedChildren="关" />
              : f.multiline ? <Input.TextArea rows={3} /> : <Input />}
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
    <Popover
      content={content}
      trigger="click"
      title={`配置 ${tpl.label}`}
      placement="bottomRight"
      onOpenChange={(open) => {
        if (open) {
          form.resetFields();
          form.setFieldsValue(existing || {});
        }
      }}
    >
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
  const [libs, setLibs] = useState([]);
  const isEdit = !!editName;

  useEffect(() => {
    if (open && window.electronAPI?.lib) {
      window.electronAPI.lib.list().then(r => { if (r.ok) setLibs(r.libs || []); });
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const def = scripts[editName] || {};
      form.setFieldsValue({
        name: editName,
        label: def.label || editName,
        description: def.description || '',
        code: def.code || '', 
      });
      setConfigFields(def.configFields || []);
    } else {
      form.setFieldsValue({ name: '', label: '', description: '', code: '' }); 
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
    const payload = { label: v.label || name, description: v.description || '', code: v.code || '', configFields: cleanedFields };
    if (isEdit) { updateScript(editName, payload); message.success('已保存'); }
    else { createScript(name, payload); message.success('已创建'); }
    onClose();
  };

  const insertCode = (snippet) => {
    const currentCode = form.getFieldValue('code') || '';
    form.setFieldsValue({ code: currentCode + '\n' + snippet });
  };

  const insertMenuItems = [
    {
      key: 'env',
      label: '插入环境路径',
      icon: <FolderAddOutlined />,
      children: [
        { key: 'path', label: 'const path = require("path");', onClick: () => insertCode('const path = require("path");') },
        { key: 'libs', label: 'LIBS_PATH', onClick: () => insertCode('const libsPath = LIBS_PATH;') },
        { key: 'user', label: 'USER_DATA_PATH', onClick: () => insertCode('const dataPath = USER_DATA_PATH;') },
      ]
    },
    {
      key: 'libs',
      label: '引入本地库 (require)',
      icon: <CodeOutlined />,
      disabled: libs.length === 0,
      children: libs.map(l => ({
        key: l.fileName,
        label: l.fileName,
        onClick: () => insertCode(`const lib_${l.fileName.split('.')[0]} = require(path.join(LIBS_PATH, '${l.fileName}'));`)
      }))
    }
  ];

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
    {/* 💡 [修复 #9] 必填开关 */}
    <Checkbox
      checked={f.required !== false}
      onChange={(e) => updateField(i, { required: e.target.checked })}
    >
      必填
    </Checkbox>
    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeField(i)} />
  </Flex>
))}
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addField}>添加配置字段</Button>
        </Flex>
        <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
          <Text strong>脚本代码</Text>
          <Dropdown menu={{ items: insertMenuItems }}>
            <Button size="small" type="dashed" icon={<ThunderboltOutlined />}>快捷插入代码</Button>
          </Dropdown>
        </Flex>
        <Form.Item name="code" rules={[{ required: true, message: '请输入脚本代码' }]}>
          <TextArea 
            rows={18} 
            style={{ fontFamily: 'monospace', fontSize: 13 }} 
            placeholder={SCRIPT_PLACEHOLDER} // 💡 换成详细提示
            spellCheck={false} 
          />
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
  const [activeGroup, setActiveGroup] = useState('encoding');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState(null);

  const byGroup = useMemo(() => {
    const result = {};
    Object.entries(TRANSFORMS).forEach(([key, tpl]) => {
      (result[tpl.group] ||= []).push([key, tpl]);
    });
    return result;
  }, []);

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