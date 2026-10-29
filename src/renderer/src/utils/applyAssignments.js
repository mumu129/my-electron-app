import { deepClone, getPath, setPath, rebuildUrlFromQuery } from './har';
import { runParserChain } from './parsers';
import { resolveTemplate, hasTemplate } from './templateResolver';

export async function applyAssignmentsToEntry(
  entry, assignments, configMap, context = { steps: [] }, options = {}
) {
  const { preserveTemplates = false } = options;
  let request = deepClone(entry.request || {});
  let queryChanged = false;
  const writableUpdates = [];

  for (const a of assignments || []) {
    if (!Array.isArray(a.fieldPath) || a.fieldPath[0] !== 'request') continue;
    const pathInRequest = a.fieldPath.slice(1);
    const rawValue = getPath(request, pathInRequest);
    if (rawValue == null) continue;

    const rawString = String(rawValue);
    const templated = hasTemplate(rawString);
    if (templated && preserveTemplates) continue;

    let value = templated ? resolveTemplate(rawString, context) : rawString;
    const chain = Array.isArray(a.chain) ? a.chain : [];
    if (chain.length > 0) {
      const { finalValue } = await runParserChain(chain, value, configMap, context);
      value = finalValue;
    }

    request = setPath(request, pathInRequest, value);
    if (pathInRequest[0] === 'queryString') queryChanged = true;

    if (!templated) {
      writableUpdates.push({ fieldPath: a.fieldPath, value });
    }
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

  return { request, writableUpdates };
}