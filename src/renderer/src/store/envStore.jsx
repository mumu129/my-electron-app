// src/renderer/src/store/envStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'

const STORAGE_KEY_V2 = 'har-env-v2'
const STORAGE_KEY_V1 = 'har-env-v1'

// 统一迁移：把 {k: 'v'} 或 {k: {value,rule}} 都规整成 {k: {value, rule}}
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
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

const EnvContext = createContext(null)

export function EnvProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const v2 = localStorage.getItem(STORAGE_KEY_V2)
      if (v2) return migrate(JSON.parse(v2))
      const v1 = localStorage.getItem(STORAGE_KEY_V1)
      if (v1) return migrate(JSON.parse(v1))
      return {}
    } catch { return {} }
  })

  const itemsRef = useRef(items)
  itemsRef.current = items

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(items)) }
      catch (e) { console.error('[EnvStore] 持久化失败:', e) }
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [items])

  // 💡 对外暴露的"纯值映射"，兼容 hackTags 里 ctx.envs[key]
  const envs = useMemo(() => {
    const out = {}
    for (const [k, v] of Object.entries(items)) out[k] = v.value ?? ''
    return out
  }, [items])

  const setEnv = useCallback((key, value) => {
    setItems((prev) => {
      const existing = prev[key] || { value: '' }
      const next = { ...prev, [key]: { ...existing, value: String(value ?? '') } }
      itemsRef.current = next
      return next
    })
  }, [])

  const setEnvRule = useCallback((key, rule) => {
    setItems((prev) => {
      const existing = prev[key] || { value: '' }
      const next = { ...prev, [key]: { ...existing, rule: rule || null } }
      itemsRef.current = next
      return next
    })
  }, [])

  const removeEnv = useCallback((key) => {
    setItems((prev) => {
      const next = { ...prev }
      delete next[key]
      itemsRef.current = next
      return next
    })
  }, [])

  return (
    <EnvContext.Provider value={{ envs, items, setEnv, setEnvRule, removeEnv }}>
      {children}
    </EnvContext.Provider>
  )
}

export function useEnvs() {
  const ctx = useContext(EnvContext)
  if (!ctx) throw new Error('useEnvs 必须在 EnvProvider 内使用')
  return ctx
}