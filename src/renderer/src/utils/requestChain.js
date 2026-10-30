// src/renderer/src/utils/requestChain.js
/**
 * 请求链表达式
 * 语法：
 *   req.<index>.body                      → 第 index 个请求的响应体（原文）
 *   req.<index>.json.path.to.field        → JSON 路径
 *   req.<index>.text                      → 同 body
 *   req.<index>.status                    → 状态码
 *   req.<index>.header.Content-Type       → 响应头（大小写不敏感）
 *   req.<index>.request.body              → 请求体（原始请求）
 *   req.<index>.request.json.xxx
 *   req.<index>.request.header.Xxx
 *   req.<index>.request.query.xxx
 *   req.<index>.request.url
 *   req.<index>.request.method
 *
 * ctx 结构：
 * {
 *   responses: [{ index, response: { status, statusText, headers:[{name,value}], body }, entry }],
 *   currentStep: number
 * }
 */

function safeJsonParse(s) {
  try { return JSON.parse(s) } catch { return undefined }
}

function getByPath(obj, pathArr) {
  let cur = obj
  for (const k of pathArr) {
    if (cur == null) return undefined
    if (typeof cur === 'string') {
      const p = safeJsonParse(cur)
      if (p === undefined) return undefined
      cur = p
    }
    if (typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  return cur
}

function findHeader(headers, name) {
  if (!Array.isArray(headers)) return undefined
  const n = String(name).toLowerCase()
  const h = headers.find((x) => String(x.name || '').toLowerCase() === n)
  return h?.value
}

export function resolveChainExpr(expr, ctx) {
  const raw = String(expr || '').trim()
  if (!raw) throw new Error('表达式为空')

  const parts = raw.split('.').map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2 || parts[0] !== 'req') {
    throw new Error(`表达式必须以 req. 开头，例：req.0.body；当前：${raw}`)
  }
  const index = parseInt(parts[1], 10)
  if (Number.isNaN(index) || index < 0) throw new Error(`非法请求索引：${parts[1]}`)

  const step = ctx?.responses?.[index]
  if (!step) throw new Error(`第 ${index} 个请求尚未执行/无上下文`)

  const tail = parts.slice(2)
  if (tail.length === 0) throw new Error(`表达式不完整：${raw}`)

  // 请求侧
  if (tail[0] === 'request') {
    const req = step.entry?.request || {}
    const sub = tail.slice(1)
    if (sub.length === 0) throw new Error(`不完整：${raw}`)
    const k = sub[0]
    if (k === 'url') return req.url
    if (k === 'method') return req.method
    if (k === 'body') {
      return req.postData?.text ?? ''
    }
    if (k === 'json') {
      const text = req.postData?.text ?? ''
      const obj = safeJsonParse(text)
      if (obj === undefined) throw new Error(`第 ${index} 个请求体不是 JSON`)
      if (sub.length === 1) return obj
      return getByPath(obj, sub.slice(1))
    }
    if (k === 'header') return findHeader(req.headers, sub[1])
    if (k === 'query') {
      const q = (req.queryString || []).find((x) => x.name === sub[1])
      return q?.value
    }
    throw new Error(`未知的 request 子路径：${k}`)
  }

  // 响应侧
  const resp = step.response || {}
  const k = tail[0]
  if (k === 'status') return resp.status
  if (k === 'statusText') return resp.statusText
  if (k === 'header') return findHeader(resp.headers, tail[1])
  if (k === 'body' || k === 'text') {
    if (tail.length === 1) return resp.body ?? ''
    throw new Error(`body 后不应有子路径：${raw}（如需取 JSON 字段请用 json.xxx）`)
  }
  if (k === 'json') {
    const obj = safeJsonParse(resp.body ?? '')
    if (obj === undefined) throw new Error(`第 ${index} 个响应体不是 JSON`)
    if (tail.length === 1) return obj
    const v = getByPath(obj, tail.slice(1))
    if (v === undefined) throw new Error(`路径不存在：${tail.slice(1).join('.')}`)
    return v
  }
  throw new Error(`未知的响应子路径：${k}`)
}

/** 校验表达式（不抛错，返回 { ok, error }） */
export function validateChainExpr(expr) {
  try {
    // 不执行，仅结构检查
    const raw = String(expr || '').trim()
    if (!raw) return { ok: false, error: '表达式为空' }
    const parts = raw.split('.').map((s) => s.trim()).filter(Boolean)
    if (parts.length < 2) return { ok: false, error: '表达式太短' }
    if (parts[0] !== 'req') return { ok: false, error: '必须以 req. 开头' }
    if (Number.isNaN(parseInt(parts[1], 10))) return { ok: false, error: '第二段必须是请求索引' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}