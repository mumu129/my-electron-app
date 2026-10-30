// src/renderer/src/components/HackvertorEditor.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Flex, Modal, Form, Input, Dropdown, Tag, Space, Typography, App } from 'antd';
import { TagOutlined, CodeOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { processTags, wrapTag } from '../utils/hackTags';
import { TRANSFORMS, applyTransform } from '../utils/strictTransforms';

const { Text } = Typography;

function commitReplacement(value, start, end, replacement) {
  const before = (value || '').slice(0, start);
  const after = (value || '').slice(end);
  return { newText: before + replacement + after };
}

export default function HackvertorEditor({ value, onChange, placeholder, minRows = 6, readOnly = false }) {
  const { message } = App.useApp();
  const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, text: '', start: 0, end: 0 });
  const [paramModal, setParamModal] = useState({ visible: false, action: null });
  const [renderedValue, setRenderedValue] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  const [form] = Form.useForm();
  const textareaRef = useRef(null);
  const pendingSelectRef = useRef(null);

  // 右侧：实时计算最终发送报文
  useEffect(() => {
    let canceled = false;
    setIsRendering(true);
    processTags(value || '')
      .then((res) => {
        if (canceled) return;
        try {
          const parsed = JSON.parse(res);
          setRenderedValue(typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : res);
        } catch { 
          setRenderedValue(res); 
        }
      })
      .finally(() => { if (!canceled) setIsRendering(false); });
    return () => { canceled = true; };
  }, [value]);

  useEffect(() => {
    if (!pendingSelectRef.current) return;
    const { start, end } = pendingSelectRef.current;
    pendingSelectRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      try { el.setSelectionRange(start, end); } catch {}
    });
  }, [value]);

  const contextMenuItems = useMemo(() => {
    const encodeList = Object.entries(TRANSFORMS)
      .filter(([, v]) => v.direction === 'both' || v.direction === 'encode-only')
      .map(([k, v]) => ({
        key: `enc-${k}`,
        label: v.encodeLabel || v.label,
        onClick: () => requestEncrypt(k)
      }));

    const decodeList = Object.entries(TRANSFORMS)
      .filter(([, v]) => v.direction === 'both' || v.direction === 'decode-only')
      .map(([k, v]) => ({
        key: `dec-${k}`,
        label: v.decodeLabel || v.label,
        onClick: () => requestDecrypt(k)
      }));

    const items = [];
    if (decodeList.length) {
      items.push({ type: 'group', label: '⬇️ 解密 / 解码 (立即解密替换左侧内容)', children: decodeList });
    }
    if (encodeList.length) {
      items.push({ type: 'divider' });
      items.push({ type: 'group', label: '⬆️ 加密 / 编码 (选中明文加标签)', children: encodeList });
    }
    return items;
  }, [menuState.text]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (readOnly) return;
    const el = textareaRef.current;
    const { selectionStart: s, selectionEnd: t } = el;
    if (s === t) { message.warning('请先选中一段文本再右键'); return; }
    setMenuState({ visible: true, x: e.clientX, y: e.clientY, text: el.value.substring(s, t), start: s, end: t });
  };

  /* ============ 加密：保留明文，只包 enc 标签 ============ */
  const requestEncrypt = (algoKey) => {
    if (TRANSFORMS[algoKey]?.configFields?.length) openParamModal(algoKey, 'encrypt');
    else doEncrypt(algoKey, {});
  };

  const doEncrypt = (algoKey, config) => {
    const paramStr = Object.keys(config).length
      ? Object.entries(config).map(([k, v]) => `${k}=${v}`).join(',')
      : '';
    const wrapped = wrapTag(`enc:${algoKey}`, menuState.text, paramStr);
    const { newText } = commitReplacement(value, menuState.start, menuState.end, wrapped);
    pendingSelectRef.current = { start: menuState.start, end: menuState.start + wrapped.length };
    onChange(newText);
    message.success(`已添加加密标签（${TRANSFORMS[algoKey]?.encodeLabel || algoKey}）`);
    setMenuState((p) => ({ ...p, visible: false }));
    setParamModal({ visible: false, action: null });
  };

  /* ============ 解密：立即解密，用明文替换，再包 dec 标签 ============ */
  const requestDecrypt = (algoKey) => {
    if (TRANSFORMS[algoKey]?.configFields?.length) openParamModal(algoKey, 'decrypt');
    else doDecrypt(algoKey, {});
  };

  const doDecrypt = async (algoKey, config) => {
    try {
      // 1. 执行解密
      const decrypted = await applyTransform({
        key: algoKey,
        direction: 'decode',
        value: menuState.text,
        config,
      });
      const paramStr = Object.keys(config).length
        ? Object.entries(config).map(([k, v]) => `${k}=${v}`).join(',')
        : '';
      
      // 2. 将解密后的明文包在 dec 标签中
      const wrapped = wrapTag(`dec:${algoKey}`, decrypted, paramStr);
      const { newText } = commitReplacement(value, menuState.start, menuState.end, wrapped);
      
      // 3. 计算明文在文本框中的位置，方便自动选中
      const innerStart = menuState.start + wrapped.indexOf(decrypted);
      pendingSelectRef.current = { start: innerStart, end: innerStart + decrypted.length };
      
      onChange(newText);
      message.success(`已解密（${TRANSFORMS[algoKey]?.decodeLabel || algoKey}）`);
    } catch (e) {
      message.error(`解密失败: ${e?.message || e}`);
    } finally {
      setMenuState((p) => ({ ...p, visible: false }));
      setParamModal({ visible: false, action: null });
    }
  };

  const openParamModal = (algoKey, mode) => {
    form.resetFields();
    const defaults = {};
    TRANSFORMS[algoKey]?.configFields?.forEach((f) => { if (f.defaultValue) defaults[f.name] = f.defaultValue; });
    form.setFieldsValue(defaults);
    setParamModal({ visible: true, action: { algoKey, mode } });
    setMenuState((p) => ({ ...p, visible: false }));
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const a = paramModal.action;
      if (a?.mode === 'encrypt') doEncrypt(a.algoKey, values);
      else if (a?.mode === 'decrypt') await doDecrypt(a.algoKey, values);
    } catch {}
  };

  return (
    <Flex vertical style={{ background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden', width: '100%', height: '100%' }}>
      <Flex justify="space-between" align="center" style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Space size={4}>
          <TagOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 12 }}>Hackvertor 编辑器</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>（左侧点击解密直接变成明文，可继续修改加标签）</Text>
        </Space>
        {isRendering && <Text type="secondary" style={{ fontSize: 11 }}>计算中...</Text>}
      </Flex>

      <div style={{ display: 'flex', flex: 1, minHeight: minRows * 22, overflow: 'hidden' }}>
        {/* 左栏：报文编辑（所见即所得的明文） */}
        <div style={{ flex: 1, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 11, color: '#888' }}>
            <CodeOutlined /> 报文编辑（点击解密后，这里就是明文）
          </div>
          <textarea
            ref={textareaRef}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onContextMenu={handleContextMenu}
            readOnly={readOnly}
            style={{
              flex: 1, width: '100%', border: 'none', outline: 'none', padding: 12,
              fontFamily: 'Consolas, Monaco, monospace', fontSize: 13,
              resize: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
            placeholder={placeholder}
          />
        </div>

        {/* 右栏：最终发送预览 */}
        <div style={{ flex: 1, background: '#f6ffed', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 8px', background: '#d9f7be', borderBottom: '1px solid #b7eb8f', fontSize: 11, color: '#389e0d', display: 'flex', justifyContent: 'space-between' }}>
            <Space size={4}>
              <SafetyCertificateOutlined />
              <span>最终发送报文（已自动完成加密）</span>
            </Space>
          </div>
          <pre style={{
            flex: 1, margin: 0, padding: 12,
            fontFamily: 'Consolas, Monaco, monospace', fontSize: 13,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            overflow: 'auto', color: '#237804',
          }}>
            {renderedValue || '（空）'}
          </pre>
        </div>
      </div>

      {menuState.visible && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setMenuState((p) => ({ ...p, visible: false }))}
            onContextMenu={(e) => { e.preventDefault(); setMenuState((p) => ({ ...p, visible: false })); }} />
          <Dropdown open menu={{ items: contextMenuItems }}>
            <div style={{ position: 'fixed', top: menuState.y, left: menuState.x, width: 1, height: 1, zIndex: 1000 }} />
          </Dropdown>
        </>
      )}

      <Modal
        title={
          <span>
            {paramModal.action?.mode === 'decrypt' ? '立即解密并打标签：' : '添加加密标签：'}
            <Tag color="blue">
              {paramModal.action?.mode === 'decrypt' 
                ? (TRANSFORMS[paramModal.action?.algoKey]?.decodeLabel || TRANSFORMS[paramModal.action?.algoKey]?.label)
                : (TRANSFORMS[paramModal.action?.algoKey]?.encodeLabel || TRANSFORMS[paramModal.action?.algoKey]?.label)}
            </Tag>
          </span>
        }
        open={paramModal.visible}
        onOk={handleModalOk}
        onCancel={() => setParamModal({ visible: false, action: null })}
        okText={paramModal.action?.mode === 'decrypt' ? '解密' : '添加标签'}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {paramModal.action && TRANSFORMS[paramModal.action.algoKey]?.configFields?.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label}
              rules={[{ required: f.required, message: `请输入 ${f.label}` }]}>
              {f.multiline ? <Input.TextArea rows={3} /> : <Input placeholder={f.placeholder || f.defaultValue || ''} />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Flex>
  );
}