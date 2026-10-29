import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'har-algorithms-v2';
const AlgorithmContext = createContext(null);

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return { global: {}, projects: {} };
  if (!raw.global && !raw.projects) return { global: raw, projects: {} };
  return { global: raw.global || {}, projects: raw.projects || {} };
}

export function AlgorithmProvider({ children }) {
  const [algorithms, setAlgorithms] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      const n = normalize(obj);
      console.log('[AlgorithmStore] 初始化:', {
        global: Object.keys(n.global),
        projects: Object.keys(n.projects),
      });
      return n;
    } catch (e) {
      console.error('[AlgorithmStore] 读取失败:', e);
      return { global: {}, projects: {} };
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(algorithms)); }
    catch (e) { console.error('[AlgorithmStore] 持久化失败:', e); }
  }, [algorithms]);

  const updateGlobalAlgorithm = (key, patch) => {
    setAlgorithms((prev) => ({
      ...prev,
      global: { ...prev.global, [key]: { ...(prev.global[key] || {}), ...patch } },
    }));
  };

  const removeGlobalAlgorithm = (key) => {
    setAlgorithms((prev) => {
      const next = { ...prev.global };
      delete next[key];
      return { ...prev, global: next };
    });
  };

  const updateProjectAlgorithm = (projectId, key, patch) => {
    setAlgorithms((prev) => ({
      ...prev,
      projects: {
        ...prev.projects,
        [projectId]: {
          ...(prev.projects[projectId] || {}),
          [key]: { ...(prev.projects[projectId]?.[key] || {}), ...patch },
        },
      },
    }));
  };

  const removeProjectAlgorithm = (projectId, key) => {
    setAlgorithms((prev) => {
      const proj = { ...(prev.projects[projectId] || {}) };
      delete proj[key];
      return { ...prev, projects: { ...prev.projects, [projectId]: proj } };
    });
  };

  const clearProjectAlgorithms = (projectId) => {
    setAlgorithms((prev) => {
      const next = { ...prev.projects };
      delete next[projectId];
      return { ...prev, projects: next };
    });
  };

  const getEffectiveConfigMap = (projectId) => {
    const global = {};
    Object.entries(algorithms.global || {}).forEach(([k, v]) => {
      if (v?.config) global[k] = v.config;
    });
    if (!projectId) return global;
    const proj = {};
    Object.entries(algorithms.projects?.[projectId] || {}).forEach(([k, v]) => {
      if (v?.config) proj[k] = v.config;
    });
    return { ...global, ...proj };
  };

  return (
    <AlgorithmContext.Provider value={{
      algorithms,
      updateGlobalAlgorithm, removeGlobalAlgorithm,
      updateProjectAlgorithm, removeProjectAlgorithm, clearProjectAlgorithms,
      getEffectiveConfigMap,
    }}>
      {children}
    </AlgorithmContext.Provider>
  );
}

export function useAlgorithms() {
  const ctx = useContext(AlgorithmContext);
  if (!ctx) throw new Error('useAlgorithms 必须在 AlgorithmProvider 内使用');
  return ctx;
}