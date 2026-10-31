// src/renderer/src/store/envStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'har-env-v1'
const EnvContext = createContext(null)

export function EnvProvider({ children }) {
  const [envs, setEnvs] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {} }
    catch { return {} }
  })

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(envs)) }
      catch (e) { console.error('[EnvStore] 持久化失败:', e) }
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [envs])

  const setEnv = (key, value) => setEnvs((prev) => ({ ...prev, [key]: value }))
  const removeEnv = (key) => setEnvs((prev) => { const next = { ...prev }; delete next[key]; return next })

  return <EnvContext.Provider value={{ envs, setEnv, removeEnv }}>{children}</EnvContext.Provider>
}

export function useEnvs() {
  const ctx = useContext(EnvContext)
  if (!ctx) throw new Error('useEnvs 必须在 EnvProvider 内使用')
  return ctx
}