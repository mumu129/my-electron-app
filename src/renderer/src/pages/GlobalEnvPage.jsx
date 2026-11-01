// src/renderer/src/pages/GlobalEnvPage.jsx
import React, { useMemo, useState } from 'react';
import {
  Flex, Typography, Button, Input, List, App as AntApp, Space, Card, Divider,
  Modal, Form, Select, Checkbox, InputNumber, Row, Col, Tag, Popconfirm, Tooltip,
  Dropdown, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined,
  MoreOutlined, EditOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useEnvs } from '../store/envStore';
import { useAlgorithms } from '../store/algorithmStore';
import { idb } from '../store/idbStore';
import { TRANSFORMS } from '../utils/strictTransforms';
import { runEnvRule } from '../utils/envRuleRunner';

const { Text } = Typography;

export default function GlobalEnvPage() {
  const {
    items, sets, activeSetId, switchSet, createSet, renameSet, deleteSet,
    setEnv, setEnvRule, removeEnv,
  } = useEnvs();
  const { algorithms } = useAlgorithms();
  const { message } = AntApp.useApp();

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleTarget, setRuleTarget] = useState(null);
  const [ruleForm] = Form.useForm();
  const [refreshing, setRefreshing] = useState({});

  const [createSetModalOpen, setCreateSetModalOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetCopy, setNewSetCopy] = useState(false);

  const [renameSetModal, setRenameSetModal] = useState({ open: false, id: null, name: '' });

  const decryptableAlgos = useMemo(
    () => Object.entries(TRANSFORMS)
      .filter(([_, t]) => t.direction === 'both' || t.direction === 'decode-only')
      .map(([k, t]) => ({ value: k, label: t.label })),
    []
  );

  const currentSetName = useMemo(() => sets.find((s) => s.id === activeSetId)?.name || '未命名', [sets, activeSetId]);

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return message.warning('请输入变量名');
    if (items[key]) return message.warning(`变量「${key}」已存在`);
    setEnv(key, newValue);
    setNewKey('');
    setNewValue('');
    message.success('已添加环境变量');
  };

  const openRuleModal = (key) => {
    setRuleTarget(key);
    const rule = items[key]?.rule || {};
    ruleForm.setFieldsValue({
      urlMatch: rule.urlMatch || '',
      method: rule.method || '',
      sourceType: rule.source?.type || 'responseBody',
      sourceName: rule.source?.name || '',
      decryptEnabled: !!rule.decrypt?.algoKey,
      decryptAlgoKey: rule.decrypt?.algoKey || undefined,
      inputEncoding: rule.inputEncoding || 'base64',
      regex: rule.regex || '',
      flags: rule.flags || '',
      groupIndex: rule.groupIndex ?? 1,
    });
    setRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    try {
      const v = await ruleForm.validateFields();
      setEnvRule(ruleTarget, {
        urlMatch: String(v.urlMatch || '').trim(),
        method: v.method ? String(v.method).toUpperCase() : '',
        source: { type: v.sourceType, name: (v.sourceName || '').trim() },
        decrypt: v.decryptEnabled && v.decryptAlgoKey ? { algoKey: v.decryptAlgoKey } : null,
        inputEncoding: v.inputEncoding || 'base64',
        regex: v.regex,
        flags: v.flags || '',
        groupIndex: Number(v.groupIndex ?? 1),
      });
      message.success('规则已保存');
      setRuleModalOpen(false);
    } catch {}
  };

  const handleClearRule = () => {
    if (!ruleTarget) return;
    setEnvRule(ruleTarget, null);
    message.success('已清除规则');
    setRuleModalOpen(false);
  };

  const handleRefresh = async (key) => {
    const rule = items[key]?.rule;
    if (!rule) { message.warning('该变量未配置提取规则'); return; }
    setRefreshing((p) => ({ ...p, [key]: true }));
    try {
      const entries = (await idb.get('har-entries-v1')) || [];
      if (!entries.length) { message.warning('当前 HAR 为空，请先在「HAR 查看器」导入'); return; }
      const globalAlgos = {};
      for (const [k, v] of Object.entries(algorithms.global || {})) if (v?.config) globalAlgos[k] = v;
      const r = await runEnvRule(entries, rule, globalAlgos);
      if (!r.ok) { message.error(r.error); return; }
      setEnv(key, r.value);
      message.success(`「${key}」已更新`);
    } catch (e) { message.error(String(e?.message || e)); }
    finally { setRefreshing((p) => ({ ...p, [key]: false })); }
  };

  const needName = (type) =>
    type === 'responseHeader' || type === 'requestHeader' || type === 'query';

  const handleCreateSet = () => {
    if (!newSetName.trim()) return message.warning('请输入环境集名称');
    createSet(newSetName.trim(), newSetCopy);
    message.success('已创建环境集');
    setCreateSetModalOpen(false);
    setNewSetName('');
    setNewSetCopy(false);
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Card
        title={
          <Flex align="center" gap={8}>
            <Text strong>全局环境变量</Text>
            <Tag color="blue">{sets.length} 套</Tag>
          </Flex>
        }
        extra={
          <Space>
            <Select
              value={activeSetId}
              onChange={switchSet}
              style={{ minWidth: 180 }}
              options={sets.map((s) => ({ value: s.id, label: `${s.name}（${s.count}）` }))}
            />
            <Button icon={<PlusOutlined />} size="small" onClick={() => setCreateSetModalOpen(true)}>新建环境集</Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'rename', label: '重命名当前环境集', icon: <EditOutlined />, onClick: () => setRenameSetModal({ open: true, id: activeSetId, name: currentSetName }) },
                  { key: 'delete', label: '删除当前环境集', danger: true, icon: <DeleteOutlined />, disabled: sets.length <= 1, onClick: () => { deleteSet(activeSetId); message.success('已删除'); } },
                ],
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        }
      >
        <Flex gap={8} style={{ marginBottom: 16 }}>
          <Input placeholder="变量名 (如 TOKEN)" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ width: 200 }} />
          <Input placeholder="变量值" value={newValue} onChange={(e) => setNewValue(e.target.value)} style={{ flex: 1 }} onPressEnter={handleAdd} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加</Button>
        </Flex>

        <Divider />

        {Object.keys(items).length === 0 ? (
          <Empty description="当前环境集暂无变量" />
        ) : (
          <List
            dataSource={Object.entries(items)}
            renderItem={([key, item]) => {
              const rule = item.rule;
              return (
                <List.Item
                  actions={[
                    rule ? (
                      <Tooltip key="refresh" title={`URL: ${rule.urlMatch}${rule.method ? ' [' + rule.method + ']' : ''}\n正则: ${rule.regex}`}>
                        <Button size="small" icon={<ReloadOutlined />} loading={refreshing[key]} onClick={() => handleRefresh(key)}>刷新</Button>
                      </Tooltip>
                    ) : null,
                    <Button key="rule" size="small" icon={<SettingOutlined />} onClick={() => openRuleModal(key)}>规则</Button>,
                    <Popconfirm key="del" title={`删除「${key}」？`} onConfirm={() => removeEnv(key)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <Flex gap={12} style={{ width: '100%', alignItems: 'center' }}>
                    <Flex align="center" gap={6} style={{ width: 220 }}>
                      <Text strong style={{ fontFamily: 'monospace' }}>{key}</Text>
                      {rule && <Tag color="blue">规则</Tag>}
                    </Flex>
                    <Input value={item.value} onChange={(e) => setEnv(key, e.target.value)} style={{ flex: 1 }} spellCheck={false} />
                  </Flex>
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      {/* 新建环境集 */}
      <Modal title="新建环境集" open={createSetModalOpen} onOk={handleCreateSet} onCancel={() => setCreateSetModalOpen(false)} okText="创建">
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          <Input placeholder="环境集名称（如 账号A / 生产环境）" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} autoFocus onPressEnter={handleCreateSet} />
          <Checkbox checked={newSetCopy} onChange={(e) => setNewSetCopy(e.target.checked)}>
            <CopyOutlined /> 复制当前环境集的所有变量（推荐，切换账号时最方便）
          </Checkbox>
        </Space>
      </Modal>

      {/* 重命名环境集 */}
      <Modal
        title="重命名环境集"
        open={renameSetModal.open}
        onOk={() => {
          if (renameSetModal.name.trim()) { renameSet(renameSetModal.id, renameSetModal.name.trim()); message.success('已重命名'); }
          setRenameSetModal({ open: false, id: null, name: '' });
        }}
        onCancel={() => setRenameSetModal({ open: false, id: null, name: '' })}
        okText="保存"
      >
        <Input value={renameSetModal.name} onChange={(e) => setRenameSetModal((p) => ({ ...p, name: e.target.value }))} autoFocus />
      </Modal>

      {/* 规则弹窗（与上一版一致） */}
      <Modal
        title={`提取规则：${ruleTarget || ''}`}
        open={ruleModalOpen}
        onOk={handleSaveRule}
        onCancel={() => setRuleModalOpen(false)}
        width={620}
        okText="保存规则"
        cancelText="取消"
        destroyOnHidden
        footer={(_, { OkBtn, CancelBtn }) => (
          <Flex justify="space-between">
            <Button danger onClick={handleClearRule}>清除规则</Button>
            <Space><CancelBtn /><OkBtn /></Space>
          </Flex>
        )}
      >
        <Form form={ruleForm} layout="vertical" style={{ marginTop: 12 }}>
          <Row gutter={8}>
            <Col span={16}>
              <Form.Item name="urlMatch" label="URL 包含（匹配 HAR 请求）" rules={[{ required: true, message: '请输入 URL 片段' }]}>
                <Input placeholder="例如 /api/login" spellCheck={false} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="method" label="方法">
                <Select options={[
                  { value: '', label: '任意' }, { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' }, { value: 'DELETE', label: 'DELETE' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" plain>取值来源</Divider>
          <Row gutter={8}>
            <Col span={14}>
              <Form.Item name="sourceType" label="来源">
                <Select options={[
                  { value: 'responseBody', label: '响应体' }, { value: 'requestBody', label: '请求体' },
                  { value: 'responseHeader', label: '响应头' }, { value: 'requestHeader', label: '请求头' },
                  { value: 'query', label: 'URL 参数' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item noStyle shouldUpdate={(p, c) => p.sourceType !== c.sourceType}>
                {({ getFieldValue }) => {
                  const t = getFieldValue('sourceType');
                  const n = needName(t);
                  return (
                    <Form.Item name="sourceName" label={n ? '字段名' : '（此来源不需要）'} rules={n ? [{ required: true }] : []}>
                      <Input disabled={!n} placeholder={n ? '如 X-Token' : ''} spellCheck={false} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" plain>解密（可选）</Divider>
          <Form.Item name="decryptEnabled" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox>启用解密（密钥从「全局算法」引用）</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.decryptEnabled !== c.decryptEnabled}>
            {({ getFieldValue }) => getFieldValue('decryptEnabled') && (
              <Row gutter={8}>
                <Col span={14}>
                  <Form.Item name="decryptAlgoKey" label="算法" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={decryptableAlgos} />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="inputEncoding" label="密文输入格式">
                    <Select options={[
                      { value: 'base64', label: 'Base64' }, { value: 'hex', label: 'Hex' }, { value: 'utf8', label: 'UTF-8 文本' },
                    ]} />
                  </Form.Item>
                </Col>
              </Row>
            )}
          </Form.Item>
          <Divider orientation="left" plain>正则提取（JSON / 表单 / 任意文本通用）</Divider>
          <Form.Item name="regex" label="正则表达式" rules={[{ required: true, message: '请输入正则' }]}
            extra='JSON: "token"\s*:\s*"(.*?)"    表单: (?:^|&)token=([^&]*)'>
            <Input.TextArea rows={2} style={{ fontFamily: 'Consolas, monospace' }} placeholder='例如 "token"\s*:\s*"(.*?)"' spellCheck={false} />
          </Form.Item>
          <Row gutter={8}>
            <Col span={8}>
              <Form.Item name="groupIndex" label="捕获组索引">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="flags" label="Flags">
                <Input placeholder="i / s / is" spellCheck={false} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}