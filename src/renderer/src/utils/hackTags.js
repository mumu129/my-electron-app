// src/renderer/src/utils/hackTags.js
import { applyTransform } from './strictTransforms';

function parseParams(s) {
  const o = {};
  if (!s) return o;
  s.split(',').forEach((p) => {
    const i = p.indexOf('=');
    if (i <= 0) return;
    o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}

/**
 * 寻找最内层标签（内容中不含任何 <@ 开标签）
 */
function findInnermost(text, actionFilter = null) {
  const openRegex = /<@(enc|dec):([\w-]+)(?::([^>]+))?>/g;
  let match;
  
  while ((match = openRegex.exec(text)) !== null) {
    const [fullOpen, action, algoKey, params] = match;
    if (actionFilter && action !== actionFilter) continue;
    
    // 寻找对应的结束标签
    const closeTag = `</@${action}:${algoKey}>`;
    const closeIdx = text.indexOf(closeTag, openRegex.lastIndex);
    if (closeIdx === -1) continue; // 没有闭合，跳过
    
    const content = text.slice(openRegex.lastIndex, closeIdx);
    
    // 如果内容里还有未处理的子标签，说明不是最内层，跳过
    if (content.includes('<@')) continue;
    
    return {
      full: text.slice(match.index, closeIdx + closeTag.length),
      action,
      algoKey,
      config: parseParams(params),
      content,
      index: match.index,
    };
  }
  return null;
}

async function tryDecode(match) {
  try {
    return await applyTransform({
      key: match.algoKey,
      direction: 'decode',
      value: match.content,
      config: match.config,
    });
  } catch {
    // 若失败（说明里面已经是明文），直接返回原内容
    return match.content;
  }
}

async function tryEncode(match) {
  try {
    return await applyTransform({
      key: match.algoKey,
      direction: 'encode',
      value: match.content,
      config: match.config,
    });
  } catch (e) {
    console.error(`[Hackvertor] 加密失败 (${match.algoKey}):`, e);
    return `[加密失败: ${e?.message || e}]`;
  }
}

export async function processTags(text) {
  if (!text || typeof text !== 'string') return text;
  let cur = text;
  let guard = 0;

  // 1. 全解 dec 标签（从内向外，如果里面是明文也直接剥开）
  while (guard++ < 1000) {
    const match = findInnermost(cur, 'dec');
    if (!match) break;
    const v = await tryDecode(match);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  // 2. 全加 enc 标签（从内向外，加密内部内容）
  guard = 0;
  while (guard++ < 1000) {
    const match = findInnermost(cur, 'enc');
    if (!match) break;
    const v = await tryEncode(match);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  return cur;
}

export function wrapTag(tag, content, params = '') {
  const p = params ? `:${params}` : '';
  return `<@${tag}${p}>${content}</@${tag}>`;
}