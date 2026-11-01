// src/renderer/src/store/projectStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { deepClone, setPath } from '../utils/har'

const STORAGE_KEY = 'har-projects-v1'
const ProjectContext = createContext(null)

const uid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function updateRequestList(list, entryUid, fn) {
  return list.map((r) => (r._uid === entryUid ? fn(r) : r))
}

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const list = raw ? JSON.parse(raw) : []
      return Array.isArray(list) ? list : []
    } catch { return [] }
  })

  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const setProjectsSync = useCallback((updater) => {
    setProjects((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      projectsRef.current = next
      return next
    })
  }, [])

  const getProjectSnapshot = useCallback((projectId) => {
    const list = projectsRef.current || []
    const p = list.find((x) => x.id === projectId)
    return p ? deepClone(p) : null
  }, [])

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)) }
      catch (e) { console.error('[ProjectStore] 持久化失败:', e) }
    }, 400)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [projects])

  const importProject = (projectData) => {
    const p = { ...projectData, id: uid(), createdAt: Date.now(), name: projectData.name ? `${projectData.name} (导入)` : '导入的项目' }
    if (!p.startupPlan) p.startupPlan = { groups: [] }
    setProjectsSync((prev) => [...prev, p])
    return p
  }

  const createProject = (name) => {
    const p = { id: uid(), name, createdAt: Date.now(), groups: [], proxy: '', startupPlan: { groups: [] } }
    setProjectsSync((prev) => [...prev, p])
    return p
  }

  const deleteProject = (projectId) => setProjectsSync((prev) => prev.filter((p) => p.id !== projectId))
  const renameProject = (projectId, newName) => setProjectsSync((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p)))

  // 💡 启动预案
  const updateStartupPlan = (projectId, plan) =>
    setProjectsSync((prev) => prev.map((p) => (p.id === projectId ? { ...p, startupPlan: plan } : p)))

  const createGroup = (projectId, name) => {
    const g = {
      id: uid(), name, requests: [],
      configs: { main: {}, sub: {} },
      proxy: '',
      subGroup: { requests: [], zones: [], successKeyword: '"code":200', maxRetries: 3, judgeVar: 'level' },
    }
    setProjectsSync((prev) => prev.map((p) => (p.id === projectId ? { ...p, groups: [...p.groups, g] } : p)))
    return g
  }

  const renameGroup = (projectId, groupId, newName) => {
    const n = String(newName || '').trim()
    if (!n) return
    setProjectsSync((prev) => prev.map((p) => (p.id === projectId ? { ...p, groups: p.groups.map((g) => (g.id === groupId ? { ...g, name: n } : g)) } : p)))
  }

  const updateGroupProxy = (projectId, groupId, proxy) =>
    setProjectsSync((prev) => prev.map((p) => (p.id !== projectId ? p : { ...p, groups: p.groups.map((g) => (g.id === groupId ? { ...g, proxy } : g)) })))

  const updateGroupConfig = (projectId, groupId, level, algoKey, config) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const currentConfigs = g.configs || {}
          const levelConfigs = currentConfigs[level] || {}
          return { ...g, configs: { ...currentConfigs, [level]: { ...levelConfigs, [algoKey]: config } } }
        }),
      }
    }))
  }

  const removeGroupConfig = (projectId, groupId, level, algoKey) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const currentConfigs = g.configs || {}
          const levelConfigs = { ...(currentConfigs[level] || {}) }
          delete levelConfigs[algoKey]
          return { ...g, configs: { ...currentConfigs, [level]: levelConfigs } }
        }),
      }
    }))
  }

  const updateSubGroup = (projectId, groupId, subGroupData) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const cur = g.subGroup || {}
          const patch = typeof subGroupData === 'function' ? subGroupData(cur) : subGroupData
          return { ...g, subGroup: { ...cur, ...patch } }
        }),
      }
    }))
  }

  const deleteGroup = (projectId, groupId) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      // 同时从启动预案中移除该组
      const groups = p.groups.filter((g) => g.id !== groupId)
      const startupPlan = p.startupPlan
        ? { ...p.startupPlan, groups: (p.startupPlan.groups || []).filter((g) => g.groupId !== groupId) }
        : { groups: [] }
      return { ...p, groups, startupPlan }
    }))
  }

  const addRequestsToGroup = (projectId, groupId, requests) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          return {
            ...g,
            requests: [
              ...g.requests,
              ...requests.map((r) => {
                const cloned = deepClone(r)
                return {
                  ...cloned,
                  _uid: uid(),
                  _addedAt: Date.now(),
                  _initialRequest: deepClone(r.request),
                  _initialResponse: deepClone(r.response),
                }
              }),
            ],
          }
        }),
      }
    }))
  }

  const addRequestsToSubGroup = (projectId, groupId, requests) => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const currentSubReqs = g.subGroup?.requests || []
          return {
            ...g,
            subGroup: {
              ...(g.subGroup || {}),
              requests: [
                ...currentSubReqs,
                ...requests.map((r) => {
                  const cloned = deepClone(r)
                  return {
                    ...cloned,
                    _uid: uid(),
                    _addedAt: Date.now(),
                    _initialRequest: deepClone(r.request),
                    _initialResponse: deepClone(r.response),
                  }
                }),
              ],
            },
          }
        }),
      }
    }))
  }

  const updateGroupRequests = (projectId, groupId, updater) =>
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const next = typeof updater === 'function' ? updater(g.requests) : updater
          return { ...g, requests: next }
        }),
      }
    }))

  const updateSubGroupRequests = (projectId, groupId, updater) =>
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const current = g.subGroup?.requests || []
          const next = typeof updater === 'function' ? updater(current) : updater
          return { ...g, subGroup: { ...(g.subGroup || {}), requests: next } }
        }),
      }
    }))

  const reorderGroups = (projectId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      const groups = [...p.groups]
      if (fromIndex < 0 || fromIndex >= groups.length || toIndex < 0 || toIndex >= groups.length) return p
      const [moved] = groups.splice(fromIndex, 1)
      groups.splice(toIndex, 0, moved)
      return { ...p, groups }
    }))
  }

  const reorderGroupRequests = (projectId, groupId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const requests = [...g.requests]
          if (fromIndex < 0 || fromIndex >= requests.length || toIndex < 0 || toIndex >= requests.length) return g
          const [moved] = requests.splice(fromIndex, 1)
          requests.splice(toIndex, 0, moved)
          return { ...g, requests }
        }),
      }
    }))
  }

  const updateRequestFields = (projectId, groupId, entryUid, fieldUpdates, level = 'main') => {
    if (!Array.isArray(fieldUpdates) || fieldUpdates.length === 0) return
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const listKey = level === 'sub' ? null : 'requests'
          const target = level === 'sub' ? (g.subGroup?.requests || []) : g.requests
          const updated = updateRequestList(target, entryUid, (r) => {
            let next = r
            for (const { fieldPath, value } of fieldUpdates) {
              next = setPath(next, fieldPath, value)
            }
            return next
          })
          if (level === 'sub') {
            return { ...g, subGroup: { ...(g.subGroup || {}), requests: updated } }
          }
          return { ...g, [listKey]: updated }
        }),
      }
    }))
  }

  const applyResponse = (projectId, groupId, entryUid, response, level = 'main') => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          if (level === 'sub') {
            const list = g.subGroup?.requests || []
            return {
              ...g,
              subGroup: { ...(g.subGroup || {}), requests: list.map((r) => (r._uid === entryUid ? { ...r, response: deepClone(response) } : r)) },
            }
          }
          return { ...g, requests: g.requests.map((r) => (r._uid === entryUid ? { ...r, response: deepClone(response) } : r)) }
        }),
      }
    }))
  }

  const resetGroupRequests = (projectId, groupId, level = 'main') => {
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const doReset = (r) => ({
            ...r,
            request: deepClone(r._initialRequest || r.request),
            response: deepClone(r._initialResponse || r.response),
          })
          if (level === 'sub') {
            return { ...g, subGroup: { ...(g.subGroup || {}), requests: (g.subGroup?.requests || []).map(doReset) } }
          }
          return { ...g, requests: g.requests.map(doReset) }
        }),
      }
    }))
  }

  const resetSelectedRequests = (projectId, groupId, uids, level = 'main') => {
    if (!uids || uids.length === 0) return
    const uidSet = new Set(uids)
    setProjectsSync((prev) => prev.map((p) => {
      if (p.id !== projectId) return p
      return {
        ...p,
        groups: p.groups.map((g) => {
          if (g.id !== groupId) return g
          const doReset = (r) => {
            if (!uidSet.has(r._uid)) return r
            return {
              ...r,
              request: deepClone(r._initialRequest || r.request),
              response: deepClone(r._initialResponse || r.response),
            }
          }
          if (level === 'sub') {
            return { ...g, subGroup: { ...(g.subGroup || {}), requests: (g.subGroup?.requests || []).map(doReset) } }
          }
          return { ...g, requests: g.requests.map(doReset) }
        }),
      }
    }))
  }

  return (
    <ProjectContext.Provider value={{
      projects, importProject, createProject, deleteProject, renameProject,
      createGroup, renameGroup, updateGroupProxy, deleteGroup, reorderGroups,
      addRequestsToGroup, addRequestsToSubGroup,
      updateGroupRequests, updateSubGroupRequests, reorderGroupRequests,
      updateRequestFields, applyResponse, resetGroupRequests, resetSelectedRequests,
      updateGroupConfig, removeGroupConfig, updateSubGroup,
      updateStartupPlan,
      getProjectSnapshot,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProjects 必须在 ProjectProvider 内使用')
  return ctx
}