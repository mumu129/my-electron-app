// src/preload/index.js
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  httpRequest: (payload) => ipcRenderer.invoke('http:request', payload),
  lib: {
    list: () => ipcRenderer.invoke('lib:list'),
    import: () => ipcRenderer.invoke('lib:import'),
    delete: (payload) => ipcRenderer.invoke('lib:delete', payload),
    openDir: () => ipcRenderer.invoke('lib:open-dir'),
  },
  crypto: {
    transform: (payload) => ipcRenderer.invoke('crypto:transform', payload),
  },
  script: {
    run: (payload) => ipcRenderer.invoke('script:run', payload),
  },
  workarea: {
    setPath: () => ipcRenderer.invoke('workarea:set-path'),
    getPath: () => ipcRenderer.invoke('workarea:get-path'),
    mkdir: (payload) => ipcRenderer.invoke('workarea:mkdir', payload),
    writeJson: (payload) => ipcRenderer.invoke('workarea:write-json', payload),
    run: (payload) => ipcRenderer.invoke('workarea:run', payload),
    stopRun: () => ipcRenderer.invoke('workarea:stop-run'),
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