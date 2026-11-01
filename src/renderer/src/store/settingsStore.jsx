// src/renderer/src/store/settingsStore.jsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

const STORAGE_KEY = 'har-settings-v1'

const DEFAULTS = {
  timeoutMs: 30000,      // HTTP 超时
  retries: 0,            // 失败重试次数
  retryDelayMs: 500,     // 重试间隔
  requestDelayMs: 50,    // 组内请求间隔
}

const Ctx = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return { ...DEFAULTS }
      return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch { return { ...DEFAULTS } }
  })

  // 💡 settingsRef 让执行引擎的 while 循环每轮能读到最新设置
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch {}
    }, 300)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [settings])

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      settingsRef.current = next
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULTS })
    settingsRef.current = { ...DEFAULTS }
  }, [])

  return (
    <Ctx.Provider value={{ settings, settingsRef, updateSetting, resetSettings, defaults: DEFAULTS }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用')
  return ctx
}