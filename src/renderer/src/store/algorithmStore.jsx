import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'har-algorithms-v1';
const AlgorithmContext = createContext(null);

export function AlgorithmProvider({ children }) {
  // { [algorithmKey]: { enabled: boolean, config: {...} } }
  const [algorithms, setAlgorithms] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      console.log('[AlgorithmStore] 初始化:', Object.keys(obj));
      return obj;
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(algorithms)); } catch (e) {
      console.error('[AlgorithmStore] 持久化失败:', e);
    }
  }, [algorithms]);

  const updateAlgorithm = (key, patch) => {
    setAlgorithms((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
    console.log('[AlgorithmStore] updateAlgorithm:', key, patch);
  };

  const removeAlgorithm = (key) => {
    setAlgorithms((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const configMap = useMemo(
    () => Object.fromEntries(
      Object.entries(algorithms)
        .filter(([, v]) => v?.config)
        .map(([k, v]) => [k, v.config])
    ),
    [algorithms]
  );

  return (
    <AlgorithmContext.Provider value={{ algorithms, updateAlgorithm, removeAlgorithm, configMap }}>
      {children}
    </AlgorithmContext.Provider>
  );
}

export function useAlgorithms() {
  const ctx = useContext(AlgorithmContext);
  if (!ctx) throw new Error('useAlgorithms 必须在 AlgorithmProvider 内使用');
  return ctx;
}