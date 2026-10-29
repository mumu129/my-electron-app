import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'har-scripts-v1'
const Ctx = createContext(null)

export function ScriptProvider({ children }) {
  const [scripts, setScripts] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const data = raw ? JSON.parse(raw) : {}
      console.log('[ScriptStore] 初始化，脚本数:', Object.keys(data).length)
      return data
    } catch { return {} }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts))
      console.log('[ScriptStore] 已保存，脚本数:', Object.keys(scripts).length)
    } catch (e) { console.error('[ScriptStore] 保存失败:', e) }
  }, [scripts])

  const createScript = useCallback((name, def) => {
    if (scripts[name]) throw new Error(`脚本 "${name}" 已存在`)
    setScripts((prev) => ({ ...prev, [name]: { name, ...def } }))
    return name
  }, [scripts])

  const updateScript = useCallback((name, patch) => {
    setScripts((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  }, [])

  const removeScript = useCallback((name) => {
    setScripts((prev) => {
      const next = { ...prev }
      delete next[name]
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