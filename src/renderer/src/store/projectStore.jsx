import React, { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'har-projects-v1';
const ProjectContext = createContext(null);

const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      console.log('[ProjectStore] 初始化，projects =', list.length);
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) {
      console.error('[ProjectStore] 持久化失败:', e);
    }
  }, [projects]);

  const createProject = (name) => {
    const p = { id: uid(), name, createdAt: Date.now(), groups: [], algorithms: [] };
    setProjects((prev) => [...prev, p]);
    console.log('[ProjectStore] createProject:', p);
    return p;
  };

  const deleteProject = (projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const createGroup = (projectId, name) => {
    const g = { id: uid(), name, requests: [] };
    setProjects((prev) =>
      prev.map((p) => p.id === projectId ? { ...p, groups: [...p.groups, g] } : p)
    );
    return g;
  };

  const deleteGroup = (projectId, groupId) => {
    setProjects((prev) =>
      prev.map((p) => p.id === projectId
        ? { ...p, groups: p.groups.filter((g) => g.id !== groupId) } : p)
    );
  };

  const addRequestsToGroup = (projectId, groupId, requests) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => g.id === groupId
            ? { ...g, requests: [...g.requests, ...requests.map((r) => ({ ...r, _addedAt: Date.now() }))] }
            : g),
        };
      })
    );
  };

  return (
    <ProjectContext.Provider value={{
      projects, createProject, deleteProject,
      createGroup, deleteGroup, addRequestsToGroup,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjects 必须在 ProjectProvider 内使用');
  return ctx;
}