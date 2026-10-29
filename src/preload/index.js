import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  httpRequest: (payload) => ipcRenderer.invoke('http:request', payload),
  script: {
    run: (payload) => ipcRenderer.invoke('script:run', payload),
  },
}

console.log('[preload] 暴露接口:', Object.keys(api), 'contextIsolated=', process.contextIsolated)

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error('[preload] contextBridge 失败:', error)
  }
} else {
  window.electron = electronAPI
  window.api = api
  window.electronAPI = api
}