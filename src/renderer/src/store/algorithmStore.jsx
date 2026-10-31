// src/renderer/src/store/algorithmStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'har-algorithms-v3'
const AlgorithmContext = createContext(null)

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return { global: {}, projects: {} }
  if (!raw.global && !raw.projects) return { global: raw, projects: {} }
  return { global: raw.global || {}, projects: raw.projects || {} }
}

export function AlgorithmProvider({ children }) {
  const [algorithms, setAlgorithms] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return normalize(raw ? JSON.parse(raw) : null)
    } catch { return { global: {}, projects: {} } }
  })

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(algorithms)) }
      catch (e) { console.error('[AlgorithmStore] 持久化失败:', e) }
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [algorithms])

  const updateGlobalAlgorithm = (key, patch) => {
    setAlgorithms((prev) => ({ ...prev, global: { ...prev.global, [key]: { ...(prev.global[key] || {}), ...patch } } }))
  }
  const removeGlobalAlgorithm = (key) => {
    setAlgorithms((prev) => { const next = { ...prev.global }; delete next[key]; return { ...prev, global: next } })
  }
  const updateProjectAlgorithm = (projectId, key, patch) => {
    setAlgorithms((prev) => ({
      ...prev,
      projects: {
        ...prev.projects,
        [projectId]: { ...(prev.projects[projectId] || {}), [key]: { ...(prev.projects[projectId]?.[key] || {}), ...patch } },
      },
    }))
  }
  const removeProjectAlgorithm = (projectId, key) => {
    setAlgorithms((prev) => {
      const proj = { ...(prev.projects[projectId] || {}) }
      delete proj[key]
      return { ...prev, projects: { ...prev.projects, [projectId]: proj } }
    })
  }
  const getCustomAlgorithms = (projectId) => algorithms.projects?.[projectId]?.customAlgorithms || {}
  const addCustomAlgorithm = (projectId, key, def) => {
    setAlgorithms((prev) => ({
      ...prev,
      projects: {
        ...prev.projects,
        [projectId]: {
          ...(prev.projects[projectId] || {}),
          customAlgorithms: { ...(prev.projects[projectId]?.customAlgorithms || {}), [key]: def },
        },
      },
    }))
  }
  const updateCustomAlgorithm = (projectId, key, patch) => {
    setAlgorithms((prev) => ({
      ...prev,
      projects: {
        ...prev.projects,
        [projectId]: {
          ...(prev.projects[projectId] || {}),
          customAlgorithms: {
            ...(prev.projects[projectId]?.customAlgorithms || {}),
            [key]: { ...(prev.projects[projectId]?.customAlgorithms?.[key] || {}), ...patch },
          },
        },
      },
    }))
  }
  const removeCustomAlgorithm = (projectId, key) => {
    setAlgorithms((prev) => {
      const cur = { ...(prev.projects[projectId]?.customAlgorithms || {}) }
      delete cur[key]
      return { ...prev, projects: { ...prev.projects, [projectId]: { ...(prev.projects[projectId] || {}), customAlgorithms: cur } } }
    })
  }

  const getEffectiveConfigMap = (projectId) => {
    const global = {}
    Object.entries(algorithms.global || {}).forEach(([k, v]) => { if (v?.config) global[k] = v.config })
    if (!projectId) return global
    const proj = {}
    Object.entries(algorithms.projects?.[projectId] || {}).forEach(([k, v]) => {
      if (k !== 'customAlgorithms' && v?.config) proj[k] = v.config
    })
    return { ...global, ...proj }
  }

  return (
    <AlgorithmContext.Provider value={{
      algorithms,
      updateGlobalAlgorithm, removeGlobalAlgorithm,
      updateProjectAlgorithm, removeProjectAlgorithm,
      getCustomAlgorithms, addCustomAlgorithm, updateCustomAlgorithm, removeCustomAlgorithm,
      getEffectiveConfigMap,
    }}>
      {children}
    </AlgorithmContext.Provider>
  )
}

export function useAlgorithms() {
  const ctx = useContext(AlgorithmContext)
  if (!ctx) throw new Error('useAlgorithms 必须在 AlgorithmProvider 内使用')
  return ctx
}