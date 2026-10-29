export function parseHar(text) {
  console.log('[HAR][parseHar] 输入长度:', text?.length);
  let har;
  try {
    har = JSON.parse(text);
  } catch (e) {
    console.error('[HAR][parseHar] JSON 解析失败:', e);
    throw new Error('不是合法的 JSON 文件');
  }
  if (!har || !har.log || !Array.isArray(har.log.entries)) {
    throw new Error('不是合法的 HAR 文件（缺少 log.entries）');
  }
  console.log('[HAR][parseHar] entries =', har.log.entries.length);
  return har;
}

export function decodeContent(content = {}) {
  const { text = '', encoding, mimeType = '' } = content;
  if (!text) return { text: '', isImage: false, isBinary: false };
  if (encoding === 'base64') {
    if (mimeType.startsWith('image/')) {
      return { text: `data:${mimeType};base64,${text}`, isImage: true, isBinary: true };
    }
    try {
      const bin = atob(text);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return {
        text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
        isImage: false,
        isBinary: false,
      };
    } catch {
      return { text: '（二进制内容，无法预览）', isImage: false, isBinary: true };
    }
  }
  return { text, isImage: false, isBinary: false };
}

export function prettyJSON(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

export function formatBytes(n) {
  if (n == null || n < 0) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ms) {
  if (ms == null || ms < 0) return '-';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatStarted(s) {
  if (!s) return '-';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function statusColor(status) {
  if (!status) return 'default';
  if (status < 300) return 'success';
  if (status < 400) return 'processing';
  if (status < 500) return 'warning';
  return 'error';
}

export function shortUrl(url = '') {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || '');
  } catch { return url; }
}

export function parseUrlParts(url = '') {
  try {
    const u = new URL(url);
    return {
      host: u.host,
      path: u.pathname + (u.search || ''),
      protocol: u.protocol.replace(':', ''),
    };
  } catch {
    return { host: '', path: url, protocol: '' };
  }
}

export function entrySize(entry) {
  const c = entry?.response?.content;
  return c?.size ?? entry?.response?.bodySize ?? -1;
}

export function genUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 深拷贝并替换字段值，path 支持数组或点分隔字符串 */
export function setPath(obj, path, value) {
  const keys = Array.isArray(path) ? path : String(path).split('.');
  const clone = typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
  return clone;
}