// src/renderer/src/utils/strictTransforms.js
/**
 * 严格算法库
 * - 不做宽容处理：失败即抛错
 * - 双向算法明确了 decodeLabel 和 encodeLabel，消除方向歧义
 */

/* ==================== 基础工具 ==================== */
const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })

function utf8ToBytes(s) { return enc.encode(s) }
function bytesToUtf8(bytes) { return dec.decode(new Uint8Array(bytes)) }
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function hexToBytes(hex) {
  const s = String(hex).replace(/\s/g, '')
  if (s.length === 0) throw new Error('空 hex')
  if (s.length % 2 !== 0) throw new Error('hex 长度必须为偶数')
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('包含非 hex 字符')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16)
  return out
}
function bytesToBase64(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}
function base64ToBytes(b64) {
  const s = String(b64).replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('非法 base64 字符')
  if (s.length % 4 !== 0 && !/=+$/.test(s)) throw new Error('base64 长度非法')
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ==================== 主进程调用封装 ==================== */
async function callCrypto(type, input, options = {}) {
  if (!window.electronAPI?.crypto?.transform) {
    throw new Error('主进程未开放 crypto 接口')
  }
  const r = await window.electronAPI.crypto.transform({ type, input, options })
  if (!r?.ok) throw new Error(r?.error || `${type} 失败`)
  return r.value
}

/* ==================== 类型推断 ==================== */
export function inferType(value) {
  if (value == null) return 'null'
  const s = String(value)
  if (s === '') return 'string(空)'
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (!Number.isNaN(n)) return Number.isInteger(n) ? 'number(int)' : 'number(float)'
  }
  if (s === 'true' || s === 'false') return 'boolean'
  try {
    const p = JSON.parse(s)
    if (p && typeof p === 'object') return Array.isArray(p) ? 'json(array)' : 'json(object)'
  } catch { /* not json */ }
  return 'string'
}

export function typeLabel(value) {
  if (value == null) return 'Null'
  const s = String(value)
  if (s === '') return 'String(空)'
  try {
    const p = JSON.parse(s)
    if (p && typeof p === 'object') return 'JSON'
  } catch { /* not json */ }
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'Number'
  if (s === 'true' || s === 'false') return 'Boolean'
  return 'String'
}

/* ==================== 算法定义表 ==================== */
export const TRANSFORM_GROUPS = {
  encoding: '编码/解码',
  json: 'JSON/表单',
  compress: '压缩',
  hash: '哈希（单向）',
  symmetric: '对称加密',
  asymmetric: '非对称加密',
  time: '时间',
  number: '数值',
  text: '文本',
  chain: '请求链',
  app: '应用专用',
}

