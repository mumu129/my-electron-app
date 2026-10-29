/** 模板语法：
 *  {{step.0.data.signature}} → 第 1 个请求本轮响应的 JSON 字段
 *  {{step.1}}                → 第 2 个请求本轮响应的完整 body
 *  中间值是 JSON 字符串时自动 parse
 */

export function resolveTemplate(str, ctx) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
    const v = resolveExpression(expr, ctx);
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

function resolveExpression(expr, ctx) {
  const parts = String(expr).split('.').map((s) => s.trim()).filter(Boolean);
  if (parts[0] !== 'step' || parts.length < 2) return undefined;
  const index = parseInt(parts[1], 10);
  if (Number.isNaN(index)) return undefined;
  const step = ctx?.steps?.[index];
  if (!step || step.error) return undefined;

  let value = step.response?.body;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* 保持字符串 */ }
  }
  for (let i = 2; i < parts.length; i++) {
    if (value == null) return undefined;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return undefined; }
    }
    if (typeof value !== 'object') return undefined;
    value = value[parts[i]];
  }
  return value;
}

export function extractReferences(str) {
  if (typeof str !== 'string') return [];
  const out = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m;
  while ((m = re.exec(str)) !== null) out.push(m[1]);
  return out;
}

export function hasTemplate(str) {
  return typeof str === 'string' && /\{\{[^}]+\}\}/.test(str);
}