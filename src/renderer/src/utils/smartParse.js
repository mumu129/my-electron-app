/**
 * 智能 JSON 化：尽最大努力把一个"看起来像 JSON 的字符串"变成对象/标量
 * 处理策略（按顺序）：
 *  1. 标准 JSON.parse
 *  2. JSONP 剥壳：callback({...}) → JSON.parse("{...}")
 *  3. 从第一个 { / [ / " 开始，到末尾最近的 } / ] / " 结束，尝试 parse
 * 全部失败 → 返回原始输入（同一个引用，便于调用方用 === 判断失败）
 */
export function smartParse(input) {
  if (typeof input !== 'string') return input;
  const s = input.trim();
  if (!s) return input;

  // 1. 标准 parse
  try { return JSON.parse(s); } catch { /* continue */ }

  // 2. JSONP 剥壳：xxx(...)
  const jsonp = s.match(/^[\w$.]+\(([\s\S]*)\)\s*;?\s*$/);
  if (jsonp) {
    const inner = jsonp[1].trim();
    try { return JSON.parse(inner); } catch { /* continue */ }
    // JSONP 里如果还有前缀，走 3
  }

  // 3. 找第一个 { / [ / " 开始的位置
  const firstBracket = s.search(/[\[{" ]/);
  const startIdx = s.search(/[\[{"]/);
  if (startIdx > 0) {
    const tail = s.slice(startIdx);
    // 尝试从尾部对应闭合符向前切
    for (const close of ['}', ']', '"']) {
      const lastIdx = tail.lastIndexOf(close);
      if (lastIdx > 0) {
        try { return JSON.parse(tail.slice(0, lastIdx + 1)); } catch { /* try next */ }
      }
    }
  }

  // 全部失败 → 返回原值（同一个引用）
  return input;
}

/**
 * 智能 JSON 化并转回字符串：
 *  - 成功 parse 且是对象 → JSON.stringify
 *  - 成功 parse 且是标量 → String
 *  - 失败 → 原字符串
 */
export function smartParseToString(input) {
  const parsed = smartParse(input);
  if (parsed === input) return input;
  if (parsed == null) return String(parsed);
  if (typeof parsed === 'object') return JSON.stringify(parsed);
  return String(parsed);
}