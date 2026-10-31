// src/renderer/src/hooks/usePersistentState.js
import { useCallback, useEffect, useRef, useState } from 'react'

export default function usePersistentState(key, defaultValue, opts = {}) {
  const { maxBytes = 4 * 1024 * 1024, debounce = 200 } = opts

  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return defaultValue
      return JSON.parse(raw)
    } catch (e) { console.warn(`[Persist] 读取 ${key} 失败:`, e); return defaultValue }
  })

  const timerRef = useRef(null)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])

  // 💡 [修复] key 变化时（如切换项目），重新从 localStorage 读取
  const prevKeyRef = useRef(key)
  const defaultValueRef = useRef(defaultValue)
  useEffect(() => { defaultValueRef.current = defaultValue }, [defaultValue])
  useEffect(() => {
    if (prevKeyRef.current === key) return
    prevKeyRef.current = key
    try {
      const raw = localStorage.getItem(key)
      setValue(raw ? JSON.parse(raw) : defaultValueRef.current)
    } catch (e) {
      console.warn(`[Persist] 读取 ${key} 失败:`, e)
      setValue(defaultValueRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        const str = JSON.stringify(value)
        if (str.length > maxBytes) { console.warn(`[Persist] ${key} 数据过大，跳过保存`); return }
        localStorage.setItem(key, str)
      } catch (e) { console.warn(`[Persist] 保存 ${key} 失败:`, e) }
    }, debounce)
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  }, [key, value, maxBytes, debounce])

  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    try { localStorage.setItem(key, JSON.stringify(valueRef.current)) } catch {}
  }, [key])

  return [value, setValue, { flush }]
}