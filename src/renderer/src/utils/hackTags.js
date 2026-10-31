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
  const openRegex = /<@(enc|dec|script|var):([\w-]+)(?::([^>]+))?>/g;
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
      action, algoKey, config: parseParams(params), content, index: match.index,
    };
  }
  return null;
}

function findInnermostExecutable(text) {
  const openRegex = /<@(dec|script):([\w-]+)(?::([^>]+))?>/g;
  let match;
  while ((match = openRegex.exec(text)) !== null) {
    const [fullOpen, action, algoKey, params] = match;
    const closeTag = `</@${action}:${algoKey}>`;
    const closeIdx = text.indexOf(closeTag, openRegex.lastIndex);
    if (closeIdx === -1) continue;
    
    const content = text.slice(openRegex.lastIndex, closeIdx);
    if (content.includes('<@')) continue;
    
    return {
      full: text.slice(match.index, closeIdx + closeTag.length),
      action, algoKey, config: parseParams(params), content, index: match.index,
    };
  }
  return null;
}

// 提取变量并返回被剥离的干净文本（新增返回值）
export async function extractVarsOnly(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text;
  if (!ctx.vars) ctx.vars = {};
  let cur = text;
  let guard = 0;
  const varRegex = /<@var:([\w-]+)>([\s\S]*?)<\/@var:\1>/g;
  
  while (guard++ < 100) {
    varRegex.lastIndex = 0;
    let match = null;
    let m;
    while ((m = varRegex.exec(cur)) !== null) {
      // 找最内层的不含 var 的标签
      if (!m[2].includes('<@var:')) { match = m; break; }
    }
    if (!match) break;
    
    const [full, name, content] = match;
    // 依赖内部所有的 dec / enc 算出一个最终值
    const innerVal = await processTags(content, ctx);
    ctx.vars[name] = innerVal;
    // 用最终值替换掉 var 标签本身
    cur = cur.slice(0, match.index) + innerVal + cur.slice(match.index + full.length);
  }
  return cur;
}

async function tryDecode(match, ctx = {}) {
  try {
    if (match.action === 'script') {
      const scripts = ctx.scripts || {};
      const scriptDef = scripts[match.algoKey];
      if (!scriptDef || !scriptDef.code) return `[脚本不存在: ${match.algoKey}]`;
      
      const r = await window.electronAPI.script.run({
        code: scriptDef.code, input: match.content, config: match.config
      });
      return r.ok ? r.value : `[脚本报错: ${r.error}]`;
    }
    return await applyTransform({
      key: match.algoKey, direction: 'decode', value: match.content, config: match.config, ctx
    });
  } catch (e) { 
    return match.content; 
  }
}

async function tryEncode(match) {
  try {
    return await applyTransform({
      key: match.algoKey, direction: 'encode', value: match.content, config: match.config,
    });
  } catch (e) { return `[加密失败: ${e?.message || e}]`; }
}

export function wrapTag(tag, content, params = '') {
  const p = params ? `:${params}` : '';
  return `<@${tag}${p}>${content}</@${tag}>`;
}

export async function processTags(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text;
  if (!ctx.vars) ctx.vars = {};
  let cur = text;
  let guard = 0;

  guard = 0;
  while (guard++ < 1000) {
    const match = findInnermostExecutable(cur);
    if (!match) break;
    const v = await tryDecode(match, ctx);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  guard = 0;
  while (guard++ < 1000) {
    const match = findInnermost(cur, 'enc');
    if (!match) break;
    const v = await tryEncode(match);
    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length);
  }

  return cur;
}

export async function updateDecTags(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text;
  if (!ctx.vars) ctx.vars = {};
  let cur = text;
  let guard = 0;

  guard = 0;
  while (guard++ < 1000) {
    const openRegex = /<@(dec|script):([\w-]+)(?::([^>]+))?>/g;
    let match;
    while ((match = openRegex.exec(cur)) !== null) {
      const [fullOpen, action, algoKey, params] = match;
      if (algoKey === 'js-expression') continue; // JS 表达式不固化
      
      const closeTag = `</@${action}:${algoKey}>`;
      const closeIdx = cur.indexOf(closeTag, openRegex.lastIndex);
      if (closeIdx === -1) continue;
      
      const content = cur.slice(openRegex.lastIndex, closeIdx);
      if (content.includes('<@')) continue; 
      
      const v = await tryDecode({ action, algoKey, content, config: parseParams(params) }, ctx);
      const paramStr = Object.entries(parseParams(params)).map(([k, val]) => `${k}=${val}`).join(',');
      const wrapped = wrapTag(`${action}:${algoKey}`, v, paramStr);
      
      if (cur.slice(match.index, closeIdx + closeTag.length) === wrapped) {
        openRegex.lastIndex = 0;
        break;
      }
      
      cur = cur.slice(0, match.index) + wrapped + cur.slice(closeIdx + closeTag.length);
      openRegex.lastIndex = 0; 
      break; 
    }
  }

  return cur;
}