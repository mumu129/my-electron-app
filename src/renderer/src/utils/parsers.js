// ============ 辅助：字节 / Base64 / Hex 互转 ============
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
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('不是合法的 Hex');
  }
  return new Uint8Array(clean.match(/.{2}/g).map((b) => parseInt(b, 16)));
}

function toUint8(s) {
  return new TextEncoder().encode(s || '');
}

function fromUint8(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

export const PARSER_TEMPLATES = {
  // ---------- 编码 / 解码 ----------
  'base64-decode': {
    label: 'Base64 解码', group: 'encode', configFields: null,
    fn: (s) => {
      if (!s) return '（空）';
      try { return fromUint8(b64ToBytes(s)); } catch { return '（不是合法的 Base64）'; }
    },
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
    // ---------- 数值运算 ----------
  'number-add-one': {
    label: '数值 +1', group: 'math', configFields: null,
    fn: (s) => {
      const n = Number(s);
      if (Number.isNaN(n)) return `（不是数字：${s}）`;
      return String(n + 1);
    },
  },
  'number-sub-one': {
    label: '数值 -1', group: 'math', configFields: null,
    fn: (s) => {
      const n = Number(s);
      if (Number.isNaN(n)) return `（不是数字：${s}）`;
      return String(n - 1);
    },
  },
  'number-mul-two': {
    label: '数值 ×2', group: 'math', configFields: null,
    fn: (s) => {
      const n = Number(s);
      if (Number.isNaN(n)) return `（不是数字：${s}）`;
      return String(n * 2);
    },
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
  // ---------- 哈希 ----------
  'sha-1': { label: 'SHA-1', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-1', toUint8(s)))) },
  'sha-256': { label: 'SHA-256', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', toUint8(s)))) },
  'sha-384': { label: 'SHA-384', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-384', toUint8(s)))) },
  'sha-512': { label: 'SHA-512', group: 'hash', configFields: null,
    fn: async (s) => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-512', toUint8(s)))) },

  // ---------- 对称加密 ----------
  'aes-gcm-decrypt': {
    label: 'AES-GCM 解密', group: 'symmetric',
    configFields: [
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64，建议 12 字节）', required: true, multiline: false },
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
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64，建议 12 字节）', required: true, multiline: false },
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
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64，16 字节）', required: true, multiline: false },
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
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'iv', label: 'IV（Base64，16 字节）', required: true, multiline: false },
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
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'counter', label: 'Counter（Base64，16 字节）', required: true, multiline: false },
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
      { name: 'key', label: 'AES 密钥（Base64，16/24/32 字节）', required: true, multiline: false },
      { name: 'counter', label: 'Counter（Base64，16 字节）', required: true, multiline: false },
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

  // ---------- 非对称加密 ----------
  'rsa-oaep-decrypt': {
    label: 'RSA-OAEP 解密', group: 'asymmetric',
    configFields: [{ name: 'privateKey', label: 'RSA 私钥（PKCS8 Base64）', required: true, multiline: true }],
    fn: async (s, cfg) => {
      try {
        const key = await crypto.subtle.importKey(
          'pkcs8', b64ToBytes(cfg.privateKey),
          { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
        );
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
        const key = await crypto.subtle.importKey(
          'spki', b64ToBytes(cfg.publicKey),
          { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
        );
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
        const key = await crypto.subtle.importKey(
          'pkcs8', b64ToBytes(cfg.privateKey),
          { name: 'RSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['decrypt']
        );
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
        const key = await crypto.subtle.importKey(
          'spki', b64ToBytes(cfg.publicKey),
          { name: 'RSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['encrypt']
        );
        const enc = await crypto.subtle.encrypt({ name: 'RSA-PKCS1-v1_5' }, key, toUint8(s));
        return bytesToB64(new Uint8Array(enc));
      } catch (e) { return `（RSA-PKCS1 加密失败：${e.message || e}）`; }
    },
  },
};

export const PARSER_GROUPS = {
  encode: '编码 / 解码',
  math: '数值运算',
  hash: '哈希',
  symmetric: '对称加密',
  asymmetric: '非对称加密',
};

/** 单步执行 */
export async function runParser(key, input, configMap = {}) {
  const tpl = PARSER_TEMPLATES[key];
  if (!tpl) return '（未知算法）';
  const cfg = configMap[key];
  if (tpl.configFields && !cfg) {
    return `（请先到「算法 → 全局算法」配置 ${tpl.label}）`;
  }
  try {
    return await tpl.fn(input, cfg);
  } catch (e) {
    return `（执行出错：${e.message || e}）`;
  }
}

/** 按顺序叠加执行多个算法
 * 返回 { finalValue: string, steps: [{ key, label, input, output }] }
 */
export async function runParserChain(chain, input, configMap = {}) {
  let value = input;
  const steps = [];
  for (const key of chain) {
    const tpl = PARSER_TEMPLATES[key];
    if (!tpl) {
      steps.push({ key, label: key, input: value, output: '（未知算法）' });
      continue;
    }
    const cfg = configMap[key];
    let output;
    if (tpl.configFields && !cfg) {
      output = `（请先到「算法 → 全局算法」配置 ${tpl.label}）`;
    } else {
      try { output = await tpl.fn(value, cfg); }
      catch (e) { output = `（执行出错：${e.message || e}）`; }
    }
    steps.push({ key, label: tpl.label, input: value, output });
    value = output;
  }
  return { finalValue: value, steps };
}