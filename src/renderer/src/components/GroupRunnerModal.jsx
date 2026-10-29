import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Flex, Button, Tag, Switch, InputNumber, Divider,
  Typography, Alert, Empty, App as AntApp, Tooltip,
} from 'antd';
import {
  PlayCircleOutlined, StopOutlined, ClockCircleOutlined, ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { buildHeadersFromEntry, buildBodyFromEntry } from '../utils/httpShared';
import { formatBytes, statusColor } from '../utils/har';
import { applyAssignmentsToEntry } from '../utils/applyAssignments';
import { useAlgorithms } from '../store/algorithmStore';

const { Text: AntText } = Typography;

const METHOD_COLOR = {
  GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red',
  PATCH: 'purple', HEAD: 'default', OPTIONS: 'default',
};

function statusTag(status) {
  switch (status) {
    case 'pending': return <Tag>待发送</Tag>;
    case 'running': return <Tag color="processing">发送中…</Tag>;
    case 'success': return <Tag color="success">成功</Tag>;
    case 'error': return <Tag color="error">失败</Tag>;
    case 'skipped': return <Tag color="default">跳过</Tag>;
    default: return <Tag>{status}</Tag>;
  }
}

async function sendRequest(entry) {
  const req = entry.request || {};
  const method = (req.method || 'GET').toUpperCase();
  const headers = buildHeadersFromEntry(req);
  const body = buildBodyFromEntry(req, method);
  const started = performance.now();

  console.log('[SEND]', { url: req.url, method, headers, body });

  if (window.electronAPI?.httpRequest) {
    const r = await window.electronAPI.httpRequest({ url: req.url, method, headers, body });
    return { ...r, time: r.time || Math.round(performance.now() - started) };
  }
  const res = await fetch(req.url, { method, headers, body });
  const text = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()].map(([k, v]) => ({ name: k, value: v })),
    body: text,
    time: Math.round(performance.now() - started),
  };
}

