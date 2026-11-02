// src/renderer/src/components/HackvertorEditor.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Flex, Modal, Form, Input, Tag, Space, Typography, App, List, Button, Splitter, Segmented, Tooltip, Switch, Empty } from 'antd';
import {
  TagOutlined, CodeOutlined, SafetyCertificateOutlined, SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  AppstoreOutlined, GlobalOutlined, InboxOutlined,
  FileZipOutlined, FileTextOutlined, LockOutlined, SafetyOutlined,
  ClockCircleOutlined, CalculatorOutlined, ApiOutlined,
} from '@ant-design/icons';
import { processTags, wrapTag } from '../utils/hackTags';
import { TRANSFORMS, TRANSFORM_GROUPS, applyTransform, getAlgoTagType } from '../utils/strictTransforms';
import { useScripts } from '../store/scriptStore';
import { useEnvs } from '../store/envStore';
import { useAlgorithms } from '../store/algorithmStore';
import { validateTagText } from '../utils/validateTags';

const { Text } = Typography;

// 分组图标映射
const GROUP_ICON_MAP = {
  encoding: <FileZipOutlined />,
  format: <FileTextOutlined />,
  crypto: <LockOutlined />,
  hash: <SafetyOutlined />,
  time: <ClockCircleOutlined />,
  number: <CalculatorOutlined />,
  app: <ApiOutlined />,
};

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
    const tag = open || close;
    if (tag) {
      if (tag.startsWith('op:')) color = '#cf1322';
      else if (tag.startsWith('enc:')) color = '#389e0d';
      else if (tag.startsWith('var:')) color = '#1677ff';
      else if (tag.startsWith('script:')) color = '#fa8c16';
      else if (tag.startsWith('env:')) color = '#eb2f96';
    }
    return `<span style="color: ${color};">${match}</span>`;
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

