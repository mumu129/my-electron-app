// src/renderer/src/store/scriptStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const STORAGE_KEY = 'har-scripts-v1'
const Ctx = createContext(null)

export function ScriptProvider({ children }) {
  const [scripts, setScripts] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const data = raw ? JSON.parse(raw) : {}
      return data
    } catch { return {} }
  })

  // 💡 [修复 #1] 用 ref 同步跟踪最新值；createScript 的重名检查依赖它，
  // 避免 setState 回调异步执行导致「已存在」误报。
  const scriptsRef = useRef(scripts)
  scriptsRef.current = scripts

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts)) }
      catch (e) { console.error('[ScriptStore] 保存失败:', e) }
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [scripts])

  const createScript = useCallback((name, def) => {
    // 💡 [修复 #1] 先检查 ref（同步、可靠），再直接构造新对象写入
    if (scriptsRef.current[name]) throw new Error(`脚本 "${name}" 已存在`)
    const next = { ...scriptsRef.current, [name]: { name, ...def } }
    scriptsRef.current = next
    setScripts(next)
    return name
  }, [])

  const updateScript = useCallback((name, patch) => {
    setScripts((prev) => {
      const existing = prev[name]
      const next = existing
        ? { ...prev, [name]: { ...existing, ...patch, name: existing.name || name } }
        : { ...prev, [name]: { name, ...patch } }
      scriptsRef.current = next
      return next
    })
  }, [])

  const removeScript = useCallback((name) => {
    setScripts((prev) => {
      const next = { ...prev }
      delete next[name]
      scriptsRef.current = next
      return next
    })
  }, [])

  return (
    <Ctx.Provider value={{ scripts, createScript, updateScript, removeScript }}>
      {children}
    </Ctx.Provider>
  )
}

export function useScripts() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useScripts 必须在 ScriptProvider 内使用')
  return ctx
}