export default function GroupRunnerModal({
  open, onClose, groupName, requests, projectId,
  onUpdateRequestFields, onApplyResponse, onReset,
}) {
  const { message } = AntApp.useApp();
  const { getEffectiveConfigMap } = useAlgorithms();

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [loop, setLoop] = useState(false);
  const [intervalSec, setIntervalSec] = useState(60);
  const [stopOnError, setStopOnError] = useState(true);
  const [currentRound, setCurrentRound] = useState(0);
  const [expandedStep, setExpandedStep] = useState(null);

  const stopRef = useRef(false);
  const loopTimerRef = useRef(null);
  const requestsRef = useRef(requests);
  useEffect(() => { requestsRef.current = requests; }, [requests]);

  const configMap = useMemo(
    () => getEffectiveConfigMap(projectId),
    [getEffectiveConfigMap, projectId]
  );
  const configMapRef = useRef(configMap);
  useEffect(() => { configMapRef.current = configMap; }, [configMap]);

  const initSteps = (list) => list.map((r, i) => ({
    index: i, uid: r._uid,
    method: r.request?.method || 'GET',
    url: r.request?.url || '',
    sentUrl: null, status: 'pending', response: null, elapsed: null, error: null,
  }));

  useEffect(() => {
    if (open) {
      stopRef.current = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      setRunning(false);
      setCurrentRound(0);
      setSteps(initSteps(requestsRef.current));
      setExpandedStep(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateStep = (index, patch) => {
    setSteps((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };

  const runOnce = async (roundIndex) => {
    setSteps(initSteps(requestsRef.current));
    setCurrentRound(roundIndex);

    // 本轮上下文：每个 step 的响应累积进去
    const context = { steps: [] };

    for (let i = 0; i < requestsRef.current.length; i++) {
      if (stopRef.current) {
        setSteps((prev) => prev.map((s, idx) =>
          idx >= i && s.status === 'pending' ? { ...s, status: 'skipped' } : s
        ));
        return { aborted: true };
      }

      const entry = requestsRef.current[i];
      updateStep(i, { status: 'running', error: null });

      try {
        context.currentStep = i;

        const { request: sentRequest, writableUpdates } =
          await applyAssignmentsToEntry(
            entry,
            entry._parseAssignments || [],
            configMapRef.current,
            context
          );

        if (writableUpdates.length > 0) {
          onUpdateRequestFields?.(entry._uid, writableUpdates);
        }

        updateStep(i, { sentUrl: sentRequest.url });

        const result = await sendRequest({ ...entry, request: sentRequest });

        // 把本次响应放进 context（索引与 entry index 对齐）
        context.steps[i] = { index: i, response: result };

        const nextResponse = {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers || [],
          content: {
            text: result.body || '',
            size: new Blob([result.body || '']).size,
          },
        };
        onApplyResponse?.(entry._uid, nextResponse);

        updateStep(i, { status: 'success', response: result, elapsed: result.time });

        if (stopOnError && result.status >= 400) {
          setSteps((prev) => prev.map((s, idx) =>
            idx > i && s.status === 'pending' ? { ...s, status: 'skipped' } : s
          ));
          message.warning(`请求 #${i + 1} 返回 ${result.status}，已中止`);
          return { aborted: true };
        }
      } catch (e) {
        updateStep(i, { status: 'error', error: String(e?.message || e) });
        setSteps((prev) => prev.map((s, idx) =>
          idx > i && s.status === 'pending' ? { ...s, status: 'skipped' } : s
        ));
        message.error(`请求 #${i + 1} 失败：${e?.message || e}`);
        return { aborted: true };
      }
    }
    return { aborted: false };
  };

  const startLoop = async () => {
    stopRef.current = false;
    setRunning(true);
    let round = 0;
    const loopFn = async () => {
      round += 1;
      const { aborted } = await runOnce(round);
      if (stopRef.current) { setRunning(false); return; }
      if (!loop) { setRunning(false); return; }
      if (aborted && !loop) { setRunning(false); return; }
      loopTimerRef.current = setTimeout(() => {
        if (!stopRef.current) loopFn();
        else setRunning(false);
      }, intervalSec * 1000);
    };
    await loopFn();
  };

  const stopAll = () => {
    stopRef.current = true;
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null; }
    setRunning(false);
  };

  const handleReset = () => {
    if (running) { message.warning('请先停止再重置'); return; }
    onReset?.();
    setSteps(initSteps(requestsRef.current));
    setCurrentRound(0);
    message.success('已恢复到初始请求');
  };

  useEffect(() => () => {
    stopRef.current = true;
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
  }, []);

  const requestCount = requestsRef.current.length;

  return (
    <Modal
      open={open}
      onCancel={() => { stopAll(); onClose?.(); }}
      width={1000}
      destroyOnHidden
      footer={null}
      title={
        <Flex align="center" gap={8}>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>按顺序执行请求组 · {groupName || '-'}</span>
          <Tag>{requestCount} 条</Tag>
          {currentRound > 0 && <Tag color="processing">第 {currentRound} 轮</Tag>}
        </Flex>
      }
    >
      <Flex gap={10} wrap align="center" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />}
          loading={running && !loop}
          disabled={running || requestCount === 0}
          onClick={startLoop}>开始执行</Button>
        <Button danger icon={<StopOutlined />} onClick={stopAll} disabled={!running}>停止</Button>
        <Tooltip title="恢复所有请求到初始状态（保留算法链）">
          <Button icon={<ReloadOutlined />} onClick={handleReset} disabled={running}>重置</Button>
        </Tooltip>
        <Divider type="vertical" />
        <AntText style={{ fontSize: 12 }}>循环执行</AntText>
        <Switch size="small" checked={loop} onChange={setLoop} disabled={running} />
        <AntText style={{ fontSize: 12 }}>间隔</AntText>
        <InputNumber size="small" min={1} max={86400}
          value={intervalSec}
          onChange={(v) => setIntervalSec(v || 1)}
          disabled={running}
          addonAfter="秒" style={{ width: 120 }} />
        <Divider type="vertical" />
        <AntText style={{ fontSize: 12 }}>失败即中止</AntText>
        <Switch size="small" checked={stopOnError} onChange={setStopOnError} disabled={running} />
      </Flex>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="算法链上下文"
        description={
          <div style={{ fontSize: 12 }}>
            「从响应取值」算法可引用本轮任意前序请求的响应（输入请求序号，从 0 开始）；
            「JS 表达式」「主进程脚本」可直接操作 <code>responses</code> 数组。
            链里每一步的输出是下一步的输入。
          </div>
        }
      />

      {requestCount === 0 ? (
        <Empty description="该请求组还没有请求" />
      ) : (
        <div style={{ maxHeight: 480, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          {steps.map((s) => (
            <div key={`${s.uid}-${s.index}`} style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5' }}>
              <Flex align="center" gap={8} wrap>
                <Tag style={{ minWidth: 28, textAlign: 'center', margin: 0 }}>{s.index + 1}</Tag>
                <Tag color={METHOD_COLOR[s.method] || 'default'} style={{ margin: 0 }}>{s.method}</Tag>
                {statusTag(s.status)}
                <AntText ellipsis style={{ flex: 1, minWidth: 0, fontSize: 12 }} title={s.sentUrl || s.url}>
                  {s.sentUrl || s.url}
                </AntText>
                {s.response && (
                  <Tag color={statusColor(s.response.status)} style={{ margin: 0 }}>{s.response.status}</Tag>
                )}
                {s.elapsed != null && (
                  <AntText type="secondary" style={{ fontSize: 11 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />{s.elapsed} ms
                  </AntText>
                )}
                {s.response && (
                  <AntText type="secondary" style={{ fontSize: 11 }}>
                    {formatBytes(new Blob([s.response.body || '']).size)}
                  </AntText>
                )}
                {s.response && (
                  <Button size="small" type="link"
                    onClick={() => setExpandedStep(expandedStep === s.index ? null : s.index)}>
                    {expandedStep === s.index ? '收起' : '查看响应'}
                  </Button>
                )}
              </Flex>
              {s.error && <Alert type="error" showIcon style={{ marginTop: 6, marginLeft: 60 }} message={s.error} />}
              {expandedStep === s.index && s.response && (
                <div style={{ marginTop: 6, marginLeft: 60 }}>
                  <AntText type="secondary" style={{ fontSize: 11 }}>响应头</AntText>
                  <pre style={preStyle}>
                    {(s.response.headers || []).map((h) => `${h.name}: ${h.value}`).join('\n') || '（无）'}
                  </pre>
                  <AntText type="secondary" style={{ fontSize: 11 }}>响应体</AntText>
                  <pre style={preStyle}>{prettyMaybe(s.response.body)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const preStyle = {
  margin: '4px 0 8px', padding: 8, fontSize: 11, lineHeight: 1.5,
  background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4,
  maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
};

function prettyMaybe(str) {
  if (!str) return '（空）';
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}