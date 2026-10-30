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

function findInnermost(text, actionFilter = null) {
  const openRegex = /<@(enc|dec):([\w-]+)(?::([^>]+))?>/g;
  let match;
  
  while ((match = openRegex.exec(text)) !== null) {
    const [fullOpen, action, algoKey, params] = match;
    if (actionFilter && action !== actionFilter) continue;
    
    const closeTag = `</@${action}:${algoKey}>`;
    const closeIdx = text.indexOf(closeTag, openRegex.lastIndex);
    if (closeIdx === -1) continue;
    
    const content = text.slice(openRegex.lastIndex, closeIdx);
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
    return `[加密失败: ${e?.message || e}]`;
  }
}

export function wrapTag(tag, content, params = '') {
  const p = params ? `:${params}` : '';
  return `<@${tag}${p}>${content}</@${tag}>`;
}

/**
 * 核心：执行所有解密操作，但保留标签（用于回写模板状态）
 */
export async function updateDecTags(text) {
  if (!text || typeof text !== 'string') return text;
  let cur = text;
  let guard = 0;
  
  // 用 <@dec-done: 临时替换 <@dec: 防止死循环
  while (guard++ < 100) {
    let found = false;
    const regex = /<@dec:([\w-]+)(?::([^>]+))?>/g;
    let match;
    regex.lastIndex = 0;
    
    while ((match = regex.exec(cur)) !== null) {
      const [fullOpen, algoKey, params] = match;
      const closeTag = `</@dec:${algoKey}>`;
      const closeIdx = cur.indexOf(closeTag, regex.lastIndex);
      if (closeIdx === -1) continue;
      
      const content = cur.slice(regex.lastIndex, closeIdx);
      if (/<@dec:/.test(content) || /<@enc:/.test(content)) continue; // 找最内层
      
      const config = parseParams(params);
      let v;
      try {
        v = await applyTransform({ key: algoKey, direction: 'decode', value: content, config });
      } catch {
        v = content;
      }
      
      const paramStr = Object.entries(config).map(([k, val]) => `${k}=${val}`).join(',');
      // 临时打上 done 标记
      const wrapped = `<@dec-done:${algoKey}${paramStr ? ':' + paramStr : ''}>${v}</@dec-done:${algoKey}>`;
      
      cur = cur.slice(0, match.index) + wrapped + cur.slice(closeIdx + closeTag.length);
      found = true;
      break; // 每次算完一个最内层就重头开始找
    }
    
    if (!found) break;
  }
  
  // 把 done 标记换回正常的标签
  return cur.replace(/<@dec-done:/g, '<@dec:').replace(/<\/@dec-done:/g, '</@dec:');
}

/**
 * 核心：发送时完全剥离 dec 标签，并执行 enc 标签
 */
export async function processTags(text) {
  if (!text || typeof text !== 'string') return text;
  let cur = text;
  let guard = 0;

  // 1. 剥去 dec
  while (guard++ < 1000) {
    const match = findInnermost(cur, 'dec');
    if (!match) break;
    const v = await tryDecode(match);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  // 2. 执行 enc
  guard = 0;
  while (guard++ < 1000) {
    const match = findInnermost(cur, 'enc');
    if (!match) break;
    const v = await tryEncode(match);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  return cur;
}