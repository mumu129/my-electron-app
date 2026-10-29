import { deepClone, getPath, setPath, rebuildUrlFromQuery } from './har';
import { runParserChain } from './parsers';
import { resolveTemplate, hasTemplate } from './templateResolver';

/* ============ 值来源解析 ============ */
function getByPath(obj, pathStr) {
  if (!pathStr) return obj
  let v = obj
  for (const k of String(pathStr).split('.')) {
    if (v == null) return ''
    const i = parseInt(k, 10)
    v = Number.isNaN(i) ? v[k] : v[i]
  }
  return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
}

function safeJsonParse(s) {
  if (typeof s !== 'string') return s
  try { return JSON.parse(s) } catch { return s }
}

function resolveSourceRaw(src, { entry, context }) {
  switch (src.from) {
    case 'constant':
      return String(src.value ?? '')
    case 'timestamp':
      return src.unit === 's' ? String(Math.floor(Date.now() / 1000)) : String(Date.now())
    case 'random': {
      const len = src.len || 16
      let s = ''
      for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 36).toString(36)
      return s
    }
    case 'ownBody': {
      const text = entry?.request?.postData?.text || ''
      if (!text) return ''
      if (src.parse === 'json') {
        const obj = safeJsonParse(text)
        return typeof obj === 'object' ? getByPath(obj, src.path) : ''
      }
      return text
    }
    case 'ownUrl':
      return entry?.request?.url || ''
    case 'ownQuery':
      return (entry?.request?.queryString || []).find(q => q.name === src.path)?.value || ''
    case 'ownHeader':
      return (entry?.request?.headers || []).find(h => h.name?.toLowerCase() === String(src.path || '').toLowerCase())?.value || ''
    case 'ownField':
      return getByPath(entry, src.path)
    case 'prevResponse': {
      const resp = context?.steps?.[(context?.currentStep ?? 0) - 1]?.response
      const text = resp?.body || resp?.content?.text || ''
      if (!text) return ''
      if (src.parse === 'json') {
        const obj = safeJsonParse(text)
        return typeof obj === 'object' ? getByPath(obj, src.path) : ''
      }
      return text
    }
    case 'atRequest': {
      const e = context?.steps?.[src.index]?.entry
      return getByPath(e, src.path)
    }
    case 'atResponse': {
      const resp = context?.steps?.[src.index]?.response
      const text = resp?.body || resp?.content?.text || ''
      if (!text) return ''
      if (src.parse === 'json') {
        const obj = safeJsonParse(text)
        return typeof obj === 'object' ? getByPath(obj, src.path) : ''
      }
      return text
    }
    default:
      return ''
  }
}

function joinValues(values, mode, template) {
  if (mode === 'template') return String(template || '').replace(/\{(\w+)\}/g, (_, n) => values[n] ?? '')
  if (mode === 'amp') return Object.entries(values).map(([k, v]) => `${k}=${v}`).join('&')
  if (mode === 'none') return Object.values(values).join('')
  if (mode === 'json') return JSON.stringify(values)
  return Object.values(values).join('&')
}

async function resolveAndJoinSources(assignment, working, context, configMap, customTemplates) {
  const values = {}
  const sourceSteps = {}
  for (const src of assignment.valueSources) {
    let v = resolveSourceRaw(src, { entry: working, context })
    if (Array.isArray(src.chain) && src.chain.length > 0) {
      const r = await runParserChain(src.chain, v, configMap, { ...context, entry: working }, customTemplates)
      v = r.finalValue
      sourceSteps[src.label] = r.steps
    }
    values[src.label] = v
  }
  return {
    value: joinValues(values, assignment.joinMode || 'template', assignment.template),
    values,
    sourceSteps,
  }
}

/* ============ 主入口 ============ */
export async function applyAssignmentsToEntry(
  entry, assignments, configMap, context = { steps: [] }, options = {}
) {
  const { preserveTemplates = false, customTemplates = {} } = options
  let working = deepClone(entry)
  let queryChanged = false
  const writableUpdates = []

  for (const a of assignments || []) {
    if (!Array.isArray(a.fieldPath)) continue
    const fieldPath = a.fieldPath
    const subPath = a.jsonSubPath

    // 1. 拿字段当前值
    let currentValue
    if (subPath) {
      const text = getPath(working, fieldPath)
      const obj = safeJsonParse(text)
      currentValue = typeof obj === 'object' ? getByPath(obj, subPath) : ''
    } else {
      currentValue = getPath(working, fieldPath)
    }

    // 2. 决定 input
    let input
    let sourceInfo = null
    if (Array.isArray(a.valueSources) && a.valueSources.length > 0) {
      sourceInfo = await resolveAndJoinSources(a, working, context, configMap, customTemplates)
      input = sourceInfo.value
    } else {
      if (currentValue == null) continue
      const rawString = String(currentValue)
      const templated = hasTemplate(rawString)
      if (templated && preserveTemplates) continue
      input = templated ? resolveTemplate(rawString, context) : rawString
    }

    // 3. 跑算法链
    let finalValue = input
    let chainSteps = []
    if (Array.isArray(a.chain) && a.chain.length > 0) {
      const r = await runParserChain(
        a.chain, input, configMap,
        { ...context, entry: working, fieldPath },
        customTemplates
      )
      finalValue = r.finalValue
      chainSteps = r.steps
    }

    // 4. 写回
    if (subPath) {
      const text = getPath(working, fieldPath)
      const obj = safeJsonParse(text)
      if (typeof obj !== 'object') continue
      const keys = String(subPath).split('.')
      let cur = obj
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] == null) cur[keys[i]] = {}
        cur = cur[keys[i]]
      }
      cur[keys[keys.length - 1]] = finalValue
      working = setPath(working, fieldPath, JSON.stringify(obj))
    } else {
      working = setPath(working, fieldPath, finalValue)
    }

    if (fieldPath[0] === 'request') {
      if (fieldPath[1] === 'queryString') queryChanged = true
      if (!sourceInfo) {
        // 只有纯字段处理的才写回（保持字段自演化）
        writableUpdates.push({
          fieldPath: subPath ? fieldPath : fieldPath,
          value: subPath ? finalValue : finalValue,
          jsonSubPath: subPath,
        })
      }
    }
  }

  if (!preserveTemplates && working.request) {
    const req = working.request
    if (req.url) req.url = resolveTemplate(req.url, context)
    for (const h of req.headers || []) { if (h.value) h.value = resolveTemplate(h.value, context) }
    if (req.postData?.text) req.postData.text = resolveTemplate(req.postData.text, context)
  }

  if (queryChanged && working.request) working.request.url = rebuildUrlFromQuery(working.request)

  return { entry: working, request: working.request, writableUpdates }
}