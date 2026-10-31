// src/renderer/src/hooks/useIDBState.js
import { useCallback, useEffect, useRef, useState } from 'react'
import { idb } from '../store/idbStore'

/**
 * IndexedDB 持久化状态
 * @returns [value, setValue, { loaded, reset, flush }]
 */
export default function useIDBState(key, defaultValue, opts = {}) {
  const { debounce = 300 } = opts
  const [value, setValueRaw] = useState(defaultValue)
  const [loaded, setLoaded] = useState(false)
  const timerRef = useRef(null)
  const loadOkRef = useRef(false)   // 💡 只有成功读到才允许写
  const dirtyRef = useRef(false)    // 💡 加载前被用户改过
  const valueRef = useRef(defaultValue)

  // 内部维护 dirty：所有对外的 setValue 走这个包装
  const setValue = useCallback((v) => {
    dirtyRef.current = true
    setValueRaw(v)
  }, [])

  useEffect(() => { valueRef.current = value }, [value])

  // key 变化时复位
  useEffect(() => {
    loadOkRef.current = false
    dirtyRef.current = false
    setLoaded(false)
    setValueRaw(defaultValue)
    valueRef.current = defaultValue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // 读取
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await idb.get(key)
        if (cancelled) return
        loadOkRef.current = true
        if (data !== undefined && !dirtyRef.current) {
          // 💡 只在用户未修改前才恢复
          setValueRaw(data)
          valueRef.current = data
        }
      } catch (e) {
        console.warn(`[useIDBState] 读取 ${key} 失败:`, e)
        loadOkRef.current = false
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [key])

  // 保存
  useEffect(() => {
    if (!loadOkRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try { await idb.put(key, valueRef.current) }
      catch (e) { console.warn(`[useIDBState] 保存 ${key} 失败:`, e) }
    }, debounce)
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  }, [key, value, debounce, loaded])

  // 💡 [修复] 加载完成后，如果存在未落盘的修改（loaded 期间），补存一次
  useEffect(() => {
    if (!loaded || !loadOkRef.current) return
    if (!dirtyRef.current) return
    // 补存
    idb.put(key, valueRef.current).catch((e) => console.warn(`[useIDBState] flush-on-load ${key}`, e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const reset = useCallback(async () => {
    try { await idb.del(key) } catch (e) { console.warn(e) }
    dirtyRef.current = true
    setValueRaw(defaultValue)
    valueRef.current = defaultValue
  }, [key, defaultValue])

  // 💡 新增可选参数：flush(immediateValue) 可以立刻写入指定值（用于 HarViewer 那种"设完就存"场景）
  const flush = useCallback(async (immediateValue) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const v = immediateValue !== undefined ? immediateValue : valueRef.current
    try {
      await idb.put(key, v)
      loadOkRef.current = true
    } catch (e) { console.warn(e) }
  }, [key])

  return [value, setValue, { loaded, reset, flush }]
}