export const TRANSFORMS = {
  /* ---------- 编码 ---------- */
  'utf8-base64': {
    label: 'UTF-8 与 Base64',
    decodeLabel: 'Base64 解码为 UTF-8',
    encodeLabel: 'UTF-8 编码为 Base64',
    group: 'encoding',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    canDecode: (v) => { try { base64ToBytes(v); return true } catch { return false } },
    canEncode: (v) => typeof v === 'string',
    decode: (v) => bytesToUtf8(base64ToBytes(v)),
    encode: (v) => bytesToBase64(utf8ToBytes(v)),
  },
  'utf8-hex': {
    label: 'UTF-8 与 Hex',
    decodeLabel: 'Hex 解码为 UTF-8',
    encodeLabel: 'UTF-8 编码为 Hex',
    group: 'encoding',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(hex)' } },
    canDecode: (v) => /^[0-9a-fA-F]+$/.test(String(v).replace(/\s/g, '')) && String(v).replace(/\s/g, '').length % 2 === 0,
    canEncode: (v) => typeof v === 'string',
    decode: (v) => bytesToUtf8(hexToBytes(v)),
    encode: (v) => bytesToHex(utf8ToBytes(v)),
  },
  'base64-hex': {
    label: 'Base64 与 Hex',
    decodeLabel: 'Base64 解码为 Hex',
    encodeLabel: 'Hex 编码为 Base64',
    group: 'encoding',
    direction: 'both',
    types: { decode: { out: 'String(hex)' }, encode: { out: 'String(base64)' } },
    canDecode: (v) => { try { base64ToBytes(v); return true } catch { return false } },
    canEncode: (v) => /^[0-9a-fA-F]+$/.test(String(v).replace(/\s/g, '')) && String(v).replace(/\s/g, '').length % 2 === 0,
    decode: (v) => bytesToHex(base64ToBytes(v)),
    encode: (v) => bytesToBase64(hexToBytes(v)),
  },
  'url': {
    label: 'URL 编码与解码',
    decodeLabel: 'URL 解码',
    encodeLabel: 'URL 编码',
    group: 'encoding',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(url-encoded)' } },
    canDecode: (v) => /%[0-9A-Fa-f]{2}/.test(String(v)),
    canEncode: (v) => typeof v === 'string',
    decode: (v) => decodeURIComponent(v),
    encode: (v) => encodeURIComponent(v),
  },

  /* ---------- JSON / 表单 ---------- */
  'json': {
    label: 'JSON 解析与序列化',
    decodeLabel: 'JSON 格式化（美化）',
    encodeLabel: 'JSON 序列化（压缩）',
    group: 'json',
    direction: 'both',
    types: { decode: { out: 'JSON' }, encode: { out: 'String(json)' } },
    canDecode: (v) => { try { const p = JSON.parse(v); return p && typeof p === 'object' } catch { return false } },
    canEncode: (v) => typeof v === 'string' && /^[[{]/.test(v.trim()),
    decode: (v) => { const parsed = JSON.parse(v); if (!parsed || typeof parsed !== 'object') throw new Error('不是对象/数组'); return JSON.stringify(parsed, null, 2); },
    encode: (v) => JSON.stringify(JSON.parse(v)),
  },
  'form-json': {
    label: '表单与 JSON',
    decodeLabel: '表单 转 JSON',
    encodeLabel: 'JSON 转 表单',
    group: 'json',
    direction: 'both',
    types: { decode: { out: 'JSON' }, encode: { out: 'String(form)' } },
    canDecode: (v) => /^[^=&]+=[^&]*(&[^=&]+=[^&]*)*$/.test(String(v).trim()),
    canEncode: (v) => { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) } catch { return false } },
    decode: (v) => { const params = new URLSearchParams(String(v)); const obj = {}; for (const [k, val] of params) obj[k] = val; return JSON.stringify(obj, null, 2); },
    encode: (v) => { const obj = JSON.parse(v); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('需要 JSON 对象'); return Object.entries(obj).map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`).join('&'); },
  },
  'jsonp-strip': {
    label: 'JSONP 包裹剥离与添加',
    decodeLabel: '去除 JSONP 外壳',
    encodeLabel: '添加 JSONP 外壳',
    group: 'json',
    direction: 'both',
    types: { decode: { out: 'String(json)' }, encode: { out: 'String(jsonp)' } },
    configFields: [{ name: 'callback', label: '回调函数名', required: false, defaultValue: 'callback' }],
    canDecode: (v) => /^\s*[\w$.]+\s*\([\s\S]*\)\s*;?\s*$/.test(String(v)),
    canEncode: (v) => { try { JSON.parse(v); return true } catch { return false } },
    decode: (v) => { const m = String(v).match(/^\s*[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/); if (!m) throw new Error('不是 JSONP 格式'); return m[1].trim(); },
    encode: (v, cfg) => { const name = (cfg?.callback || 'callback').trim() || 'callback'; JSON.parse(v); return `${name}(${v})`; },
  },

  /* ---------- 压缩 ---------- */
  'zlib': {
    label: 'Zlib 压缩与解压',
    decodeLabel: 'Zlib 解压',
    encodeLabel: 'Zlib 压缩',
    group: 'compress',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(zlib-base64)' } },
    canDecode: (v) => { try { base64ToBytes(v); return true } catch { return false } },
    canEncode: (v) => typeof v === 'string',
    decode: async (v) => callCrypto('zlib-decompress', v),
    encode: async (v) => callCrypto('zlib-compress', v),
  },
  'deflate': {
    label: 'Deflate 压缩与解压',
    decodeLabel: 'Deflate 解压',
    encodeLabel: 'Deflate 压缩',
    group: 'compress',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(deflate-base64)' } },
    canDecode: (v) => { try { base64ToBytes(v); return true } catch { return false } },
    canEncode: (v) => typeof v === 'string',
    decode: async (v) => callCrypto('deflate-decompress', v),
    encode: async (v) => callCrypto('deflate-compress', v),
  },

  /* ---------- 哈希 ---------- */
  'md5': {
    label: 'MD5（支持拼接密钥）',
    group: 'hash',
    direction: 'decode-only',
    types: { decode: { out: 'String(hex-md5)' } },
    configFields: [
      { name: 'key', label: '拼接密钥（可空）', required: false, placeholder: '留空则不拼接' },
      { name: 'position', label: '拼接位置（after / before）', required: false, defaultValue: 'after' },
    ],
    canDecode: (v) => typeof v === 'string',
    decode: async (v, cfg) => {
      const key = String(cfg?.key ?? '')
      const pos = String(cfg?.position || 'after').toLowerCase()
      const input = pos === 'before' ? key + v : v + key
      return await callCrypto('md5', input)
    },
  },
  'sha1': {
    label: 'SHA-1（支持拼接密钥）',
    group: 'hash',
    direction: 'decode-only',
    types: { decode: { out: 'String(hex-sha1)' } },
    configFields: [
      { name: 'key', label: '拼接密钥（可空）', required: false, placeholder: '留空则不拼接' },
      { name: 'position', label: '拼接位置（after / before）', required: false, defaultValue: 'after' },
    ],
    canDecode: (v) => typeof v === 'string',
    decode: async (v, cfg) => {
      const key = String(cfg?.key ?? '')
      const pos = String(cfg?.position || 'after').toLowerCase()
      const input = pos === 'before' ? key + v : v + key
      return await callCrypto('sha1', input)
    },
  },
  'sha256': {
    label: 'SHA-256（支持拼接密钥）',
    group: 'hash',
    direction: 'decode-only',
    types: { decode: { out: 'String(hex-sha256)' } },
    configFields: [
      { name: 'key', label: '拼接密钥（可空）', required: false, placeholder: '留空则不拼接' },
      { name: 'position', label: '拼接位置（after / before）', required: false, defaultValue: 'after' },
    ],
    canDecode: (v) => typeof v === 'string',
    decode: async (v, cfg) => {
      const key = String(cfg?.key ?? '')
      const pos = String(cfg?.position || 'after').toLowerCase()
      const input = pos === 'before' ? key + v : v + key
      return await callCrypto('sha256', input)
    },
  },

  /* ---------- 对称加密 ---------- */
  'aes-cbc': {
    label: 'AES-CBC 加解密',
    decodeLabel: 'AES-CBC 解密',
    encodeLabel: 'AES-CBC 加密',
    group: 'symmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'key', label: '密钥（hex）', required: true }, { name: 'iv', label: 'IV（hex）', required: true }],
    canDecode: (v, cfg) => { try { if (!cfg?.key || !cfg?.iv) return false; base64ToBytes(v); return true } catch { return false } },
    canEncode: (v, cfg) => !!(cfg?.key && cfg?.iv),
    decode: async (v, cfg) => callCrypto('aes-cbc-decrypt', v, { key: cfg.key, iv: cfg.iv }),
    encode: async (v, cfg) => callCrypto('aes-cbc-encrypt', v, { key: cfg.key, iv: cfg.iv }),
  },
  'aes-gcm': {
    label: 'AES-GCM 加解密',
    decodeLabel: 'AES-GCM 解密',
    encodeLabel: 'AES-GCM 加密',
    group: 'symmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'key', label: '密钥（hex）', required: true }, { name: 'iv', label: 'IV（hex）', required: true }, { name: 'tagLength', label: 'Tag 长度（默认 16）', required: false, defaultValue: '16' }],
    canDecode: (v, cfg) => { try { if (!cfg?.key || !cfg?.iv) return false; base64ToBytes(v); return true } catch { return false } },
    canEncode: (v, cfg) => !!(cfg?.key && cfg?.iv),
    decode: async (v, cfg) => callCrypto('aes-gcm-decrypt', v, { key: cfg.key, iv: cfg.iv, tagLength: Number(cfg.tagLength || 16) }),
    encode: async (v, cfg) => callCrypto('aes-gcm-encrypt', v, { key: cfg.key, iv: cfg.iv, tagLength: Number(cfg.tagLength || 16) }),
  },
  'aes-ctr': {
    label: 'AES-CTR 加解密',
    decodeLabel: 'AES-CTR 解密',
    encodeLabel: 'AES-CTR 加密',
    group: 'symmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'key', label: '密钥（hex）', required: true }, { name: 'iv', label: 'Counter（hex）', required: true }],
    canDecode: (v, cfg) => { try { if (!cfg?.key || !cfg?.iv) return false; base64ToBytes(v); return true } catch { return false } },
    canEncode: (v, cfg) => !!(cfg?.key && cfg?.iv),
    decode: async (v, cfg) => callCrypto('aes-ctr-decrypt', v, { key: cfg.key, iv: cfg.iv }),
    encode: async (v, cfg) => callCrypto('aes-ctr-encrypt', v, { key: cfg.key, iv: cfg.iv }),
  },
  'des-cbc': {
    label: 'DES-CBC 加解密',
    decodeLabel: 'DES-CBC 解密',
    encodeLabel: 'DES-CBC 加密',
    group: 'symmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'key', label: '密钥（hex，16 位）', required: true }, { name: 'iv', label: 'IV（hex，16 位）', required: true }],
    canDecode: (v, cfg) => { try { if (!cfg?.key || !cfg?.iv) return false; base64ToBytes(v); return true } catch { return false } },
    canEncode: (v, cfg) => !!(cfg?.key && cfg?.iv),
    decode: async (v, cfg) => callCrypto('des-cbc-decrypt', v, { key: cfg.key, iv: cfg.iv }),
    encode: async (v, cfg) => callCrypto('des-cbc-encrypt', v, { key: cfg.key, iv: cfg.iv }),
  },

  /* ---------- 非对称加密 ---------- */
  'rsa-oaep': {
    label: 'RSA-OAEP 加解密',
    decodeLabel: 'RSA-OAEP 解密',
    encodeLabel: 'RSA-OAEP 加密',
    group: 'asymmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'privateKey', label: '私钥 PEM（解）', required: false, multiline: true }, { name: 'publicKey', label: '公钥 PEM（加）', required: false, multiline: true }],
    canDecode: (v, cfg) => !!(cfg?.privateKey) && (() => { try { base64ToBytes(v); return true } catch { return false } })(),
    canEncode: (v, cfg) => !!(cfg?.publicKey),
    decode: async (v, cfg) => callCrypto('rsa-oaep-decrypt', v, { privateKey: cfg.privateKey }),
    encode: async (v, cfg) => callCrypto('rsa-oaep-encrypt', v, { publicKey: cfg.publicKey }),
  },
  'rsa-pkcs1': {
    label: 'RSA-PKCS1 加解密',
    decodeLabel: 'RSA-PKCS1 解密',
    encodeLabel: 'RSA-PKCS1 加密',
    group: 'asymmetric',
    direction: 'both',
    types: { decode: { out: 'String(utf-8)' }, encode: { out: 'String(base64)' } },
    configFields: [{ name: 'privateKey', label: '私钥 PEM（解）', required: false, multiline: true }, { name: 'publicKey', label: '公钥 PEM（加）', required: false, multiline: true }],
    canDecode: (v, cfg) => !!(cfg?.privateKey) && (() => { try { base64ToBytes(v); return true } catch { return false } })(),
    canEncode: (v, cfg) => !!(cfg?.publicKey),
    decode: async (v, cfg) => callCrypto('rsa-pkcs1-decrypt', v, { privateKey: cfg.privateKey }),
    encode: async (v, cfg) => callCrypto('rsa-pkcs1-encrypt', v, { publicKey: cfg.publicKey }),
  },

  /* ---------- 时间 ---------- */
  'timestamp-now-s': {
    label: '生成当前 10 位时间戳（忽略输入）',
    group: 'time',
    direction: 'decode-only',
    types: { decode: { out: 'String(时间戳-10)' } },
    canDecode: () => true,
    decode: () => String(Math.floor(Date.now() / 1000)),
  },
  'timestamp-now-ms': {
    label: '生成当前 13 位时间戳（忽略输入）',
    group: 'time',
    direction: 'decode-only',
    types: { decode: { out: 'String(时间戳-13)' } },
    canDecode: () => true,
    decode: () => String(Date.now()),
  },
  'timestamp-ms-s': {
    label: '时间戳 13位(ms) 与 10位(s)',
    decodeLabel: '13位(ms) 转 10位(s)',
    encodeLabel: '10位(s) 转 13位(ms)',
    group: 'time',
    direction: 'both',
    types: { decode: { out: 'String(时间戳-10)' }, encode: { out: 'String(时间戳-13)' } },
    canDecode: (v) => /^\d{13}$/.test(String(v).trim()),
    canEncode: (v) => /^\d{10}$/.test(String(v).trim()),
    decode: (v) => String(Math.floor(Number(v) / 1000)),
    encode: (v) => String(Number(v) * 1000),
  },
  'timestamp-to-date': {
    label: '时间戳(10/13) → 日期字符串',
    group: 'time',
    direction: 'decode-only',
    types: { decode: { out: 'String(日期)' } },
    canDecode: (v) => /^\d{10,13}$/.test(String(v).trim()),
    decode: (v) => {
      const n = Number(v)
      const ms = String(v).length === 10 ? n * 1000 : n
      const d = new Date(ms)
      if (Number.isNaN(d.getTime())) throw new Error('非法时间戳')
      return d.toISOString()
    },
  },

  /* ---------- 数值 ---------- */
  'number': {
    label: 'Number() 严格转数字',
    group: 'number',
    direction: 'decode-only',
    types: { decode: { out: 'Number' } },
    canDecode: (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim()),
    decode: (v) => {
      const n = Number(v)
      if (Number.isNaN(n)) throw new Error('无法转数字')
      return String(n)
    },
  },
  'math': {
    label: '数值运算（+ - * /）',
    group: 'number',
    direction: 'decode-only',
    types: { decode: { out: 'Number' } },
    configFields: [
      { name: 'op',      label: '运算符 + - * /', required: true, defaultValue: '+' },
      { name: 'operand', label: '操作数', required: true, defaultValue: '0' },
    ],
    canDecode: (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim()),
    decode: (v, cfg) => {
      const n = Number(v)
      if (Number.isNaN(n)) throw new Error('输入不是数字')
      const op = Number(cfg?.operand)
      if (Number.isNaN(op)) throw new Error('操作数不是数字')
      switch (String(cfg?.op)) {
        case '+': return String(n + op)
        case '-': return String(n - op)
        case '*': return String(n * op)
        case '/': if (op === 0) throw new Error('除零'); return String(n / op)
        default: throw new Error(`未知运算符 ${cfg?.op}`)
      }
    },
  },
  'math-floor': {
    label: 'Math.floor 取整',
    group: 'number',
    direction: 'decode-only',
    types: { decode: { out: 'Number(int)' } },
    canDecode: (v) => /^-?\d+(\.\d+)?$/.test(String(v).trim()),
    decode: (v) => String(Math.floor(Number(v))),
  },

  /* ---------- 文本 ---------- */
  'text-jsonp-strip': {
    label: '文本去除 JSONP 外壳（仅剥离）',
    group: 'text',
    direction: 'decode-only',
    types: { decode: { out: 'String(json)' } },
    canDecode: (v) => /^\s*[\w$.]+\s*\([\s\S]*\)\s*;?\s*$/.test(String(v)),
    decode: (v) => {
      const m = String(v).match(/^\s*[\w$.]+\s*\(([\s\S]*)\)\s*;?\s*$/)
      if (!m) throw new Error('不是 JSONP')
      return m[1].trim()
    },
  },

  /* ---------- 请求链引用 ---------- */
  'chain': {
    label: '请求链取值（引用前面请求的响应）',
    group: 'chain',
    direction: 'decode-only',
    configFields: [
      { name: 'expr', label: '表达式（如 req.0.body / req.0.json.data.token）', required: true, placeholder: 'req.0.json.data.token' },
    ],
    canDecode: () => true,
    decode: async (v, cfg, ctx) => {
      const { resolveChainExpr } = await import('./requestChain')
      const value = resolveChainExpr(cfg?.expr, ctx)
      return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
    },
  },

  /* ---------- JS 表达式 ---------- */
  'js-expression': {
    label: 'JS 表达式（可引用 responses）',
    group: 'chain',
    direction: 'decode-only',
    configFields: [{
      name: 'code',
      label: '代码（可访问 input, responses, currentStep）',
      required: true,
      multiline: true,
      defaultValue: 'return input;',
    }],
    canDecode: () => true,
    decode: async (v, cfg, ctx) => {
      const fn = new Function('input', 'responses', 'currentStep', `"use strict";\n${cfg.code}`)
      const r = await fn(v, ctx?.responses || [], ctx?.currentStep ?? -1)
      if (r === undefined) throw new Error('JS 表达式没有返回值')
      return r == null ? '' : (typeof r === 'object' ? JSON.stringify(r) : String(r))
    },
  },

  /* ---------- 应用专用：jiem 解码 / jiam 编码（两个独立算法） ---------- */
  'jiem': {
    label: 'jiem 解码（解 jiam 篡改头 gzip）',
    group: 'app',
    direction: 'decode-only',
    types: { decode: { out: 'JSON' } },
    configFields: [
      { name: 'format', label: '输入格式（base64 / hex / latin1）', required: false, defaultValue: 'base64' },
    ],
    canDecode: (v) => String(v || '').trim().length >= 12,
    decode: async (v, cfg) => {
      const fmt = String(cfg?.format || 'base64').toLowerCase();
      const raw = String(v ?? '').trim();
      let b64;
      if (fmt === 'hex') {
        b64 = bytesToBase64(hexToBytes(raw));
      } else if (fmt === 'latin1') {
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
        b64 = bytesToBase64(bytes);
      } else {
        base64ToBytes(raw);
        b64 = raw;
      }
      const text = await callCrypto('jiem-decompress', b64);
      try {
        const obj = JSON.parse(text);
        return JSON.stringify(obj, null, 2);
      } catch {
        return text;
      }
    },
  },
  'jiam': {
    label: 'jiam 编码（篡改头 gzip 压缩）',
    group: 'app',
    direction: 'encode-only',
    types: { encode: { out: 'String(base64)' } },
    configFields: [
      { name: 'format', label: '输出格式（base64 / hex）', required: false, defaultValue: 'base64' },
    ],
    canEncode: () => true,
    encode: async (v, cfg) => {
      const fmt = String(cfg?.format || 'base64').toLowerCase();
      const b64 = await callCrypto('jiem-compress', v);
      if (fmt === 'hex') {
        return bytesToHex(base64ToBytes(b64));
      }
      return b64;
    },
  },

  /* ---------- 应用专用：qm 签名 ---------- */
  'qm': {
    label: 'qm 签名：md5( md5(jiam字节) + secret )',
    group: 'app',
    direction: 'decode-only',
    types: { decode: { out: 'String(hex-md5)' } },
    configFields: [
      { name: 'secret', label: 'Secret（如 hex_md5(appBundleId)）', required: true, placeholder: 'hex_md5("com.xxx.app")' },
      { name: 'format', label: '输入格式（base64 / hex）', required: false, defaultValue: 'base64' },
    ],
    canDecode: () => true,
    decode: async (v, cfg) => {
      if (!cfg?.secret) throw new Error('qm: 缺少 secret')
      const fmt = String(cfg?.format || 'base64').toLowerCase()
      const raw = String(v ?? '').trim()
      let b64 = raw
      if (fmt === 'hex') {
        b64 = bytesToBase64(hexToBytes(raw))
      } else {
        base64ToBytes(b64)
      }
      return await callCrypto('qm', b64, { secret: cfg.secret })
    },
  },
}

/* ==================== 辅助 ==================== */
export function getTransform(key) {
  return TRANSFORMS[key]
}

export function suggestDirection(key, value, cfg) {
  const t = TRANSFORMS[key]
  if (!t) return null
  const canDecode = t.decode && (!t.canDecode || t.canDecode(value, cfg))
  const canEncode = t.encode && (!t.canEncode || t.canEncode(value, cfg))
  if (t.direction === 'decode-only') return canDecode ? 'decode' : null
  if (t.direction === 'encode-only') return canEncode ? 'encode' : null
  if (canDecode && !canEncode) return 'decode'
  if (!canDecode && canEncode) return 'encode'
  if (canDecode && canEncode) return 'decode'
  return null
}

export async function applyTransform({ key, direction, value, config, ctx }) {
  const t = TRANSFORMS[key]
  if (!t) throw new Error(`未知算法：${key}`)
  const fn = direction === 'encode' ? t.encode : t.decode
  if (!fn) throw new Error(`算法 ${t.label} 不支持方向 ${direction}`)
  return await fn(String(value ?? ''), config || {}, ctx || {})
}