// src/renderer/src/utils/envRuleRunner.js
import { applyTransform, TRANSFORMS } from './strictTransforms'

/**
 * 按规则从 HAR entries 中提取值
 * @param {Array} entries  HAR entries
 * @param {Object} rule    env 规则
 * @param {Object} globalAlgorithms  algorithmStore.global（取 config 用）
 * @returns {Promise<{ok:boolean, value?:string, error?:string}>}
 */
export async function runEnvRule(entries, rule, globalAlgorithms) {
  if (!rule || !rule.urlMatch) return { ok: false, error: '规则缺少 URL 匹配' }
  if (!rule.regex) return { ok: false, error: '规则缺少正则' }

  const list = Array.isArray(entries) ? entries : []
  const kw = String(rule.urlMatch)
  const wantMethod = rule.method ? String(rule.method).toUpperCase() : null

  // 取最新一条（HAR entries 后加载的在后面）
  const matched = []
  for (const e of list) {
    const url = e?.request?.url || ''
    if (!url.includes(kw)) continue
    if (wantMethod && String(e.request.method || '').toUpperCase() !== wantMethod) continue
    matched.push(e)
  }
  if (matched.length === 0) {
    return { ok: false, error: `未找到匹配 "${kw}"${wantMethod ? ' ' + wantMethod : ''} 的请求` }
  }
  const entry = matched[matched.length - 1]

  // 1. 取原始值
  let raw
  try { raw = extractRawValue(entry, rule.source) }
  catch (e) { return { ok: false, error: `取值失败: ${e.message}` } }
  if (raw == null) return { ok: false, error: '未取到内容' }

  // 2. 可选解密
  let text = raw
  if (rule.decrypt && rule.decrypt.algoKey) {
    const algoKey = rule.decrypt.algoKey
    const tpl = TRANSFORMS[algoKey]
    if (!tpl) return { ok: false, error: `未知算法: ${algoKey}` }
    const cfg = globalAlgorithms?.[algoKey]?.config
    if (!cfg || Object.keys(cfg).length === 0) {
      return { ok: false, error: `算法「${tpl.label}」尚未在「全局算法」中配置密钥` }
    }

    const inputEncoding = rule.inputEncoding || 'base64'
    let input
    try {
      if (inputEncoding === 'hex') input = hexToBase64(raw)
      else if (inputEncoding === 'utf8') input = raw
      else input = raw  // base64
    } catch (e) { return { ok: false, error: `密文格式处理失败: ${e.message}` } }

    try {
      text = await applyTransform({
        key: algoKey, direction: 'decode',
        value: input, config: cfg, ctx: {},
      })
    } catch (e) { return { ok: false, error: `解密失败: ${e.message}` } }

    if (typeof text !== 'string') {
      try { text = bytesToBase64(text) }
      catch { return { ok: false, error: '解密结果无法转成字符串' } }
    }
  }

  // 3. 正则提取（JSON / 表单 / 任意文本一视同仁）
  let regex
  try { regex = new RegExp(rule.regex, rule.flags || '') }
  catch (e) { return { ok: false, error: `正则非法: ${e.message}` } }

  const m = text.match(regex)
  if (!m) return { ok: false, error: '正则未匹配到内容' }
  const groupIndex = Number.isInteger(rule.groupIndex) ? rule.groupIndex : 1
  const value = m[groupIndex] ?? m[1] ?? m[0] ?? ''
  return { ok: true, value: String(value) }
}

function extractRawValue(entry, source) {
  const src = source || { type: 'responseBody' }
  const req = entry.request || {}
  const res = entry.response || {}

  switch (src.type) {
    case 'responseBody': {
      const c = res.content || {}
      // HAR 的 content.text 在 encoding==='base64' 时是 base64 字符串，
      // 直接返回字符串，让 inputEncoding 决定后续如何解释
      return c.text || ''
    }
    case 'requestBody':
      return (req.postData || {}).text || ''
    case 'responseHeader': {
      const name = (src.name || '').toLowerCase()
      if (!name) throw new Error('缺少 header 名')
      const h = (res.headers || []).find((x) => (x.name || '').toLowerCase() === name)
      return h ? String(h.value ?? '') : null
    }
    case 'requestHeader': {
      const name = (src.name || '').toLowerCase()
      if (!name) throw new Error('缺少 header 名')
      const h = (req.headers || []).find((x) => (x.name || '').toLowerCase() === name)
      return h ? String(h.value ?? '') : null
    }
    case 'query': {
      const name = src.name || ''
      if (!name) throw new Error('缺少 query 名')
      try {
        const u = new URL(req.url || '')
        return u.searchParams.get(name) || ''
      } catch { return '' }
    }
    default:
      throw new Error(`未知来源: ${src.type}`)
  }
}

function hexToBase64(hex) {
  if (typeof hex !== 'string') throw new Error('hex 输入必须是字符串')
  const cleaned = hex.trim()
  if (cleaned.length === 0) throw new Error('hex 为空')
  if (cleaned.length % 2 !== 0 || /[^0-9a-fA-F]/.test(cleaned)) throw new Error('非法 hex')
  const bytes = new Uint8Array(cleaned.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function bytesToBase64(v) {
  if (v instanceof Uint8Array) {
    let bin = ''
    for (let i = 0; i < v.length; i++) bin += String.fromCharCode(v[i])
    return btoa(bin)
  }
  if (v && v.type === 'Buffer' && Array.isArray(v.data)) {
    return bytesToBase64(new Uint8Array(v.data))
  }
  return String(v ?? '')
}