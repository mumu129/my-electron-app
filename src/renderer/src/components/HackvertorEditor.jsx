// src/renderer/src/components/HackvertorEditor.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Flex, Modal, Form, Input, Tag, Space, Typography, App, List, Button } from 'antd';
import { TagOutlined, CodeOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons';
import { processTags, wrapTag } from '../utils/hackTags';
import { TRANSFORMS, TRANSFORM_GROUPS, applyTransform } from '../utils/strictTransforms';
import { useScripts } from '../store/scriptStore';

const { Text } = Typography;

function commitReplacement(value, start, end, replacement) {
  const before = (value || '').slice(0, start);
  const after = (value || '').slice(end);
  return { newText: before + replacement + after };
}

function highlightText(text) {
  if (!text) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/&lt;@(.*?)&gt;|&lt;\/@(.*?)&gt;/g, (match, open, close) => {
    let color = '#d4b106';
    if (open) {
      if (open.startsWith('dec:')) color = '#cf1322';
      else if (open.startsWith('enc:')) color = '#389e0d';
      else if (open.startsWith('var:')) color = '#1677ff';
      else if (open.startsWith('script:')) color = '#fa8c16';
    } else if (close) {
      if (close.startsWith('dec:')) color = '#cf1322';
      else if (close.startsWith('enc:')) color = '#389e0d';
      else if (close.startsWith('var:')) color = '#1677ff';
      else if (close.startsWith('script:')) color = '#fa8c16';
    }
    return `<span style="color: ${color}; font-weight: bold;">${match}</span>`;
  });
}

const commonEditorStyle = {
  padding: '12px',
  fontFamily: 'Consolas, Monaco, monospace',
  fontSize: 13,
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  wordBreak: 'break-word',
  margin: 0,
  border: 'none',
  boxSizing: 'border-box',
};

