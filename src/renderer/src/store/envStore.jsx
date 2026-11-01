// src/renderer/src/store/envStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'

const STORAGE_KEY = 'har-env-v3'
const LEGACY_V1 = 'har-env-v1'
const LEGACY_V2 = 'har-env-v2'

function normalizeItems(items) {
  const out = {}
  for (const [k, v] of Object.entries(items || {})) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = { value: String(v) }
    } else if (v && typeof v === 'object') {
      out[k] = {
        value: v.value == null ? '' : String(v.value),
        rule: v.rule && typeof v.rule === 'object' ? v.rule : null,
      }
    } else {
      out[k] = { value: String(v ?? '') }
    }
  }
  return out
}

function loadInitial() {
  try {
    const v3 = localStorage.getItem(STORAGE_KEY)
    if (v3) {
      const data = JSON.parse(v3)
      if (data && data.sets && data.activeSetId && data.sets[data.activeSetId]) return data
    }
    // 迁移旧版本
    let legacy = {}
    const raw = localStorage.getItem(LEGACY_V2) || localStorage.getItem(LEGACY_V1)
    if (raw) legacy = JSON.parse(raw)
    const defaultSet = { name: '默认', items: normalizeItems(legacy) }
    return { activeSetId: 'default', sets: { default: defaultSet } }
  } catch {
    return { activeSetId: 'default', sets: { default: { name: '默认', items: {} } } }
  }
}

const EnvContext = createContext(null)

export function EnvProvider({ children }) {
  const [state, setState] = useState(loadInitial)
  const stateRef = useRef(state)
  stateRef.current = state

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
      catch (e) { console.error('[EnvStore] 持久化失败:', e) }
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [state])

  // 对外暴露纯 { key: value }（保持 hackTags 兼容）
  const envs = useMemo(() => {
    const set = state.sets[state.activeSetId]
    if (!set) return {}
    const out = {}
    for (const [k, v] of Object.entries(set.items)) out[k] = v.value ?? ''
    return out
  }, [state])

  // 当前激活集的所有 items（含 rule）
  const items = useMemo(() => {
    const set = state.sets[state.activeSetId]
    return set ? set.items : {}
  }, [state])

  // 所有环境集列表
  const sets = useMemo(
    () => Object.entries(state.sets).map(([id, s]) => ({ id, name: s.name, count: Object.keys(s.items).length })),
    [state]
  )
  const activeSetId = state.activeSetId

  const switchSet = useCallback((id) => {
    setState((prev) => {
      if (!prev.sets[id]) return prev
      const next = { ...prev, activeSetId: id }
      stateRef.current = next
      return next
    })
  }, [])

  const createSet = useCallback((name, copyFromCurrent = false) => {
    const id = `set-${Date.now()}`
    setState((prev) => {
      const items = copyFromCurrent ? JSON.parse(JSON.stringify(prev.sets[prev.activeSetId]?.items || {})) : {}
      const next = {
        ...prev,
        sets: { ...prev.sets, [id]: { name: name || `环境 ${Object.keys(prev.sets).length + 1}`, items } },
      }
      stateRef.current = next
      return next
    })
    return id
  }, [])

  const renameSet = useCallback((id, newName) => {
    setState((prev) => {
      if (!prev.sets[id]) return prev
      const next = { ...prev, sets: { ...prev.sets, [id]: { ...prev.sets[id], name: newName } } }
      stateRef.current = next
      return next
    })
  }, [])

  const deleteSet = useCallback((id) => {
    setState((prev) => {
      if (Object.keys(prev.sets).length <= 1) return prev  // 不能删最后一个
      if (!prev.sets[id]) return prev
      const nextSets = { ...prev.sets }
      delete nextSets[id]
      const nextActive = prev.activeSetId === id ? Object.keys(nextSets)[0] : prev.activeSetId
      const next = { activeSetId: nextActive, sets: nextSets }
      stateRef.current = next
      return next
    })
  }, [])

  const setEnv = useCallback((key, value) => {
    setState((prev) => {
      const set = prev.sets[prev.activeSetId]
      if (!set) return prev
      const existing = set.items[key] || { value: '' }
      const nextSet = { ...set, items: { ...set.items, [key]: { ...existing, value: String(value ?? '') } } }
      const next = { ...prev, sets: { ...prev.sets, [prev.activeSetId]: nextSet } }
      stateRef.current = next
      return next
    })
  }, [])

  const setEnvRule = useCallback((key, rule) => {
    setState((prev) => {
      const set = prev.sets[prev.activeSetId]
      if (!set) return prev
      const existing = set.items[key] || { value: '' }
      const nextSet = { ...set, items: { ...set.items, [key]: { ...existing, rule: rule || null } } }
      const next = { ...prev, sets: { ...prev.sets, [prev.activeSetId]: nextSet } }
      stateRef.current = next
      return next
    })
  }, [])

  const removeEnv = useCallback((key) => {
    setState((prev) => {
      const set = prev.sets[prev.activeSetId]
      if (!set) return prev
      const items = { ...set.items }
      delete items[key]
      const next = { ...prev, sets: { ...prev.sets, [prev.activeSetId]: { ...set, items } } }
      stateRef.current = next
      return next
    })
  }, [])

  return (
    <EnvContext.Provider value={{
      envs, items, sets, activeSetId,
      switchSet, createSet, renameSet, deleteSet,
      setEnv, setEnvRule, removeEnv,
    }}>
      {children}
    </EnvContext.Provider>
  )
}

export function useEnvs() {
  const ctx = useContext(EnvContext)
  if (!ctx) throw new Error('useEnvs 必须在 EnvProvider 内使用')
  return ctx
}