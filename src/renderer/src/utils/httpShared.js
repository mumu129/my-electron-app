export const BLACKLIST_HEADERS = new Set([
  'host', 'content-length', 'connection', 'accept-encoding', 'content-encoding',
  'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-connection',
]);

export function buildHeadersFromEntry(req, resolve = (v) => v) {
  const headers = {};
  for (const h of req?.headers || []) {
    if (!h?.name) continue;
    if (h.name.startsWith(':')) continue;
    if (BLACKLIST_HEADERS.has(h.name.toLowerCase())) continue;
    headers[h.name] = resolve(h.value || '');
  }
  if (
    !Object.keys(headers).some((k) => k.toLowerCase() === 'cookie') &&
    Array.isArray(req?.cookies) &&
    req.cookies.length > 0
  ) {
    headers['Cookie'] = req.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }
  return headers;
}

export function buildBodyFromEntry(req, method, resolve = (v) => v) {
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return undefined;
  if (req?.postData?.text) return resolve(req.postData.text);
  if (Array.isArray(req?.postData?.params)) {
    return req.postData.params
      .map(
        (p) =>
          `${encodeURIComponent(p.name || '')}=${encodeURIComponent(
            resolve(p.value || '')
          )}`
      )
      .join('&');
  }
  return undefined;
}