export default function HackvertorEditor({ value, onChange, placeholder, minRows = 6, readOnly = false }) {
  const { message } = App.useApp();
  const { scripts } = useScripts();
  
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('decrypt');
  const [searchText, setSearchText] = useState('');
  const [selectedText, setSelectedText] = useState({ text: '', start: 0, end: 0 });
  const [paramModal, setParamModal] = useState({ visible: false, action: null });
  
  const [varModal, setVarModal] = useState({ visible: false });
  const [varForm] = Form.useForm();
  
  const [renderedValue, setRenderedValue] = useState('');
  const [isRendering, setIsRendering] = useState(false);
  
  const [form] = Form.useForm();
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const pendingSelectRef = useRef(null);

  useEffect(() => {
    let canceled = false;
    setIsRendering(true);
    processTags(value || '', { scripts })
      .then((res) => {
        if (canceled) return;
        try { setRenderedValue(JSON.stringify(JSON.parse(res), null, 2)); } 
        catch { setRenderedValue(res); }
      })
      .catch((err) => { if (!canceled) setRenderedValue(`[渲染错误: ${err.message}]`); })
      .finally(() => { if (!canceled) setIsRendering(false); });
    return () => { canceled = true; };
  }, [value, scripts]);

  useEffect(() => {
    if (!pendingSelectRef.current) return;
    const { start, end } = pendingSelectRef.current;
    pendingSelectRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(start, end); } catch {} });
  }, [value]);

  const handleScroll = (e) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.target.scrollTop;
      preRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (readOnly) return;
    const el = textareaRef.current;
    const { selectionStart: s, selectionEnd: t } = el;
    if (s === t) { message.warning('请先选中一段文本再右键'); return; }
    setSelectedText({ text: el.value.substring(s, t), start: s, end: t });
    setPickerMode('decrypt');
    setSearchText('');
    setPickerOpen(true);
  };

  const filteredAlgos = useMemo(() => {
    const kw = searchText.toLowerCase();
    const isEnc = pickerMode === 'encrypt';
    
    let builtin = Object.entries(TRANSFORMS).filter(([k, v]) => {
      const validDir = v.direction === 'both' || (isEnc ? v.direction === 'encode-only' : v.direction === 'decode-only');
      if (!validDir) return false;
      const label = isEnc ? (v.encodeLabel || v.label) : (v.decodeLabel || v.label);
      return label.toLowerCase().includes(kw) || k.toLowerCase().includes(kw);
    }).map(([k, v]) => ({ key: k, type: 'builtin', label: isEnc ? (v.encodeLabel || v.label) : (v.decodeLabel || v.label), group: v.group || 'other', tpl: v }));

    if (!isEnc && ('提取为变量'.includes(kw) || 'var'.includes(kw))) {
      builtin.unshift({
        key: '__extract_var__', type: 'var', label: '📦 提取为变量 (供 JS 调用)', group: 'app', tpl: null
      });
    }

    let customScripts = [];
    if (!isEnc) {
      customScripts = Object.entries(scripts || {})
        .filter(([k, v]) => (v.label || k).toLowerCase().includes(kw) || k.toLowerCase().includes(kw))
        .map(([k, v]) => ({ key: k, type: 'script', label: v.label || k, group: 'script', tpl: v }));
    }
    return [...builtin, ...customScripts];
  }, [searchText, pickerMode, scripts]);

  const groupedAlgos = useMemo(() => {
    const groups = {};
    filteredAlgos.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [filteredAlgos]);

  const applyAlgo = async (item) => {
    if (item.type === 'var') {
      setVarModal({ visible: true });
      setPickerOpen(false);
      return;
    }

    if (item.type === 'script') {
      let resultText = selectedText.text;
      try {
        const scriptDef = scripts[item.key];
        if (scriptDef && scriptDef.code) {
          const r = await window.electronAPI.script.run({ code: scriptDef.code, input: selectedText.text, config: {} });
          if (r.ok) resultText = r.value;
          else message.warning(`脚本报错: ${r.error}`);
        }
      } catch (e) { message.warning(`脚本执行失败: ${e.message}`); }

      const wrapped = wrapTag(`script:${item.key}`, resultText);
      const { newText } = commitReplacement(value, selectedText.start, selectedText.end, wrapped);
      const innerStart = selectedText.start + wrapped.indexOf(resultText);
      pendingSelectRef.current = { start: innerStart, end: innerStart + resultText.length };
      
      onChange(newText);
      message.success(`已应用主进程脚本`);
      setPickerOpen(false);
      return;
    }
    
    const tpl = item.tpl;
    
    // ✅ 删除针对 js-expression 的特殊分支，走正常配置弹窗流程
    if (tpl?.configFields?.length) {
      form.resetFields();
      const defaults = {};
      tpl.configFields.forEach((f) => { if (f.defaultValue) defaults[f.name] = f.defaultValue; });
      form.setFieldsValue(defaults);
      setParamModal({ visible: true, action: { algoKey: item.key, type: pickerMode } });
      setPickerOpen(false);
    } else {
      doTransform(item.key, pickerMode, {});
    }
  };

  const doTransform = async (algoKey, type, config) => {
    let resultText = selectedText.text;
    
    if (type === 'decrypt') {
      try {
        resultText = await applyTransform({ key: algoKey, direction: 'decode', value: selectedText.text, config });
      } catch (e) {
        message.warning(`解密失败，将直接包裹标签: ${e.message}`);
      }
    }
    
    const paramStr = Object.keys(config || {}).length ? Object.entries(config).map(([k, v]) => `${k}=${v}`).join(',') : '';
    const tagAction = type === 'encrypt' ? 'enc' : 'dec';
    const wrapped = wrapTag(`${tagAction}:${algoKey}`, resultText, paramStr);
    
    const { newText } = commitReplacement(value, selectedText.start, selectedText.end, wrapped);
    const innerStart = selectedText.start + wrapped.indexOf(resultText);
    pendingSelectRef.current = { start: innerStart, end: innerStart + resultText.length };
    
    onChange(newText);
    message.success(`已应用${type === 'encrypt' ? '加密' : '解密'}`);
    setPickerOpen(false);
    setParamModal({ visible: false, action: null });
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      await doTransform(paramModal.action.algoKey, paramModal.action.type, values);
    } catch {}
  };

  const handleVarOk = async () => {
    try {
      const { name } = await varForm.validateFields();
      const wrapped = wrapTag(`var:${name}`, selectedText.text);
      const { newText } = commitReplacement(value, selectedText.start, selectedText.end, wrapped);
      onChange(newText);
      message.success(`已提取变量：${name}`);
      setVarModal({ visible: false });
    } catch {}
  };

  const styles = `
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `;

  return (
    <Flex vertical style={{ background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden', width: '100%', height: '100%' }}>
      <style>{styles}</style>
      
      <Flex justify="space-between" align="center" style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Space size={4}>
          <TagOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 12 }}>Hackvertor 编辑器</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>（选中文字右键选择算法）</Text>
        </Space>
        <Space>{isRendering && <Text type="secondary" style={{ fontSize: 11 }}>计算中...</Text>}</Space>
      </Flex>

      <div style={{ display: 'flex', flex: 1, minHeight: minRows * 22, overflow: 'hidden' }}>
        
        <div style={{ flex: 1, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontSize: 11, color: '#888', flexShrink: 0 }}>
            <CodeOutlined /> 报文编辑（明文，可继续修改加标签）
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <pre
              ref={preRef}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlightText(value || '') + '\n\n\n\n' }}
              style={{
                ...commonEditorStyle,
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                color: '#333', background: 'transparent', pointerEvents: 'none',
                overflow: 'hidden'
              }}
            />
            <textarea
              ref={textareaRef}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              onContextMenu={handleContextMenu}
              onScroll={handleScroll}
              readOnly={readOnly}
              spellCheck="false"
              className="hide-scrollbar"
              style={{
                ...commonEditorStyle,
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                width: '100%', height: '100%',
                color: 'transparent', caretColor: '#000', background: 'transparent', 
                resize: 'none', overflow: 'auto'
              }}
              placeholder={placeholder}
            />
          </div>
        </div>

        <div style={{ flex: 1, background: '#f6ffed', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '4px 8px', background: '#d9f7be', borderBottom: '1px solid #b7eb8f', fontSize: 11, color: '#389e0d', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            <Space size={4}><SafetyCertificateOutlined /><span>最终发送报文（已执行所有加密）</span></Space>
          </div>
          <pre style={{ flex: 1, margin: 0, padding: 12, fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, lineHeight: '1.6', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflow: 'auto', color: '#237804' }}>
            {renderedValue || '（空）'}
          </pre>
        </div>
      </div>

      <Modal title="选择算法或操作" open={pickerOpen} onCancel={() => setPickerOpen(false)} footer={null} width={700} styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', height: 450 }}>
          <div style={{ width: 180, borderRight: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12 }}>
              <Button type={pickerMode === 'decrypt' ? 'primary' : 'default'} block style={{ marginBottom: 8 }} onClick={() => setPickerMode('decrypt')}>⬇️ 解密 / 解码 / 运算</Button>
              <Button type={pickerMode === 'encrypt' ? 'primary' : 'default'} block onClick={() => setPickerMode('encrypt')}>⬆️ 加密 / 编码</Button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {Object.entries(TRANSFORM_GROUPS).map(([g, label]) => {
                if (!groupedAlgos[g]) return null;
                return <div key={g} style={{ padding: '8px 12px', fontWeight: 500, color: '#1677ff' }}>{label}</div>;
              })}
              {groupedAlgos['script'] && <div style={{ padding: '8px 12px', fontWeight: 500, color: '#fa8c16' }}>⚙️ 主进程自定义脚本</div>}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
              <Input prefix={<SearchOutlined />} placeholder="搜索算法或脚本..." value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {Object.entries(groupedAlgos).map(([g, list]) => (
                <div key={g} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{g === 'script' ? '主进程自定义脚本' : TRANSFORM_GROUPS[g]}</div>
                  <List dataSource={list} renderItem={(item) => (
                    <List.Item onClick={() => applyAlgo(item)} style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 6, background: '#fff', border: '1px solid #f0f0f0', marginBottom: 6 }}>
                      <Text>{item.label}</Text>
                    </List.Item>
                  )} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal title={<span>配置参数：<Tag color="blue">{TRANSFORMS[paramModal.action?.algoKey]?.label}</Tag></span>} open={paramModal.visible} onOk={handleModalOk} onCancel={() => setParamModal({ visible: false, action: null })} okText="应用并计算" destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {paramModal.action && TRANSFORMS[paramModal.action.algoKey]?.configFields?.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={[{ required: f.required, message: `请输入 ${f.label}` }]}>
              {f.multiline ? <Input.TextArea rows={6} /> : <Input placeholder={f.defaultValue || ''} />}
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <Modal title="提取为变量" open={varModal.visible} onOk={handleVarOk} onCancel={() => setVarModal({ visible: false })} okText="提取">
        <Form form={varForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="变量名（供 JS 表达式调用）" rules={[{ required: true, pattern: /^[a-zA-Z0-9_]+$/, message: '只能包含字母数字下划线' }]}>
            <Input placeholder="例如 uid" />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}