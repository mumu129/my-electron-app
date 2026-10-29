import { useCallback, useEffect, useRef, useState } from 'react';
import { idb } from '../store/idbStore';

/**
 * IndexedDB 持久化状态
 * @param {string} key
 * @param {any} defaultValue
 * @param {object} opts { debounce = 300 }
 * @returns [value, setValue, { loaded, reset, flush }]
 */
export default function useIDBState(key, defaultValue, opts = {}) {
  const { debounce = 300 } = opts;
  const [value, setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);
  const loadedRef = useRef(false);
  const valueRef = useRef(defaultValue);

  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await idb.get(key);
        if (cancelled) return;
        if (data !== undefined) {
          console.log(`[useIDBState] 恢复 ${key}`, Array.isArray(data) ? `(${data.length} 项)` : '');
          setValue(data);
          valueRef.current = data;
        } else {
          console.log(`[useIDBState] ${key} 无历史数据，使用默认值`);
        }
      } catch (e) {
        console.warn(`[useIDBState] 读取 ${key} 失败:`, e);
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
          setLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await idb.put(key, value);
        console.log(`[useIDBState] 保存 ${key}`);
      } catch (e) {
        console.warn(`[useIDBState] 保存 ${key} 失败:`, e);
      }
    }, debounce);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [key, value, debounce]);

  const reset = useCallback(async () => {
    try { await idb.del(key); } catch (e) { console.warn(e); }
    setValue(defaultValue);
    valueRef.current = defaultValue;
  }, [key, defaultValue]);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try {
      await idb.put(key, valueRef.current);
      console.log(`[useIDBState] flush ${key}`);
    } catch (e) { console.warn(e); }
  }, [key]);

  return [value, setValue, { loaded, reset, flush }];
}