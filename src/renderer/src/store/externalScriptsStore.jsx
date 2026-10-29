import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function ExternalScriptsProvider({ children }) {
  const [scripts, setScripts] = useState([]);
  const [dir, setDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.script) {
      setError('主进程未开放 script 接口');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await window.electronAPI.script.list();
      if (!r.ok) {
        setError(r.error);
        setScripts([]);
        return;
      }
      setScripts(r.scripts || []);
      setDir(r.dir || '');
      console.log('[ExternalScripts] 扫描到', r.scripts?.length || 0, '个脚本');
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openDir = useCallback(async () => {
    if (!window.electronAPI?.script) return;
    try { await window.electronAPI.script.openDir(); } catch (e) { console.warn(e); }
  }, []);

  return (
    <Ctx.Provider value={{ scripts, dir, loading, error, refresh, openDir }}>
      {children}
    </Ctx.Provider>
  );
}

export function useExternalScripts() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useExternalScripts 必须在 ExternalScriptsProvider 内使用');
  return ctx;
}