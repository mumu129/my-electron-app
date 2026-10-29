import { deepClone, getPath, setPath, rebuildUrlFromQuery } from './har';
import { runParserChain } from './parsers';
import { resolveTemplate, hasTemplate } from './templateResolver';

export async function applyAssignmentsToEntry(
  entry, assignments, configMap, context = { steps: [] }, options = {}
) {
  const { preserveTemplates = false, customTemplates = {} } = options;

  console.log('[Parser][apply] start', {
    entryUid: entry._uid,
    assignmentsCount: (assignments || []).length,
    customTemplatesKeys: Object.keys(customTemplates),
    configMapKeys: Object.keys(configMap),
    preserveTemplates,
  });

  let request = deepClone(entry.request || {});
  let queryChanged = false;
  const writableUpdates = [];

  for (const a of assignments || []) {
    if (!Array.isArray(a.fieldPath) || a.fieldPath[0] !== 'request') {
      console.log('[Parser][apply] 跳过非 request 字段:', a.fieldPath);
      continue;
    }
    const pathInRequest = a.fieldPath.slice(1);
    const rawValue = getPath(request, pathInRequest);
    console.log('[Parser][apply] 处理字段', pathInRequest, '原值=', rawValue);
    if (rawValue == null) {
      console.log('[Parser][apply] 原值为 null，跳过');
      continue;
    }

    const rawString = String(rawValue);
    const templated = hasTemplate(rawString);
    if (templated && preserveTemplates) {
      console.log('[Parser][apply] 有模板，preview 模式跳过');
      continue;
    }

    let value = templated ? resolveTemplate(rawString, context) : rawString;
    const chain = Array.isArray(a.chain) ? a.chain : [];
    console.log('[Parser][apply] chain=', chain);

    if (chain.length > 0) {
      const { finalValue, steps } = await runParserChain(
        chain, value, configMap, context, customTemplates
      );
      console.log('[Parser][apply] chain 执行结果:', { finalValue, steps });
      value = finalValue;
    }

    request = setPath(request, pathInRequest, value);
    if (pathInRequest[0] === 'queryString') queryChanged = true;

    if (!templated) {
      writableUpdates.push({ fieldPath: a.fieldPath, value });
    }
    console.log('[Parser][apply] 字段写回:', pathInRequest, '=>', value);
  }

  if (!preserveTemplates) {
    if (request.url) request.url = resolveTemplate(request.url, context);
    for (const h of request.headers || []) {
      if (h.value) h.value = resolveTemplate(h.value, context);
    }
    if (request.postData?.text) request.postData.text = resolveTemplate(request.postData.text, context);
    for (const p of request.postData?.params || []) {
      if (p.value) p.value = resolveTemplate(p.value, context);
    }
    for (const q of request.queryString || []) {
      if (q.value) q.value = resolveTemplate(q.value, context);
    }
  }

  if (queryChanged) request.url = rebuildUrlFromQuery(request);

  console.log('[Parser][apply] done', {
    finalPostDataText: request.postData?.text,
    writableUpdates,
  });

  return { request, writableUpdates };
}