function JsonTree({ data, isRoot = false }) {
  if (data === null) return <span style={{ color: '#999' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color: '#fa8c16' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: '#1677ff' }}>{data}</span>;
  if (typeof data === 'string') return <span style={{ color: '#389e0d' }}>"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <details open={isRoot || data.length < 5} style={{ display: 'inline-block', width: '100%' }}>
        <summary style={{ cursor: 'pointer', color: '#888', outline: 'none' }}>Array[{data.length}]</summary>
        <div style={{ paddingLeft: 16, borderLeft: '1px dashed #d9d9d9', marginLeft: 4 }}>
          {data.map((item, i) => (
            <div key={i} style={{ margin: '4px 0' }}>
              <span style={{ color: '#888' }}>{i}: </span>
              <JsonTree data={item} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span>{'{}'}</span>;
    return (
      <details open={isRoot || keys.length < 5} style={{ display: 'inline-block', width: '100%' }}>
        <summary style={{ cursor: 'pointer', color: '#888', outline: 'none' }}>Object {'{'}...{'}'}</summary>
        <div style={{ paddingLeft: 16, borderLeft: '1px dashed #d9d9d9', marginLeft: 4 }}>
          {keys.map((key) => (
            <div key={key} style={{ margin: '4px 0' }}>
              <span style={{ color: '#722ed1', fontWeight: 500 }}>"{key}": </span>
              <JsonTree data={data[key]} />
            </div>
          ))}
        </div>
      </details>
    );
  }

  return <span>{String(data)}</span>;
}

export default function HackvertorEditor({ value, onChange, placeholder, readOnly = false, groupConfigs = {}, onSaveGroupConfig }) {
  const { message } = App.useApp();
  const { scripts } = useScripts();
  const { envs } = useEnvs();
  const { algorithms } = useAlgorithms();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');   // 💡 左侧选中的分类
  const [selectedText, setSelectedText] = useState({ text: '', start: 0, end: 0 });
  const [paramModal, setParamModal] = useState({ visible: false, action: null });

  const [varModal, setVarModal] = useState({ visible: false });
  const [varForm] = Form.useForm();

  const [renderedValue, setRenderedValue] = useState('');
  const [renderedJson, setRenderedJson] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const [previewMode, setPreviewMode] = useState('text');
  const [validationIssues, setValidationIssues] = useState([]);

  const [form] = Form.useForm();
  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const pendingSelectRef = useRef(null);
  const userToggledPreviewRef = useRef(false);

  useEffect(() => {
    let canceled = false;
    setIsRendering(true);
    processTags(value || '', { scripts, envs, vars: {}, responses: [] })
      .then((res) => {
        if (canceled) return;
        if (res instanceof Uint8Array) {
           setRenderedValue(`[Binary Data (${res.length} bytes)]`);
           setRenderedJson(null);
           setPreviewMode('text');
           return;
        }
        setRenderedValue(res);
        try {
          const parsed = JSON.parse(res);
          setRenderedJson(parsed);
          if (!userToggledPreviewRef.current && typeof parsed === 'object' && parsed !== null) setPreviewMode('tree');
        } catch {
          setRenderedJson(null);
          if (!userToggledPreviewRef.current) setPreviewMode('text');
        }
      })
      .catch((err) => { if (!canceled) setRenderedValue(`[渲染错误: ${err.message}]`); })
      .finally(() => { if (!canceled) setIsRendering(false); });
    return () => { canceled = true; };
  }, [value, scripts, envs]);

  useEffect(() => {
    const globalAlgos = algorithms.global || {};
    const issues = validateTagText(value || '', { envs, scripts, globalAlgos });
    setValidationIssues(issues);
  }, [value, envs, scripts, algorithms.global]);

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
    setSearchText('');
    setSelectedGroup('all');     // 💡 每次打开重置分类
    setPickerOpen(true);
  };

  // 过滤后的算法（不含 env / var）
  const filteredAlgos = useMemo(() => {
    const kw = searchText.toLowerCase().trim();
    const builtin = Object.entries(TRANSFORMS)
      .filter(([k, v]) => !kw || v.label.toLowerCase().includes(kw) || k.toLowerCase().includes(kw))
      .map(([k, v]) => ({ key: k, type: 'builtin', label: v.label, group: v.group || 'other', tpl: v }));

    const customScripts = Object.entries(scripts || {})
      .filter(([k, v]) => !kw || (v.label || k).toLowerCase().includes(kw) || k.toLowerCase().includes(kw))
      .map(([k, v]) => ({
        key: k,
        type: 'script',
        label: v.label || k,
        group: 'script',
        tpl: v,
      }));

    return [...builtin, ...customScripts];
  }, [searchText, scripts]);

  const groupedAlgos = useMemo(() => {
    const groups = {};
    filteredAlgos.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [filteredAlgos]);

  // 💡 左侧分类项（可点击）
  const categoryItems = useMemo(() => {
    const items = [
      {
        key: 'all',
        label: '全部算法',
        icon: <AppstoreOutlined />,
        count: filteredAlgos.length,
      },
    ];

    Object.entries(TRANSFORM_GROUPS).forEach(([g, label]) => {
      if (!groupedAlgos[g]) return;
      items.push({
        key: g,
        label,
        icon: GROUP_ICON_MAP[g] || <AppstoreOutlined />,
        count: groupedAlgos[g].length,
      });
    });

    items.push({
      key: 'env',
      label: '环境变量',
      icon: <GlobalOutlined />,
      count: Object.keys(envs).length,
      divider: true,
    });
    items.push({
      key: 'var',
      label: '提取为变量',
      icon: <InboxOutlined />,
      count: null,
    });

    if (groupedAlgos['script']?.length > 0) {
      items.push({
        key: 'script',
        label: '主进程脚本',
        icon: <CodeOutlined />,
        count: groupedAlgos['script'].length,
        divider: true,
      });
    }

    return items;
  }, [filteredAlgos, groupedAlgos, envs]);

  // 💡 当前右侧要显示的内容
  const displayItems = useMemo(() => {
    const kw = searchText.toLowerCase().trim();

    // 搜索时：算法 + env 一起搜
    if (kw) {
      const envMatches = Object.keys(envs)
        .filter((k) => k.toLowerCase().includes(kw))
        .map((k) => ({
          key: k,
          type: 'env',
          label: k,
          description: `当前值：${envs[k] || '（空）'}`,
        }));
      return [...filteredAlgos, ...envMatches];
    }

    if (selectedGroup === 'all') return filteredAlgos;

    if (selectedGroup === 'env') {
      return Object.keys(envs).map((k) => ({
        key: k,
        type: 'env',
        label: k,
        description: `当前值：${envs[k] || '（空）'}`,
      }));
    }

    if (selectedGroup === 'var') {
      return [{
        key: '__extract_var__',
        type: 'var',
        label: '📦 提取为变量',
        description: '把选中文本存入 vars，后续 <@script> 标签可用 vars.变量名 读取',
      }];
    }

    return groupedAlgos[selectedGroup] || [];
  }, [filteredAlgos, groupedAlgos, selectedGroup, searchText, envs]);

  // 💡 点击某个条目
  const applyAlgo = async (item) => {
    // 提取为变量
    if (item.type === 'var') {
      setVarModal({ visible: true });
      setPickerOpen(false);
      return;
    }

    // 插入环境变量
    if (item.type === 'env') {
      const envKey = item.key;
      const wrapped = wrapTag(`env:${envKey}`, selectedText.text);
      const { newText } = commitReplacement(value, selectedText.start, selectedText.end, wrapped);
      const innerStart = selectedText.start + wrapped.indexOf(selectedText.text);
      pendingSelectRef.current = { start: innerStart, end: innerStart + selectedText.text.length };
      onChange(newText);
      message.success(`已插入环境变量 ${envKey}`);
      setPickerOpen(false);
      return;
    }

    // 主进程脚本
    if (item.type === 'script') {
      const resultText = selectedText.text;
      const wrapped = wrapTag(`script:${item.key}`, resultText);
      const { newText } = commitReplacement(value, selectedText.start, selectedText.end, wrapped);
      const innerStart = selectedText.start + wrapped.indexOf(resultText);
      pendingSelectRef.current = { start: innerStart, end: innerStart + resultText.length };
      onChange(newText);
      message.success(`已添加主进程脚本`);
      setPickerOpen(false);
      return;
    }

    // 内置算法
    const tpl = item.tpl;
    if (tpl?.configFields?.length) {
      const savedConfig = groupConfigs[item.key];
      const hasAllRequired = tpl.configFields.every(f => !f.required || (savedConfig && savedConfig[f.name]));
      if (savedConfig && hasAllRequired) {
        doTransform(item.key, savedConfig);
      } else {
        form.resetFields();
        const defaults = savedConfig || {};
        tpl.configFields.forEach((f) => { if (f.defaultValue && !defaults[f.name]) defaults[f.name] = f.defaultValue; });
        form.setFieldsValue(defaults);
        setParamModal({ visible: true, action: { algoKey: item.key } });
        setPickerOpen(false);
      }
    } else {
      doTransform(item.key, {});
    }
  };

  const doTransform = async (algoKey, config) => {
    const tpl = TRANSFORMS[algoKey];
    const paramStr = Object.keys(config || {}).length ? Object.entries(config).map(([k, v]) => `${k}=${v}`).join(',') : '';
    const tagType = getAlgoTagType(algoKey);
    let resultText = selectedText.text;
    let finalReplaceText = '';
    if (tagType === 'op') finalReplaceText = wrapTag(`op:${algoKey}`, resultText, paramStr);
    else finalReplaceText = wrapTag(`enc:${algoKey}`, resultText, paramStr);
    const { newText } = commitReplacement(value, selectedText.start, selectedText.end, finalReplaceText);
    const innerStart = selectedText.start + finalReplaceText.indexOf(resultText);
    pendingSelectRef.current = { start: innerStart, end: innerStart + resultText.length };
    onChange(newText);
    message.success(`已应用算法: ${tpl?.label || algoKey}`);
    setPickerOpen(false);
    setParamModal({ visible: false, action: null });
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const algoKey = paramModal.action.algoKey;
      if (onSaveGroupConfig) onSaveGroupConfig(algoKey, values);
      await doTransform(algoKey, values);
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
    .json-tree-container::-webkit-scrollbar { width: 6px; height: 6px; }
    .json-tree-container::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 4px; }
    .algo-picker-side::-webkit-scrollbar { width: 4px; }
    .algo-picker-side::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }
  `;

  const errorCount = validationIssues.filter((x) => x.level === 'error').length;
  const warnCount = validationIssues.filter((x) => x.level === 'warn').length;

  return (
    <Flex vertical style={{ background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden', width: '100%', height: '100%' }}>
      <style>{styles}</style>

      <Flex justify="space-between" align="center" style={{ padding: '4px 8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Space size={4}>
          <TagOutlined style={{ color: '#1677ff' }} />
          <Text strong style={{ fontSize: 12 }}>Hackvertor 编辑器</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>（选中文字右键选择算法）</Text>
          {validationIssues.length === 0 ? (
            <Tag color="success" style={{ marginLeft: 4 }}>✓ 语法正确</Tag>
          ) : (
            <Tooltip
              placement="bottomLeft"
              title={
                <div style={{ maxHeight: 260, overflow: 'auto' }}>
                  {validationIssues.map((iss, i) => (
                    <div key={i} style={{ marginBottom: 4, color: iss.level === 'error' ? '#ffccc7' : '#fff7c0' }}>
                      {iss.level === 'error' ? '❌' : '⚠️'} {iss.message}
                    </div>
                  ))}
                </div>
              }
            >
              <Tag color={errorCount > 0 ? 'error' : 'warning'} style={{ marginLeft: 4, cursor: 'help' }}>
                {errorCount > 0 ? `${errorCount} 错` : ''}{errorCount > 0 && warnCount > 0 ? ' · ' : ''}{warnCount > 0 ? `${warnCount} 警` : ''}
              </Tag>
            </Tooltip>
          )}
        </Space>
        <Space>{isRendering && <Text type="secondary" style={{ fontSize: 11 }}>计算中...</Text>}</Space>
      </Flex>

      <Splitter style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Splitter.Panel defaultSize="50%" min="25%">
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
        </Splitter.Panel>

        <Splitter.Panel>
          <div style={{ height: '100%', background: '#f6ffed', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Flex justify="space-between" align="center" style={{ padding: '4px 8px', background: '#d9f7be', borderBottom: '1px solid #b7eb8f', fontSize: 11, color: '#389e0d', flexShrink: 0 }}>
              <Space size={4}>
                <SafetyCertificateOutlined />
                <span>最终发送报文（已执行所有加密）</span>
              </Space>
              {renderedJson !== null && (
                <Segmented
                  size="small"
                  options={[
                    { label: '文本', value: 'text', icon: <MenuUnfoldOutlined /> },
                    { label: '树形', value: 'tree', icon: <MenuFoldOutlined /> }
                  ]}
                  value={previewMode}
                  onChange={(v) => { userToggledPreviewRef.current = true; setPreviewMode(v); }}
                />
              )}
            </Flex>

            <div className="json-tree-container" style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {previewMode === 'tree' && renderedJson !== null ? (
                <div style={{ fontSize: 13, fontFamily: 'Consolas, Monaco, monospace' }}>
                  <JsonTree data={renderedJson} isRoot />
                </div>
              ) : (
                <pre style={{ margin: 0, fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#237804' }}>
                  {renderedValue || '（空）'}
                </pre>
              )}
            </div>
          </div>
        </Splitter.Panel>
      </Splitter>

      {/* 💡 重做的算法选择器 */}
      <Modal
        title={<Space><TagOutlined style={{ color: '#1677ff' }} /><span>选择算法、变量或脚本</span></Space>}
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
        width={760}
        styles={{ body: { padding: 0 } }}
        destroyOnHidden
      >
        <div style={{ display: 'flex', height: 500 }}>
          {/* 左侧分类栏 */}
          <div
            className="algo-picker-side"
            style={{
              width: 200,
              borderRight: '1px solid #f0f0f0',
              background: '#fafafa',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            {categoryItems.map((cat, idx) => {
              const isActive = selectedGroup === cat.key && !searchText.trim();
              return (
                <React.Fragment key={cat.key}>
                  {cat.divider && <div style={{ height: 1, background: '#f0f0f0', margin: '4px 12px' }} />}
                  <div
                    onClick={() => {
                      setSelectedGroup(cat.key);
                      setSearchText('');
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isActive ? '#e6f4ff' : 'transparent',
                      color: isActive ? '#1677ff' : '#333',
                      fontWeight: isActive ? 500 : 'normal',
                      borderRight: isActive ? '2px solid #1677ff' : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Space size={6}>
                      {cat.icon}
                      <span>{cat.label}</span>
                    </Space>
                    {cat.count != null && (
                      <span style={{
                        fontSize: 11,
                        color: isActive ? '#1677ff' : '#999',
                        background: isActive ? '#fff' : 'transparent',
                        padding: '0 6px',
                        borderRadius: 8,
                        minWidth: 20,
                        textAlign: 'center',
                      }}>
                        {cat.count}
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* 右侧内容 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: 12, borderBottom: '1px solid #f0f0f0' }}>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索算法、脚本或环境变量..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {displayItems.length === 0 ? (
                <Empty
                  description={selectedGroup === 'env' ? '暂无环境变量（可在「算法配置 → 环境变量」中添加）' : '没有匹配项'}
                  style={{ marginTop: 60 }}
                />
              ) : (
                <List
                  dataSource={displayItems}
                  renderItem={(item) => (
                    <List.Item
                      onClick={() => applyAlgo(item)}
                      style={{
                        cursor: 'pointer',
                        padding: '10px 12px',
                        borderRadius: 6,
                        background: '#fff',
                        border: '1px solid #f0f0f0',
                        marginBottom: 6,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.background = '#f0f8ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.background = '#fff'; }}
                    >
                      <div style={{ width: '100%' }}>
                        <Flex align="center" gap={6} wrap>
                          <Text strong>{item.label}</Text>
                          {item.type === 'env' && <Tag color="magenta" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>ENV</Tag>}
                          {item.type === 'var' && <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>VAR</Tag>}
                          {item.type === 'script' && <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>SCRIPT</Tag>}
                        </Flex>
                        {item.description && (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 3, wordBreak: 'break-all' }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 算法参数配置 Modal */}
      <Modal
        title={<span>配置参数：<Tag color="blue">{TRANSFORMS[paramModal.action?.algoKey]?.label}</Tag></span>}
        open={paramModal.visible}
        onOk={handleModalOk}
        onCancel={() => setParamModal({ visible: false, action: null })}
        okText="应用并记忆"
        width={paramModal.action?.algoKey === 'js-expression' ? 800 : 520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {paramModal.action?.algoKey === 'js-expression' && (
            <div style={{ marginBottom: 16, padding: 12, background: '#e6f4ff', borderRadius: 6, border: '1px solid #91caff' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>💡 快捷提取向导：</Text>
              <Space wrap>
                <Button size="small" onClick={() => {
                  const val = form.getFieldValue('code') || '';
                  form.setFieldsValue({ code: val + `\nconst data0 = JSON.parse(responses[0]?.body || '{}');\nreturn data0.token;` });
                }}>从请求0取token</Button>
                <Button size="small" onClick={() => {
                  const val = form.getFieldValue('code') || '';
                  form.setFieldsValue({ code: val + `\nreturn await md5(vars.uid + vars.ts);` });
                }}>计算MD5签名</Button>
              </Space>
            </div>
          )}
          {paramModal.action && TRANSFORMS[paramModal.action.algoKey]?.configFields?.map((f) => {
            if (f.type === 'boolean') {
              return (
                <Form.Item
                  key={f.name}
                  name={f.name}
                  label={f.label}
                  valuePropName="checked"
                  getValueProps={(v) => ({ checked: v === 'true' || v === true })}
                  getValueFromEvent={(checked) => (checked ? 'true' : 'false')}
                >
                  <Switch size="small" checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
              );
            }
            return (
              <Form.Item key={f.name} name={f.name} label={f.label} rules={[{ required: f.required, message: `请输入 ${f.label}` }]}>
                {f.multiline ? (
                  <Input.TextArea
                    rows={paramModal.action?.algoKey === 'js-expression' ? 12 : 6}
                    style={{ fontFamily: 'monospace' }}
                    placeholder={f.placeholder || ''}
                    spellCheck={false}
                  />
                ) : (
                  <Input placeholder={f.placeholder || f.defaultValue || ''} spellCheck={false} />
                )}
              </Form.Item>
            );
          })}
        </Form>
      </Modal>

      {/* 提取为变量 Modal */}
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