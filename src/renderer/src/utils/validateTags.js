// src/renderer/src/utils/validateTags.js
import { TRANSFORMS } from './strictTransforms'

const TAG_OPEN_RE = /<@([\w-]+)(?::([\w-]+))?(?::([^>]+))?>/g
const TAG_CLOSE_RE = /<\/@([\w-]+)(?::([\w-]+))?>/g

// 解析标签参数（key=val,key=val）
function parseParams(str) {
  const out = {}
  if (!str) return out
  str.split(',').forEach((p) => {
    const i = p.indexOf('=')
    if (i <= 0) return
    out[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  })
  return out
}

/**
 * 静态校验标签语法 + 配置完整性
 * @param {string} text 待校验文本
 * @param {Object} opts { envs, scripts, globalAlgos }
 * @returns {Array<{level:'error'|'warn', message:string}>}
 */
export function validateTagText(text, opts = {}) {
  const { envs = {}, scripts = {}, globalAlgos = {} } = opts
  const issues = []
  if (!text || typeof text !== 'string') return issues

  // 1. 用栈匹配开闭标签
  const tokens = []
  let m
  const re = /<@([\w-]+)(?::([\w-]+))?(?::([^>]+))?>|<\/@([\w-]+)(?::([\w-]+))?>/g
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      // open
      tokens.push({ kind: 'open', type: m[1], algo: m[2] || '', params: m[3] || '', pos: m.index })
    } else if (m[4]) {
      // close
      tokens.push({ kind: 'close', type: m[4], algo: m[5] || '', pos: m.index })
    }
  }

  const stack = []
  for (const t of tokens) {
    if (t.kind === 'open') {
      stack.push(t)
    } else {
      const top = stack.pop()
      if (!top) {
        issues.push({ level: 'error', message: `位置 ${t.pos}: </@${t.type}${t.algo ? ':' + t.algo : ''}> 无匹配的开标签` })
      } else if (top.type !== t.type || top.algo !== t.algo) {
        issues.push({
          level: 'error',
          message: `位置 ${t.pos}: </@${t.type}${t.algo ? ':' + t.algo : ''}> 与开标签 <@${top.type}${top.algo ? ':' + top.algo : ''}> 不匹配`,
        })
      }
    }
  }
  stack.forEach((s) => {
    issues.push({ level: 'error', message: `位置 ${s.pos}: <@${s.type}${s.algo ? ':' + s.algo : ''}> 未闭合` })
  })

  // 2. 逐类型检查
  for (const t of tokens) {
    if (t.kind !== 'open') continue
    const params = parseParams(t.params)

    if (t.type === 'enc' || t.type === 'dec' || t.type === 'op') {
      if (!t.algo) {
        issues.push({ level: 'error', message: `位置 ${t.pos}: <@${t.type}> 缺少算法名` })
        continue
      }
      const tpl = TRANSFORMS[t.algo]
      if (!tpl) {
        issues.push({ level: 'error', message: `位置 ${t.pos}: 未知算法 "${t.algo}"` })
        continue
      }
      // 检查必填 configFields
      const cfg = globalAlgos[t.algo]?.config || {}
      ;(tpl.configFields || []).forEach((f) => {
        if (!f.required) return
        const fromTag = params[f.name]
        const fromGlobal = cfg[f.name]
        if (!fromTag && !fromGlobal) {
          issues.push({
            level: 'warn',
            message: `位置 ${t.pos}: 算法 "${tpl.label}" 的必填字段 "${f.label || f.name}" 未在标签参数或全局算法中配置`,
          })
        }
      })
      // 布尔字段合法性
      ;(tpl.configFields || []).forEach((f) => {
        if (f.type !== 'boolean') return
        const v = params[f.name]
        if (v != null && v !== 'true' && v !== 'false') {
          issues.push({ level: 'error', message: `位置 ${t.pos}: "${f.label || f.name}" 只能为 true/false，当前 "${v}"` })
        }
      })
    } else if (t.type === 'env') {
      if (!t.algo) issues.push({ level: 'error', message: `位置 ${t.pos}: <@env> 缺少变量名` })
      else if (!(t.algo in envs)) issues.push({ level: 'warn', message: `位置 ${t.pos}: 环境变量 "${t.algo}" 未定义` })
    } else if (t.type === 'script') {
      if (!t.algo) issues.push({ level: 'error', message: `位置 ${t.pos}: <@script> 缺少脚本名` })
      else if (!scripts[t.algo]) issues.push({ level: 'error', message: `位置 ${t.pos}: 脚本 "${t.algo}" 不存在` })
    } else if (t.type === 'var') {
      if (!t.algo) issues.push({ level: 'error', message: `位置 ${t.pos}: <@var> 缺少变量名` })
    } else {
      issues.push({ level: 'warn', message: `位置 ${t.pos}: 未知标签类型 "${t.type}"` })
    }
  }

  return issues
}