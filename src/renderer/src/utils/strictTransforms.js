// src/renderer/src/utils/strictTransforms.js
const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })
const b64ToBytes = (b64) => new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)))
const bytesToB64 = (bytes) => btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)))
const hexToBytes = (hex) => {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error('非法 hex 字符串')
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)))
}
const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

async function callCrypto(type, input, options = {}) {
  if (!window.electronAPI?.crypto?.transform) throw new Error('主进程未开放 crypto 接口')
  const r = await window.electronAPI.crypto.transform({ type, input, options })
  if (!r?.ok) throw new Error(r?.error || `${type} 失败`)
  return r.value
}

// 💡 [修复] 支持 direction 参数；both 类型根据方向返回 enc/dec
export function getAlgoTagType(algoKey, direction) {
  try {
    const saved = JSON.parse(localStorage.getItem('har-algo-tagtypes') || '{}')
    if (saved[algoKey]) return saved[algoKey]
  } catch {}
  if (['math', 'math-floor', 'number'].includes(algoKey)) return 'op'
  const tpl = TRANSFORMS[algoKey]
  if (!tpl) return 'enc'
  if (tpl.direction === 'both') return direction === 'decode' ? 'dec' : 'enc'
  if (tpl.direction === 'encode-only') return 'enc'
  if (tpl.direction === 'decode-only') return 'dec'
  return 'enc'
}

export const TRANSFORM_GROUPS = {
  encoding: '编码 / 压缩',
  format: '格式处理 (JSON/Cookie/JWT)',
  crypto: '对称 / 非对称加密',
  hash: '哈希 / 签名',
  time: '时间戳处理',
  number: '数值计算 (op)',
  app: '应用与联动',
}

