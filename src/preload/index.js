import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  httpRequest: (payload) => ipcRenderer.invoke('http:request', payload),
  script: {
    run: (payload) => ipcRenderer.invoke('script:run', payload),
    runEntry: (payload) => ipcRenderer.invoke('script:run-entry', payload),
  },
  lib: {
    list: () => ipcRenderer.invoke('lib:list'),
    import: () => ipcRenderer.invoke('lib:import'),
    delete: (payload) => ipcRenderer.invoke('lib:delete', payload),
    openDir: () => ipcRenderer.invoke('lib:open-dir'),
    run: (payload) => ipcRenderer.invoke('lib:run', payload),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (e) { console.error(e) }
} else {
  window.electron = electronAPI
  window.api = api
  window.electronAPI = api
}