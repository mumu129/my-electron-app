import { deepClone, getPath, setPath, rebuildUrlFromQuery } from './har';
import { runParserChain } from './parsers';
import { resolveTemplate, hasTemplate } from './templateResolver';

/**
 * 对 entry 应用所有解析（算法链 + 跨请求模板）
 * @param {object} entry
 * @param {array} assignments  [{ fieldPath, chain }]
 * @param {object} configMap   算法配置 { algorithmKey: config }
 * @param {object} context     { steps: [{ index, response }] }  本轮前序响应
 * @param {object} options
 *   - preserveTemplates: true 时保留 {{...}} 不替换（预览用）
 * @returns {{ request, writableUpdates }}
 *   - request: 应用后的完整 request（用于发送）
 *   - writableUpdates: 需要写回 entry 的字段（只含"不含模板"的字段）
 */
export async function applyAssignmentsToEntry(
  entry, assignments, configMap, context = { steps: [] }, options = {}
) {
  const { preserveTemplates = false } = options;
  let request = deepClone(entry.request || {});
  let queryChanged = false;
  const writableUpdates = [];

  // 1. 逐个 assignment 处理：先模板替换 → 再算法链
  for (const a of assignments || []) {
    if (!Array.isArray(a.fieldPath) || a.fieldPath[0] !== 'request') continue;
    const pathInRequest = a.fieldPath.slice(1);
    const rawValue = getPath(request, pathInRequest);
    if (rawValue == null) continue;

    const rawString = String(rawValue);
    const templated = hasTemplate(rawString);

    // 预览模式：含模板的字段保持原样，不做替换和算法
    if (templated && preserveTemplates) continue;

    let value = templated ? resolveTemplate(rawString, context) : rawString;
    const chain = Array.isArray(a.chain) ? a.chain : [];
    if (chain.length > 0) {
      const { finalValue } = await runParserChain(chain, value, configMap);
      value = finalValue;
    }

    request = setPath(request, pathInRequest, value);
    if (pathInRequest[0] === 'queryString') queryChanged = true;

    // 不含模板的字段才写回（演化字段）
    if (!templated) {
      writableUpdates.push({ fieldPath: a.fieldPath, value });
    }
  }

  // 2. 兜底：URL / headers / postData / queryString 里的 {{}} 替换
  if (!preserveTemplates) {
    if (request.url) request.url = resolveTemplate(request.url, context);
    for (const h of request.headers || []) {
      if (h.value) h.value = resolveTemplate(h.value, context);
    }
    if (request.postData?.text) {
      request.postData.text = resolveTemplate(request.postData.text, context);
    }
    for (const p of request.postData?.params || []) {
      if (p.value) p.value = resolveTemplate(p.value, context);
    }
    for (const q of request.queryString || []) {
      if (q.value) q.value = resolveTemplate(q.value, context);
    }
  }

  // 3. queryString 改了同步 URL
  if (queryChanged) {
    request.url = rebuildUrlFromQuery(request);
  }

  return { request, writableUpdates };
}