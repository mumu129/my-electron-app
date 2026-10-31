// src/renderer/src/utils/hackTags.js
import { applyTransform, TRANSFORMS } from './strictTransforms'

function parseParams(s) {
  const o = {}
  if (!s) return o
  s.split(',').forEach((p) => {
    const i = p.indexOf('=')
    if (i <= 0) return
    o[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  })
  return o
}

// 说明：算法输入值不能带空格/换行（会破坏签名、加解密），因此这里统一 trim
function sanitizeContent(content) {
  if (content == null) return ''
  const cleaned = String(content).trim()
  if ((cleaned.startsWith('{') && cleaned.endsWith('}')) || (cleaned.startsWith('[') && cleaned.endsWith(']'))) {
    try { return JSON.stringify(JSON.parse(cleaned)) } catch {}
  }
  return cleaned
}

// 💡 [修复] 统一的 ctx 默认值补全，防止内部 ctx.vars[...] 崩溃
function normalizeCtx(ctx) {
  const c = ctx || {}
  if (!c.vars) c.vars = {}
  if (!c.responses) c.responses = []
  if (!c.envs) c.envs = {}
  if (!c.scripts) c.scripts = {}
  return c
}

function findInnermostTag(text, allowedTypes) {
  const typeRegex = allowedTypes.join('|')
  const openRegex = new RegExp(`<@(${typeRegex})(?::([\\w-]+))?(?::([^>]+))?>`, 'g')
  let match
  while ((match = openRegex.exec(text)) !== null) {
    const [fullOpen, type, algoKey, params] = match
    const closeTag = `</@${type}${algoKey ? ':' + algoKey : ''}>`
    const closeIdx = text.indexOf(closeTag, openRegex.lastIndex)
    if (closeIdx === -1) continue
    const content = text.slice(openRegex.lastIndex, closeIdx)
    if (content.includes('<@')) continue
    return { full: text.slice(match.index, closeIdx + closeTag.length), type, algoKey, config: parseParams(params), content, index: match.index }
  }
  return null
}

// op 标签：执行后结果固化回左侧文本（累积变化），由调用方负责写回 store
export async function updateOpTags(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text
  // 💡 [修复] 补全 ctx 默认值
  const context = normalizeCtx(ctx)
  let cur = text
  const processed = []
  let guard = 0
  while (guard++ < 1000) {
    const match = findInnermostTag(cur, ['op'])
    if (!match) break
    try {
      const cleanValue = sanitizeContent(match.content)
      const v = await applyTransform({ key: match.algoKey, direction: 'decode', value: cleanValue, config: match.config, ctx: context })
      const paramStr = Object.entries(match.config).map(([k, val]) => `${k}=${val}`).join(',')
      const newTag = wrapTag(`op:${match.algoKey}`, v, paramStr)
      const placeholder = `\x00OP${processed.length}\x00`
      processed.push(newTag)
      cur = cur.slice(0, match.index) + placeholder + cur.slice(match.index + match.full.length)
    } catch (e) { console.error('[updateOpTags]', e); break }
  }
  // 还原
  for (let i = 0; i < processed.length; i++) {
    cur = cur.replace(`\x00OP${i}\x00`, processed[i])
  }
  return cur
}

function resolveDirection(tagType, tpl) {
  // tagType = 'enc' | 'dec'；但如果算法不支持某方向，自动 fallback
  let dir = tagType === 'enc' ? 'encode' : 'decode'
  if (dir === 'encode' && !tpl?.encode) dir = 'decode'
  if (dir === 'decode' && !tpl?.decode) dir = 'encode'
  return dir
}

export async function processTags(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text
  // 💡 [修复] 补全 ctx 默认值（原来是 ctx = {} 直接崩在 ctx.vars[...] = ...）
  const context = normalizeCtx(ctx)
  let cur = text

  // 1. 剥离 op 外壳（值已由 updateOpTags 更新）
  cur = cur.replace(/<@op:[\w-]+(?::[^>]+)?>([\s\S]*?)<\/@op:[\w-]+>/g, '$1')

  // 2. 执行 enc / dec / var / script / env
  let guard = 0
  while (guard++ < 2000) {
    const match = findInnermostTag(cur, ['var', 'enc', 'dec', 'script', 'env'])
    if (!match) break
    let v = ''
    try {
      if (match.type === 'var') {
        const innerVal = sanitizeContent(await processTags(match.content, context))
        context.vars[match.algoKey] = innerVal
        v = innerVal
      } else if (match.type === 'env') {
        const envKey = match.algoKey
        const fromCtx = envKey && context.envs ? context.envs[envKey] : undefined
        v = fromCtx !== undefined && fromCtx !== null && fromCtx !== '' ? String(fromCtx) : sanitizeContent(match.content)
      } else if (match.type === 'script') {
        const scriptDef = context.scripts?.[match.algoKey]
        if (!scriptDef?.code) {
          v = '[脚本不存在]'
        } else {
          const r = await window.electronAPI.script.run({
            code: scriptDef.code,
            input: sanitizeContent(match.content),
            config: match.config,
            context: { vars: context.vars || {}, envs: context.envs || {}, responses: context.responses || [] },
          })
          if (!r?.ok) v = `[脚本错误: ${r?.error || '未知'}]`
          else v = r.value
        }
      } else {
        // enc / dec
        const tpl = TRANSFORMS[match.algoKey]
        const direction = resolveDirection(match.type, tpl)
        v = await applyTransform({
          key: match.algoKey,
          direction,
          value: sanitizeContent(match.content),
          config: match.config,
          ctx: context,
        })
      }
    } catch (e) { v = `[处理失败: ${e.message}]` }

    // 二进制处理
    if (v instanceof Uint8Array || (v && v.type === 'Buffer' && Array.isArray(v.data))) {
      const before = cur.slice(0, match.index)
      const after = cur.slice(match.index + match.full.length)
      if (!before.trim() && !after.trim()) {
        return v instanceof Uint8Array ? v : new Uint8Array(v.data)
      } else {
        const bytes = v instanceof Uint8Array ? v : new Uint8Array(v.data)
        let binStr = ''
        for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i])
        v = btoa(binStr)
      }
    }

    cur = cur.slice(0, match.index) + v + cur.slice(match.index + match.full.length)
  }
  return cur
}

export function wrapTag(tag, content, params = '') {
  const p = params ? `:${params}` : ''
  return `<@${tag}${p}>${content}</@${tag}>`
}

export async function extractVarsOnly(text, ctx = {}) {
  if (!text || typeof text !== 'string') return text
  // 💡 [修复] 补全 ctx 默认值
  const context = normalizeCtx(ctx)
  const allTags = /<@var:([\w-]+)>([\s\S]*?)<\/@var:\1>/g
  let match
  while ((match = allTags.exec(text)) !== null) {
    const inner = await processTags(match[2], context)
    context.vars[match[1]] = sanitizeContent(inner)
  }
  return text
}