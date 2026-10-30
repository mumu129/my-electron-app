// src/renderer/src/utils/strictTransforms.js
const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })
const b64ToBytes = (b64) => new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)))
const bytesToB64 = (bytes) => btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)))
const hexToBytes = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

async function callCrypto(type, input, options = {}) {
  if (!window.electronAPI?.crypto?.transform) throw new Error('主进程未开放 crypto 接口')
  const r = await window.electronAPI.crypto.transform({ type, input, options })
  if (!r?.ok) throw new Error(r?.error || `${type} 失败`)
  return r.value
}

export const TRANSFORM_GROUPS = {
  encoding: '编码 / 压缩',
  format: '格式处理 (JSON/Cookie/JWT)',
  crypto: '对称 / 非对称加密',
  hash: '哈希 / 签名',
  time: '时间戳处理',
  number: '数值计算',
  app: '应用与联动',
}

export const TRANSFORMS = {
  /* ---------- 编码 / 压缩 ---------- */
  'b64': { 
    label: 'UTF-8 与 Base64', decodeLabel: 'Base64 解码为 UTF-8', encodeLabel: 'UTF-8 编码为 Base64', group: 'encoding', direction: 'both',
    decode: (v) => dec.decode(b64ToBytes(v)), encode: (v) => bytesToB64(enc.encode(v)) 
  },
  'hex': { 
    label: 'UTF-8 与 Hex', decodeLabel: 'Hex 解码为 UTF-8', encodeLabel: 'UTF-8 编码为 Hex', group: 'encoding', direction: 'both',
    decode: (v) => dec.decode(hexToBytes(v)), encode: (v) => bytesToHex(enc.encode(v)) 
  },
  'url': { 
    label: 'URL 编码与解码', decodeLabel: 'URL 解码', encodeLabel: 'URL 编码', group: 'encoding', direction: 'both',
    decode: (v) => decodeURIComponent(v), encode: (v) => encodeURIComponent(v) 
  },
  'gzip': { 
    label: 'GZIP 压缩与解压', decodeLabel: 'GZIP 解压', encodeLabel: 'GZIP 压缩', group: 'encoding', direction: 'both',
    decode: async (v) => await callCrypto('gzip-decompress', v), encode: async (v) => await callCrypto('gzip-compress', v) 
  },

  /* ---------- 格式处理 ---------- */
  'json': { 
    label: 'JSON 美化与压缩', decodeLabel: 'JSON 格式化', encodeLabel: 'JSON 压缩', group: 'format', direction: 'both',
    decode: (v) => JSON.stringify(JSON.parse(v), null, 2), encode: (v) => JSON.stringify(JSON.parse(v)) 
  },
  'form-json': {
    label: '表单与 JSON', decodeLabel: '表单转 JSON', encodeLabel: 'JSON 转表单', group: 'format', direction: 'both',
    decode: (v) => { const p = new URLSearchParams(v); const o = {}; for (const [k, val] of p) o[k] = val; return JSON.stringify(o, null, 2); },
    encode: (v) => { const o = JSON.parse(v); return Object.entries(o).map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`).join('&'); }
  },
  'cookie-parse': { 
    label: 'Cookie 解析为 JSON', group: 'format', direction: 'decode-only',
    decode: (v) => { const obj = {}; v.split(';').forEach(p => { const [k, ...rest] = p.split('='); if (k && k.trim()) obj[k.trim()] = rest.join('=').trim(); }); return JSON.stringify(obj, null, 2); } 
  },
  'cookie-stringify': { 
    label: 'JSON 转为 Cookie 字符串', group: 'format', direction: 'encode-only',
    encode: (v) => { const obj = JSON.parse(v); return Object.entries(obj).map(([k, val]) => `${k}=${val}`).join('; '); } 
  },
  'jwt-decode': { 
    label: 'JWT 解析（提取 Payload）', group: 'format', direction: 'decode-only',
    decode: (v) => { const p = v.split('.')[1]; if (!p) throw new Error('非法 JWT'); return dec.decode(b64ToBytes(p.replace(/-/g, '+').replace(/_/g, '/'))); } 
  },
  'jwt-hs256': { 
    label: 'JWT HS256 签名', group: 'format', direction: 'encode-only',
    configFields: [{ name: 'secret', label: '密钥 (Secret)', required: true }],
    encode: async (v, cfg) => await callCrypto('jwt-hs256-sign', v, { secret: cfg.secret }) 
  },

  /* ---------- 对称加密 ---------- */
  'aes-cbc': {
    label: 'AES-CBC 加解密', decodeLabel: 'AES-CBC 解密', encodeLabel: 'AES-CBC 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-cbc-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-cbc-encrypt', v, cfg),
  },
  'aes-gcm': {
    label: 'AES-GCM 加解密', decodeLabel: 'AES-GCM 解密', encodeLabel: 'AES-GCM 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-gcm-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-gcm-encrypt', v, cfg),
  },
  'aes-ctr': {
    label: 'AES-CTR 加解密', decodeLabel: 'AES-CTR 解密', encodeLabel: 'AES-CTR 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'Counter (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-ctr-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-ctr-encrypt', v, cfg),
  },
  'des-cbc': {
    label: 'DES-CBC 加解密', decodeLabel: 'DES-CBC 解密', encodeLabel: 'DES-CBC 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('des-cbc-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('des-cbc-encrypt', v, cfg),
  },

  /* ---------- 非对称加密 ---------- */
  'rsa-oaep': {
    label: 'RSA-OAEP 加解密', decodeLabel: 'RSA-OAEP 解密', encodeLabel: 'RSA-OAEP 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'privateKey', label: '私钥 PEM', multiline: true }, { name: 'publicKey', label: '公钥 PEM', multiline: true }],
    decode: async (v, cfg) => await callCrypto('rsa-oaep-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('rsa-oaep-encrypt', v, cfg),
  },
  'rsa-pkcs1': {
    label: 'RSA-PKCS1 加解密', decodeLabel: 'RSA-PKCS1 解密', encodeLabel: 'RSA-PKCS1 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'privateKey', label: '私钥 PEM', multiline: true }, { name: 'publicKey', label: '公钥 PEM', multiline: true }],
    decode: async (v, cfg) => await callCrypto('rsa-pkcs1-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('rsa-pkcs1-encrypt', v, cfg),
  },

  /* ---------- 哈希 ---------- */
  'md5': { label: 'MD5 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('md5', v) },
  'sha1': { label: 'SHA-1 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('sha1', v) },
  'sha256': { label: 'SHA-256 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('sha256', v) },

  /* ---------- 时间戳 ---------- */
  'timestamp-now-s': { 
    label: '生成当前 10 位时间戳(s)', group: 'time', direction: 'decode-only',
    decode: () => String(Math.floor(Date.now() / 1000)) 
  },
  'timestamp-now-ms': { 
    label: '生成当前 13 位时间戳(ms)', group: 'time', direction: 'decode-only',
    decode: () => String(Date.now()) 
  },
  'timestamp-ms-s': {
    label: '13位(ms) 转 10位(s)', group: 'time', direction: 'decode-only',
    decode: (v) => String(Math.floor(Number(v) / 1000))
  },
  'timestamp-to-date': {
    label: '时间戳转日期字符串', group: 'time', direction: 'decode-only',
    decode: (v) => {
      const n = Number(v); const ms = String(v).length === 10 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
  },

  /* ---------- 数值计算 ---------- */
  'number': {
    label: '严格转数字', group: 'number', direction: 'decode-only',
    decode: (v) => { const n = Number(v); if (Number.isNaN(n)) throw new Error('无法转数字'); return String(n); }
  },
  'math': {
    label: '数值运算（+ - * /）', group: 'number', direction: 'decode-only',
    configFields: [
      { name: 'op', label: '运算符 + - * /', required: true, defaultValue: '+' },
      { name: 'operand', label: '操作数', required: true, defaultValue: '1' },
    ],
    decode: (v, cfg) => {
      const n = Number(v); const op = Number(cfg?.operand);
      switch (String(cfg?.op)) {
        case '+': return String(n + op);
        case '-': return String(n - op);
        case '*': return String(n * op);
        case '/': return String(n / op);
        default: throw new Error('未知运算符');
      }
    },
  },
  'math-floor': {
    label: 'Math.floor 取整', group: 'number', direction: 'decode-only',
    decode: (v) => String(Math.floor(Number(v)))
  },

  /* ---------- 应用与联动 ---------- */
  'jiem': { label: 'jiem 解码', group: 'app', direction: 'decode-only', decode: async (v) => await callCrypto('jiem-decompress', v) },
  'jiam': { label: 'jiam 编码', group: 'app', direction: 'encode-only', encode: async (v) => await callCrypto('jiem-compress', v) },
  
  'qm': {
    label: 'qm 签名：md5( md5(jiam字节) + secret )',
    group: 'app',
    direction: 'decode-only',
    configFields: [
      { name: 'secret', label: 'Secret（如 hex_md5(appBundleId)）', required: true, placeholder: 'hex_md5("com.xxx.app")' },
      { name: 'format', label: '输入格式（base64 / hex）', required: false, defaultValue: 'base64' },
    ],
    decode: async (v, cfg) => {
      if (!cfg?.secret) throw new Error('qm: 缺少 secret')
      const fmt = String(cfg?.format || 'base64').toLowerCase()
      const raw = String(v ?? '').trim()
      let b64 = raw
      if (fmt === 'hex') {
        b64 = bytesToB64(hexToBytes(raw))
      }
      return await callCrypto('qm', b64, { secret: cfg.secret })
    },
  },

  'js-expression': {
    label: 'JS 表达式（联动计算）', group: 'app', direction: 'decode-only',
    configFields: [{
      name: 'code', label: '代码 (可用 vars, responses, md5)', required: true, multiline: true,
      defaultValue: `// 【1. 如何读取前面请求的响应体？】
// 索引 0 表示请求组中的第 1 个请求
// const resData = JSON.parse(responses[0].body);
// const token = resData.data.token;

// 【2. 如何读取当前报文里 <@var:xxx> 提取的变量？】
// const uid = vars.uid;

// 【3. 如何读取原始 input 值？】
// const raw = input;

// 【4. 如何计算 MD5？】(支持 await 异步)
// return await md5(uid + token + 'my_secret_salt');

return input; // 默认原样返回`,
    }],
    decode: async (v, cfg, ctx) => {
      try {
        // 将上下文打包发给主进程执行
        const r = await window.electronAPI.script.run({
          code: cfg.code,
          input: v,
          context: {
            vars: ctx?.vars || {},
            responses: ctx?.responses || []
          }
        });
        return r.ok ? r.value : `[JS失败: ${r.error}]`;
      } catch (e) { 
        return `[JS失败: ${e.message}]`; 
      }
    },
  },
}

export async function applyTransform({ key, direction, value, config, ctx }) {
  const t = TRANSFORMS[key]
  if (!t) throw new Error(`未知算法：${key}`)
  const fn = direction === 'encode' ? t.encode : t.decode
  if (!fn) throw new Error(`算法 ${t.label} 不支持方向 ${direction}`)
  return await fn(String(value ?? ''), config || {}, ctx || {})
}