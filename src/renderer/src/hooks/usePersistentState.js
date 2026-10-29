import { useEffect, useRef, useState } from 'react';

export default function usePersistentState(key, defaultValue, opts = {}) {
  const { maxBytes = 4 * 1024 * 1024, debounce = 200 } = opts;

  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[Persist] 读取 ${key} 失败:`, e);
      return defaultValue;
    }
  });

  const timerRef = useRef(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const str = JSON.stringify(value);
        if (str.length > maxBytes) {
          console.warn(`[Persist] ${key} 数据过大，跳过保存`);
          return;
        }
        localStorage.setItem(key, str);
      } catch (e) {
        console.warn(`[Persist] 保存 ${key} 失败:`, e);
      }
    }, debounce);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [key, value, maxBytes, debounce]);

  return [value, setValue];
}