export const TRANSFORMS = {
  'b64': { label: 'UTF-8 与 Base64', decodeLabel: 'Base64 解码', encodeLabel: 'Base64 编码', group: 'encoding', direction: 'both',
    decode: (v) => dec.decode(b64ToBytes(v)), encode: (v) => bytesToB64(enc.encode(v)) },
  'hex': { label: 'UTF-8 与 Hex', decodeLabel: 'Hex 解码', encodeLabel: 'Hex 编码', group: 'encoding', direction: 'both',
    decode: (v) => dec.decode(hexToBytes(v)), encode: (v) => bytesToHex(enc.encode(v)) },
  'base64-hex': { label: 'Base64 与 Hex', decodeLabel: 'Base64 解码为 Hex', encodeLabel: 'Hex 编码为 Base64', group: 'encoding', direction: 'both',
    decode: (v) => bytesToHex(b64ToBytes(v)), encode: (v) => bytesToB64(hexToBytes(v)) },
  'url': { label: 'URL 编码与解码', decodeLabel: 'URL 解码', encodeLabel: 'URL 编码', group: 'encoding', direction: 'both',
    decode: (v) => decodeURIComponent(v), encode: (v) => encodeURIComponent(v) },
  'gzip': { label: 'GZIP 压缩与解压', decodeLabel: 'GZIP 解压', encodeLabel: 'GZIP 压缩', group: 'encoding', direction: 'both',
    decode: async (v) => await callCrypto('gzip-decompress', v), encode: async (v) => await callCrypto('gzip-compress', v) },

  'json': { label: 'JSON 紧凑与格式化', decodeLabel: 'JSON 格式化', encodeLabel: 'JSON 紧凑', group: 'format', direction: 'both',
    decode: (v) => JSON.stringify(JSON.parse(v), null, 2), encode: (v) => JSON.stringify(JSON.parse(v)) },
  'form-json': { label: '表单与 JSON', decodeLabel: '表单转 JSON', encodeLabel: 'JSON 转表单', group: 'format', direction: 'both',
    decode: (v) => { const p = new URLSearchParams(v); const o = {}; for (const [k, val] of p) o[k] = val; return JSON.stringify(o) },
    encode: (v) => { const o = JSON.parse(v); return Object.entries(o).map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`).join('&') } },
  'cookie-parse': { label: 'Cookie 解析为 JSON', group: 'format', direction: 'decode-only',
    decode: (v) => { const obj = {}; v.split(';').forEach(p => { const [k, ...rest] = p.split('='); if (k && k.trim()) obj[k.trim()] = rest.join('=').trim() }); return JSON.stringify(obj) } },
  'cookie-stringify': { label: 'JSON 转为 Cookie', group: 'format', direction: 'encode-only',
    encode: (v) => { const obj = JSON.parse(v); return Object.entries(obj).map(([k, val]) => `${k}=${val}`).join('; ') } },
  'jwt-decode': { label: 'JWT 解析', group: 'format', direction: 'decode-only',
  decode: (v) => {
    const p = v.split('.')[1];
    if (!p) throw new Error('非法 JWT');
    // 💡 [修复 #7] Base64URL 不带 padding，atob 遇到长度非 4 倍数会抛错，需补齐 '='
    const padded = p.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - (p.length % 4)) % 4);
    return dec.decode(b64ToBytes(padded));
  } },
  'jwt-hs256': { label: 'JWT HS256 签名', group: 'format', direction: 'encode-only',
    configFields: [{ name: 'secret', label: '密钥 (Secret)', required: true }],
    encode: async (v, cfg) => await callCrypto('jwt-hs256-sign', v, { secret: cfg.secret }) },

  'aes-cbc': { label: 'AES-CBC', decodeLabel: 'AES-CBC 解密', encodeLabel: 'AES-CBC 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-cbc-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-cbc-encrypt', v, cfg) },
  'aes-gcm': { label: 'AES-GCM', decodeLabel: 'AES-GCM 解密', encodeLabel: 'AES-GCM 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-gcm-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-gcm-encrypt', v, cfg) },
  'aes-ctr': { label: 'AES-CTR', decodeLabel: 'AES-CTR 解密', encodeLabel: 'AES-CTR 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'Counter (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('aes-ctr-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('aes-ctr-encrypt', v, cfg) },
  'des-cbc': { label: 'DES-CBC', decodeLabel: 'DES-CBC 解密', encodeLabel: 'DES-CBC 加密', group: 'crypto', direction: 'both',
    configFields: [{ name: 'key', label: '密钥 (Hex)', required: true }, { name: 'iv', label: 'IV (Hex)', required: true }],
    decode: async (v, cfg) => await callCrypto('des-cbc-decrypt', v, cfg),
    encode: async (v, cfg) => await callCrypto('des-cbc-encrypt', v, cfg) },

 'rsa-oaep': {
  label: 'RSA-OAEP', decodeLabel: 'RSA-OAEP 解密', encodeLabel: 'RSA-OAEP 加密', group: 'crypto', direction: 'both',
  configFields: [
    { name: 'publicKey',  label: '公钥（加密必填 · Base64 或 PEM）', multiline: true, placeholder: 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJB...' },
    { name: 'privateKey', label: '私钥（解密必填 · Base64 或 PEM）', multiline: true, placeholder: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj...' },
  ],
  decode: async (v, cfg) => await callCrypto('rsa-oaep-decrypt', v, cfg),
  encode: async (v, cfg) => await callCrypto('rsa-oaep-encrypt', v, cfg),
},
'rsa-pkcs1': {
  label: 'RSA-PKCS1', decodeLabel: 'RSA-PKCS1 解密', encodeLabel: 'RSA-PKCS1 加密', group: 'crypto', direction: 'both',
  configFields: [
    { name: 'publicKey',  label: '公钥（加密必填 · Base64 或 PEM）', multiline: true, placeholder: 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJB...' },
    { name: 'privateKey', label: '私钥（解密必填 · Base64 或 PEM）', multiline: true, placeholder: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj...' },
  ],
  decode: async (v, cfg) => await callCrypto('rsa-pkcs1-decrypt', v, cfg),
  encode: async (v, cfg) => await callCrypto('rsa-pkcs1-encrypt', v, cfg),
},
  'md5': { label: 'MD5 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('md5', v) },
  'sha1': { label: 'SHA-1 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('sha1', v) },
  'sha256': { label: 'SHA-256 哈希', group: 'hash', direction: 'decode-only', decode: async (v) => await callCrypto('sha256', v) },

  'timestamp-now-s': { label: '当前 10 位时间戳(s)', group: 'time', direction: 'decode-only',
    decode: () => String(Math.floor(Date.now() / 1000)) },
  'timestamp-now-ms': { label: '当前 13 位时间戳(ms)', group: 'time', direction: 'decode-only',
    decode: () => String(Date.now()) },
  'timestamp-ms-s': { label: '13位(ms) 转 10位(s)', group: 'time', direction: 'decode-only',
    decode: (v) => String(Math.floor(Number(v) / 1000)) },
  'timestamp-to-date': { label: '时间戳转日期', group: 'time', direction: 'decode-only',
    decode: (v) => { const n = Number(v); const ms = String(v).length === 10 ? n * 1000 : n; return new Date(ms).toISOString() } },

  'number': { label: '严格转数字', group: 'number', direction: 'decode-only',
    decode: (v) => { const n = Number(v); if (Number.isNaN(n)) throw new Error('无法转数字'); return String(n) } },
  'math': { label: '数值运算（+ - * /）', group: 'number', direction: 'both',
    configFields: [
      { name: 'op', label: '运算符 + - * /', required: true, defaultValue: '+' },
      { name: 'operand', label: '操作数', required: true, defaultValue: '1' },
    ],
    decode: (v, cfg) => {
      const n = Number(v); const op = Number(cfg?.operand)
      switch (String(cfg?.op)) {
        case '+': return String(n + op); case '-': return String(n - op)
        case '*': return String(n * op); case '/': return String(n / op)
        default: throw new Error('未知运算符')
      }
    },
    encode: (v, cfg) => {
      const n = Number(v); const op = Number(cfg?.operand)
      switch (String(cfg?.op)) {
        case '+': return String(n + op); case '-': return String(n - op)
        case '*': return String(n * op); case '/': return String(n / op)
        default: throw new Error('未知运算符')
      }
    } },
  'math-floor': { label: 'Math.floor 取整', group: 'number', direction: 'decode-only',
    decode: (v) => String(Math.floor(Number(v))) },

  'jiem': { label: 'jiem 解码', group: 'app', direction: 'decode-only',
    configFields: [{ name: 'format', label: '输入格式', required: false, defaultValue: 'base64' }],
    decode: async (v, cfg) => {
      const fmt = String(cfg?.format || 'base64').toLowerCase()
      const raw = String(v ?? '').trim()
      let b64
      if (fmt === 'hex') b64 = bytesToB64(hexToBytes(raw))
      else if (fmt === 'latin1') { const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff; b64 = bytesToB64(bytes) }
      else { b64ToBytes(raw); b64 = raw }
      return await callCrypto('jiem-decompress', b64)
    } },
  'jiam': { label: 'jiam 编码', group: 'app', direction: 'encode-only',
    encode: async (v) => {
      let textToCompress = v
      try { textToCompress = JSON.stringify(JSON.parse(v)) } catch { textToCompress = v.trim() }
      return await callCrypto('jiem-compress', textToCompress)
    } },
  'qm': { label: 'qm 签名', group: 'app', direction: 'decode-only',
    configFields: [
      { name: 'secret', label: 'Secret', required: true },
      { name: 'format', label: '输入格式 (base64/hex)', required: false, defaultValue: 'base64' },
    ],
    decode: async (v, cfg) => {
      if (!cfg?.secret) throw new Error('qm: 缺少 secret')
      const fmt = String(cfg?.format || 'base64').toLowerCase()
      const raw = String(v ?? '').trim()
      let b64 = raw
      if (fmt === 'hex') b64 = bytesToB64(hexToBytes(raw))
      return await callCrypto('qm', b64, { secret: cfg.secret })
    } },
  'js-expression': { label: 'JS 表达式', group: 'app', direction: 'both',
    configFields: [{ name: 'code', label: '代码 (可用 vars, responses, md5)', required: true, multiline: true,
      placeholder: `// 可用变量: vars, responses, md5\nreturn input;` }],
    decode: async (v, cfg, ctx) => {
      try {
        const r = await window.electronAPI.script.run({ code: cfg.code, input: v, context: { vars: ctx?.vars || {}, envs: ctx?.envs || {}, responses: ctx?.responses || [] } })
        return r.ok ? r.value : `[JS失败: ${r.error}]`
      } catch (e) { return `[JS失败: ${e.message}]` }
    },
    encode: async (v, cfg, ctx) => {
      try {
        const r = await window.electronAPI.script.run({ code: cfg.code, input: v, context: { vars: ctx?.vars || {}, envs: ctx?.envs || {}, responses: ctx?.responses || [] } })
        return r.ok ? r.value : `[JS失败: ${r.error}]`
      } catch (e) { return `[JS失败: ${e.message}]` }
    } },
}

// 💡 通用「去除内部换行」开关字段（值为字符串 'true' / 'false'，与现有 config 存储方式一致）
const STRIP_NEWLINES_FIELD = {
  name: 'stripInnerNewlines',
  label: '去除内部换行',
  type: 'boolean',          // 新增：UI 识别此类型渲染 Switch
  required: false,
  defaultValue: 'false',
}

// 💡 只给「输入可能含多行文本」的算法组加，数值/时间类不需要
const STRIP_GROUPS = new Set(['encoding', 'format', 'crypto', 'hash', 'app'])

Object.keys(TRANSFORMS).forEach((k) => {
  const tpl = TRANSFORMS[k]
  if (!STRIP_GROUPS.has(tpl.group)) return
  const fields = tpl.configFields || []
  if (fields.some((f) => f.name === 'stripInnerNewlines')) return
  // 不修改原对象引用，整体替换，保持不可变
  TRANSFORMS[k] = { ...tpl, configFields: [...fields, STRIP_NEWLINES_FIELD] }
})

export async function applyTransform({ key, direction, value, config, ctx }) {
  const t = TRANSFORMS[key]
  if (!t) throw new Error(`未知算法：${key}`)
  const fn = direction === 'encode' ? t.encode : t.decode
  if (!fn) throw new Error(`算法 ${t.label} 不支持方向 ${direction}`)

  // 💡 「去除内部换行」开关：true / 'true' 都生效。
  // 仅去掉内部换行，不动首尾（首尾已由 sanitizeContent.trim 处理）。
  // 注意：JSON 输入在此前已被 sanitizeContent 紧凑化，不受影响。
  const strip = config?.stripInnerNewlines
  let v = String(value ?? '')
  if (strip === 'true' || strip === true) {
    v = v.replace(/\r?\n/g, '')
  }

  // config 原样传入：所有 encode/decode 只读自己认识的字段，多余字段安全
  return await fn(v, config || {}, ctx || {})
}