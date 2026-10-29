import { smartParse, smartParseToString } from './smartParse';

// ============ 辅助 ============
function b64ToBytes(b64) {
  const n = String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const p = n + '==='.slice((n.length + 3) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const clean = String(hex).replace(/\s/g, '');
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error('不是合法的 Hex');
  return new Uint8Array(clean.match(/.{2}/g).map((b) => parseInt(b, 16)));
}
function toUint8(s) { return new TextEncoder().encode(s || ''); }
function fromUint8(bytes) { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }

export const PARSER_TEMPLATES = {
  // ============ 编码 / 解码 ============
  'base64-decode': {
    label: 'Base64 解码', group: 'encode', configFields: null,
    fn: (s) => { if (!s) return '（空）'; try { return fromUint8(b64ToBytes(s)); } catch { return '（不是合法的 Base64）'; } },
  },
  'base64-encode': {
    label: 'Base64 编码', group: 'encode', configFields: null,
    fn: (s) => { try { return bytesToB64(toUint8(s)); } catch { return '（编码失败）'; } },
  },
  'url-decode': {
    label: 'URL 解码', group: 'encode', configFields: null,
    fn: (s) => { try { return decodeURIComponent(s); } catch { return '（不是合法的 URL 编码）'; } },
  },
  'url-encode': {
    label: 'URL 编码', group: 'encode', configFields: null,
    fn: (s) => { try { return encodeURIComponent(s); } catch { return '（编码失败）'; } },
  },
  'hex-decode': {
    label: 'Hex 解码', group: 'encode', configFields: null,
    fn: (s) => { try { return fromUint8(hexToBytes(s)); } catch { return '（不是合法的 Hex）'; } },
  },
  'hex-encode': {
    label: 'Hex 编码', group: 'encode', configFields: null,
    fn: (s) => { try { return bytesToHex(toUint8(s)); } catch { return '（编码失败）'; } },
  },
  'unicode-decode': {
    label: 'Unicode 解码', group: 'encode', configFields: null,
    fn: (s) => String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16))),
  },
  'json-format': {
    label: 'JSON 格式化', group: 'encode', configFields: null,
    fn: (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return '（不是合法的 JSON）'; } },
  },
  'json-try-parse': {
    label: 'JSON 尝试解析', group: 'encode', configFields: null,
    fn: (s) => {
      const str = String(s ?? '');
      try {
        const v = JSON.parse(str);
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      } catch { return str; }
    },
  },
  'json-stringify': {
    label: 'JSON 序列化', group: 'encode', configFields: null,
    fn: (s) => {
      const str = String(s ?? '');
      try { return JSON.stringify(JSON.parse(str)); } catch { return JSON.stringify(str); }
    },
  },
  'json-path': {
    label: 'JSON 路径取值', group: 'encode',
    configFields: [{ name: 'path', label: '路径（如 data.sign）', required: true, multiline: false }],
    fn: (s, cfg) => {
      let value;
      try { value = JSON.parse(String(s ?? '')); }
      catch { return '（输入不是 JSON）'; }
      for (const k of String(cfg.path || '').split('.').map((x) => x.trim()).filter(Boolean)) {
        if (value == null) return '';
        if (typeof value === 'string') {
          try { value = JSON.parse(value); } catch { return ''; }
        }
        if (typeof value !== 'object') return '';
        value = value[k];
      }
      if (value == null) return '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    },
  },
  'jwt-decode': {
    label: 'JWT 解码', group: 'encode', configFields: null,
    fn: (s) => {
      try {
        const parts = String(s).split('.');
        if (parts.length !== 3) return '（不是合法的 JWT）';
        const dec = (b64) => JSON.parse(fromUint8(b64ToBytes(b64)));
        return JSON.stringify({ header: dec(parts[0]), payload: dec(parts[1]) }, null, 2);
      } catch { return '（JWT 解析失败）'; }
    },
  },

  // ============ 文本处理 ============
  'text-trim': {
    label: '去首尾空白', group: 'text', configFields: null,
    fn: (s) => String(s ?? '').trim(),
  },
  'text-strip-prefix': {
    label: '去前缀', group: 'text',
    configFields: [{ name: 'prefix', label: '前缀', required: true, multiline: false }],
    fn: (s, cfg) => {
      const str = String(s ?? '');
      const p = String(cfg.prefix ?? '');
      return p && str.startsWith(p) ? str.slice(p.length) : str;
    },
  },
  'text-strip-suffix': {
    label: '去后缀', group: 'text',
    configFields: [{ name: 'suffix', label: '后缀', required: true, multiline: false }],
    fn: (s, cfg) => {
      const str = String(s ?? '');
      const p = String(cfg.suffix ?? '');
      return p && str.endsWith(p) ? str.slice(0, -p.length) : str;
    },
  },
  'text-strip-both': {
    label: '去前后缀', group: 'text',
    configFields: [
      { name: 'prefix', label: '前缀（可空）', required: false, multiline: false },
      { name: 'suffix', label: '后缀（可空）', required: false, multiline: false },
    ],
    fn: (s, cfg) => {
      let str = String(s ?? '');
      const p = String(cfg.prefix ?? '');
      const f = String(cfg.suffix ?? '');
      if (p && str.startsWith(p)) str = str.slice(p.length);
      if (f && str.endsWith(f)) str = str.slice(0, -f.length);
      return str;
    },
  },
  'text-regex-replace': {
    label: '正则替换', group: 'text',
    configFields: [
      { name: 'pattern', label: '正则（不含首尾 /）', required: true, multiline: false },
      { name: 'flags', label: '标志（g/i/m 等，可空）', required: false, multiline: false },
      { name: 'replacement', label: '替换为（可空）', required: false, multiline: false },
    ],
    fn: (s, cfg) => {
      try {
        const re = new RegExp(cfg.pattern, cfg.flags || '');
        return String(s ?? '').replace(re, cfg.replacement || '');
      } catch (e) { return `（正则有误：${e.message}）`; }
    },
  },
  'text-regex-extract': {
    label: '正则提取', group: 'text',
    configFields: [
      { name: 'pattern', label: '正则（不含首尾 /）', required: true, multiline: false },
      { name: 'flags', label: '标志（g/i/m 等，可空）', required: false, multiline: false },
      { name: 'group', label: '取第几个捕获组（0=整个匹配）', required: false, multiline: false },
    ],
    fn: (s, cfg) => {
      try {
        const re = new RegExp(cfg.pattern, cfg.flags || '');
        const m = String(s ?? '').match(re);
        if (!m) return '';
        const g = parseInt(cfg.group, 10);
        return m[Number.isNaN(g) ? 0 : g] ?? '';
      } catch (e) { return `（正则有误：${e.message}）`; }
    },
  },
  'text-between': {
    label: '取两标记之间', group: 'text',
    configFields: [
      { name: 'start', label: '起始标记', required: true, multiline: false },
      { name: 'end', label: '结束标记', required: true, multiline: false },
      { name: 'include', label: '包含标记（true/false）', required: false, multiline: false },
    ],
    fn: (s, cfg) => {
      const str = String(s ?? '');
      const start = String(cfg.start ?? '');
      const end = String(cfg.end ?? '');
      const include = String(cfg.include || '').toLowerCase() === 'true';
      const i = start ? str.indexOf(start) : 0;
      if (i < 0) return '';
      const j = end ? str.indexOf(end, i + start.length) : str.length;
      if (j < 0) return '';
      const from = include ? i : i + start.length;
      const to = include ? j + end.length : j;
      return str.slice(from, to);
    },
  },
  'jsonp-to-json': {
    label: 'JSONP → JSON', group: 'text', configFields: null,
    fn: (s) => {
      const str = String(s ?? '').trim();
      const m = str.match(/^[^(]*\((.*)\);?\s*$/s);
      return m ? m[1] : str;
    },
  },
  'smart-parse': {
    label: '智能 JSON 化', group: 'text', configFields: null,
    fn: (s) => smartParseToString(String(s ?? '')),
  },

  // ============ 时间 ============
  'timestamp-ms': {
    label: '当前毫秒时间戳（13 位）', group: 'time', configFields: null,
    fn: () => String(Date.now()),
  },
  'timestamp-sec': {
    label: '当前秒时间戳（10 位）', group: 'time', configFields: null,
    fn: () => String(Math.floor(Date.now() / 1000)),
  },
  'timestamp-custom': {
    label: '当前时间戳（自定义单位）', group: 'time',
    configFields: [
      { name: 'unit', label: '单位（ms / s / min / h / d）', required: true, multiline: false },
      { name: 'offset', label: '偏移量（可空，整数，如 -60）', required: false, multiline: false },
    ],
    fn: (s, cfg) => {
      const unit = String(cfg.unit || 'ms').trim().toLowerCase();
      const offset = Number(cfg.offset || 0) || 0;
      const now = Date.now();
      switch (unit) {
        case 'ms': return String(now + offset);
        case 's': return String(Math.floor(now / 1000) + offset);
        case 'min': return String(Math.floor(now / 60000) + offset);
        case 'h': return String(Math.floor(now / 3600000) + offset);
        case 'd': return String(Math.floor(now / 86400000) + offset);
        default: return `（未知单位：${unit}）`;
      }
    },
  },

  // ============ 数值运算 ============
  'number-add-one': {
    label: '数值 +1', group: 'math', configFields: null,
    fn: (s) => { const n = Number(s); return Number.isNaN(n) ? `（不是数字：${s}）` : String(n + 1); },
  },
  'number-sub-one': {
    label: '数值 -1', group: 'math', configFields: null,
    fn: (s) => { const n = Number(s); return Number.isNaN(n) ? `（不是数字：${s}）` : String(n - 1); },
  },
  'number-mul-two': {
    label: '数值 ×2', group: 'math', configFields: null,
    fn: (s) => { const n = Number(s); return Number.isNaN(n) ? `（不是数字：${s}）` : String(n * 2); },
  },
  'number-custom': {
    label: '数值运算', group: 'math',
    configFields: [
      { name: 'op', label: '运算符（+ - * /）', required: true, multiline: false },
      { name: 'operand', label: '操作数', required: true, multiline: false },
    ],
    fn: (s, cfg) => {
      const n = Number(s);
      if (Number.isNaN(n)) return `（不是数字：${s}）`;
      const operand = Number(cfg.operand);
      if (Number.isNaN(operand)) return `（操作数不是数字：${cfg.operand}）`;
      switch (String(cfg.op).trim()) {
        case '+': return String(n + operand);
        case '-': return String(n - operand);
        case '*': return String(n * operand);
        case '/': return String(n / operand);
        default: return `（未知运算符：${cfg.op}）`;
      }
    },
  },

  // ============ 哈希 ============
  'sha-1': { label: 'SHA-1', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-1', toUint8(s)))) },
  'sha-256': { label: 'SHA-256', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', toUint8(s)))) },
  'sha-384': { label: 'SHA-384', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-384', toUint8(s)))) },
  'sha-512': { label: 'SHA-512', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-512', toUint8(s)))) },

  // ============ 对称加密 ============
  'aes-gcm-decrypt': {
    label: 'AES-GCM 解密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(cfg.iv) }, key, b64ToBytes(s));
        return fromUint8(new Uint8Array(plain));
      } catch (e) { return `（AES-GCM 解密失败：${e.message || e}）`; }
    },
  },
  'aes-gcm-encrypt': {
    label: 'AES-GCM 加密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-GCM', false, ['encrypt']);
        const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: b64ToBytes(cfg.iv) }, key, toUint8(s));
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（AES-GCM 加密失败：${e.message || e}）`; }
    },
  },
  'aes-cbc-decrypt': {
    label: 'AES-CBC 解密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-CBC', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: b64ToBytes(cfg.iv) }, key, b64ToBytes(s));
        return fromUint8(new Uint8Array(plain));
      } catch (e) { return `（AES-CBC 解密失败：${e.message || e}）`; }
    },
  },
  'aes-cbc-encrypt': {
    label: 'AES-CBC 加密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-CBC', false, ['encrypt']);
        const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: b64ToBytes(cfg.iv) }, key, toUint8(s));
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（AES-CBC 加密失败：${e.message || e}）`; }
    },
  },
  'aes-ctr-decrypt': {
    label: 'AES-CTR 解密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'counter', label: 'Counter（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-CTR', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-CTR', counter: b64ToBytes(cfg.counter), length: 64 }, key, b64ToBytes(s)
        );
        return fromUint8(new Uint8Array(plain));
      } catch (e) { return `（AES-CTR 解密失败：${e.message || e}）`; }
    },
  },
  'aes-ctr-encrypt': {
    label: 'AES-CTR 加密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64）', required: true, multiline: false },
      { name: 'counter', label: 'Counter（Base64）', required: true, multiline: false },
    ],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('raw', b64ToBytes(cfg.key), 'AES-CTR', false, ['encrypt']);
        const enc = await crypto.subtle.encrypt(
          { name: 'AES-CTR', counter: b64ToBytes(cfg.counter), length: 64 }, key, toUint8(s)
        );
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（AES-CTR 加密失败：${e.message || e}）`; }
    },
  },

  // ============ 非对称加密 ============
  'rsa-oaep-decrypt': {
    label: 'RSA-OAEP 解密', group: 'asymmetric',
    configFields: [{ name: 'privateKey', label: 'RSA 私钥（PKCS8 Base64）', required: true, multiline: true }],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('pkcs8', b64ToBytes(cfg.privateKey),
          { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, b64ToBytes(s));
        return fromUint8(new Uint8Array(plain));
      } catch (e) { return `（RSA-OAEP 解密失败：${e.message || e}）`; }
    },
  },
  'rsa-oaep-encrypt': {
    label: 'RSA-OAEP 加密', group: 'asymmetric',
    configFields: [{ name: 'publicKey', label: 'RSA 公钥（SPKI Base64）', required: true, multiline: true }],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('spki', b64ToBytes(cfg.publicKey),
          { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
        const enc = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, toUint8(s));
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（RSA-OAEP 加密失败：${e.message || e}）`; }
    },
  },
  'rsa-pkcs1-decrypt': {
    label: 'RSA-PKCS1 解密', group: 'asymmetric',
    configFields: [{ name: 'privateKey', label: 'RSA 私钥（PKCS8 Base64）', required: true, multiline: true }],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('pkcs8', b64ToBytes(cfg.privateKey),
          { name: 'RSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'RSA-PKCS1-v1_5' }, key, b64ToBytes(s));
        return fromUint8(new Uint8Array(plain));
      } catch (e) { return `（RSA-PKCS1 解密失败：${e.message || e}）`; }
    },
  },
  'rsa-pkcs1-encrypt': {
    label: 'RSA-PKCS1 加密', group: 'asymmetric',
    configFields: [{ name: 'publicKey', label: 'RSA 公钥（SPKI Base64）', required: true, multiline: true }],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey('spki', b64ToBytes(cfg.publicKey),
          { name: 'RSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['encrypt']);
        const enc = await crypto.subtle.encrypt({ name: 'RSA-PKCS1-v1_5' }, key, toUint8(s));
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（RSA-PKCS1 加密失败：${e.message || e}）`; }
    },
  },

  // ============ 响应上下文 ============
  'from-response': {
    label: '从响应取值', group: 'response',
    configFields: [
      { name: 'stepIndex', label: '请求序号（0 = 组内第 1 个）', required: true, multiline: false },
      { name: 'path', label: 'JSON 路径（可空，如 data.content.role_level）', required: false, multiline: false },
      { name: 'autoParse', label: '智能 JSON 化（true / false，默认 true）', required: false, multiline: false },
    ],
    fn: (s, cfg, ctx) => {
      const idx = parseInt(cfg.stepIndex, 10);
      if (Number.isNaN(idx)) return '（stepIndex 不是数字）';
      const step = ctx?.steps?.[idx];
      if (!step?.response) return `（第 ${idx + 1} 个请求还没有响应）`;

      const autoParse = String(cfg.autoParse ?? 'true').toLowerCase() !== 'false';
      let value = step.response.body ?? '';
      const path = String(cfg.path || '').trim();

      if (path) {
        const keys = path.split('.').map((x) => x.trim()).filter(Boolean);
        for (let i = 0; i < keys.length; i++) {
          if (value == null) return '';
          if (typeof value === 'string') {
            if (autoParse) {
              const parsed = smartParse(value);
              if (parsed === value) {
                return `（路径 ${keys.slice(0, i).join('.') || '(根)'} 的值不是可解析的 JSON，无法访问 ${keys[i]}）`;
              }
              value = parsed;
            } else {
              try { value = JSON.parse(value); }
              catch { return `（路径 ${keys.slice(0, i).join('.') || '(根)'} 的值不是 JSON，无法访问 ${keys[i]}）`; }
            }
          }
          if (typeof value !== 'object') return '';
          value = value[keys[i]];
        }
      }

      if (value == null) return '';

      if (autoParse && typeof value === 'string') {
        return smartParseToString(value);
      }
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    },
  },
  'from-current-input': {
    label: '透传输入', group: 'response', configFields: null,
    fn: (s) => String(s ?? ''),
  },

  // ============ 自定义 ============
  'js-expression': {
    label: 'JS 表达式', group: 'custom',
    configFields: [
      { name: 'expression', label: '表达式（可用 input / responses / currentStep）', required: true, multiline: true },
    ],
    fn: async (s, cfg, ctx) => {
      try {
        const fn = new Function(
          'input', 'responses', 'currentStep',
          `"use strict"; return (${cfg.expression});`
        );
        const r = await fn(s, ctx?.steps || [], ctx?.currentStep);
        return r == null ? '' : (typeof r === 'object' ? JSON.stringify(r) : String(r));
      } catch (e) {
        return `（JS 表达式执行失败：${e.message || e}）`;
      }
    },
  },
  'main-process-script': {
    label: '主进程脚本', group: 'custom',
    configFields: [
      { name: 'code', label: '脚本（可用 input / responses / currentStep / require；return 结果）', required: true, multiline: true },
    ],
    fn: async (s, cfg, ctx) => {
      if (!window.electronAPI?.runParser) return '（主进程未开放 runParser）';
      const r = await window.electronAPI.runParser({
        code: cfg.code,
        input: s,
        ctx: { responses: ctx?.steps || [], currentStep: ctx?.currentStep },
      });
      if (!r?.ok) return `（主进程执行失败：${r?.error || '未知'}）`;
      return r.value;
    },
  },
};

export const PARSER_GROUPS = {
  encode: '编码 / 解码',
  text: '文本处理',
  time: '时间',
  math: '数值运算',
  hash: '哈希',
  symmetric: '对称加密',
  asymmetric: '非对称加密',
  response: '响应上下文',
  custom: '自定义',
};

export async function runParser(key, input, configMap = {}, context = { steps: [] }) {
  const tpl = PARSER_TEMPLATES[key];
  if (!tpl) return '（未知算法）';
  const cfg = configMap[key];
  if (tpl.configFields && !cfg) return `（请先到「算法 → 全局算法」配置 ${tpl.label}）`;
  try { return await tpl.fn(input, cfg, context); }
  catch (e) { return `（执行出错：${e.message || e}）`; }
}

export async function runParserChain(chain, input, configMap = {}, context = { steps: [] }) {
  let value = input;
  const steps = [];
  for (const key of chain) {
    const tpl = PARSER_TEMPLATES[key];
    if (!tpl) {
      steps.push({ key, label: key, input: value, output: '（未知算法）' });
      value = '（未知算法）';
      continue;
    }
    const cfg = configMap[key];
    let output;
    if (tpl.configFields && !cfg) {
      output = `（请先到「算法 → 全局算法」配置 ${tpl.label}）`;
    } else {
      try { output = await tpl.fn(value, cfg, context); }
      catch (e) { output = `（执行出错：${e.message || e}）`; }
    }
    steps.push({ key, label: tpl.label, input: value, output });
    value = output;
  }
  return { finalValue: value, steps };
}