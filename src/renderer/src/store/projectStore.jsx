import React, { createContext, useContext, useEffect, useState } from 'react';
import { deepClone, setPath } from '../utils/har';

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
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); }
    catch (e) { console.error('[ProjectStore] 持久化失败:', e); }
  }, [projects]);

  const createProject = (name) => {
    const p = { id: uid(), name, createdAt: Date.now(), groups: [], proxy: '' };
    setProjects((prev) => [...prev, p]);
    return p;
  };

  const deleteProject = (projectId) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const updateProjectProxy = (projectId, proxy) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, proxy: proxy || '' } : p))
    );
    console.log('[ProjectStore] updateProjectProxy:', projectId, proxy);
  };

  const createGroup = (projectId, name) => {
    const g = { id: uid(), name, requests: [] };
    setProjects((prev) =>
      prev.map((p) => p.id === projectId ? { ...p, groups: [...p.groups, g] } : p)
    );
    return g;
  };

  const renameGroup = (projectId, groupId, newName) => {
    const n = String(newName || '').trim();
    if (!n) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, groups: p.groups.map((g) => g.id === groupId ? { ...g, name: n } : g) }
          : p
      )
    );
  };

  const moveGroup = (projectId, groupId, direction) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const idx = p.groups.findIndex((g) => g.id === groupId);
        if (idx < 0) return p;
        const target = idx + direction;
        if (target < 0 || target >= p.groups.length) return p;
        const groups = [...p.groups];
        [groups[idx], groups[target]] = [groups[target], groups[idx]];
        return { ...p, groups };
      })
    );
  };

  const reorderGroups = (projectId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const groups = [...p.groups];
        if (fromIndex < 0 || fromIndex >= groups.length) return p;
        if (toIndex < 0 || toIndex >= groups.length) return p;
        const [moved] = groups.splice(fromIndex, 1);
        groups.splice(toIndex, 0, moved);
        return { ...p, groups };
      })
    );
  };

  const deleteGroup = (projectId, groupId) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, groups: p.groups.filter((g) => g.id !== groupId) } : p
      )
    );
  };

  const addRequestsToGroup = (projectId, groupId, requests) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              requests: [
                ...g.requests,
                ...requests.map((r) => {
                  const cloned = deepClone(r);
                  return {
                    ...cloned,
                    _addedAt: Date.now(),
                    _initialRequest: deepClone(r.request),
                    _initialResponse: deepClone(r.response),
                  };
                }),
              ],
            };
          }),
        };
      })
    );
  };

  const updateGroupRequests = (projectId, groupId, requests) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => g.id === groupId ? { ...g, requests } : g),
        };
      })
    );
  };

  const updateRequestFields = (projectId, groupId, entryUid, fieldUpdates) => {
    if (!Array.isArray(fieldUpdates) || fieldUpdates.length === 0) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              requests: g.requests.map((r) => {
                if (r._uid !== entryUid) return r;
                let next = deepClone(r);
                for (const { fieldPath, value } of fieldUpdates) {
                  next = setPath(next, fieldPath, value);
                }
                return next;
              }),
            };
          }),
        };
      })
    );
  };

  const applyResponse = (projectId, groupId, entryUid, response) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              requests: g.requests.map((r) =>
                r._uid === entryUid ? { ...r, response: deepClone(response) } : r
              ),
            };
          }),
        };
      })
    );
  };

  const resetGroupRequests = (projectId, groupId) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          groups: p.groups.map((g) => {
            if (g.id !== groupId) return g;
            return {
              ...g,
              requests: g.requests.map((r) => ({
                ...r,
                request: deepClone(r._initialRequest || r.request),
                response: deepClone(r._initialResponse || r.response),
              })),
            };
          }),
        };
      })
    );
  };

  return (
    <ProjectContext.Provider value={{
      projects, createProject, deleteProject, updateProjectProxy,
      createGroup, renameGroup, moveGroup, reorderGroups, deleteGroup,
      addRequestsToGroup, updateGroupRequests,
      updateRequestFields, applyResponse, resetGroupRequests,
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