import { app, shell, BrowserWindow, ipcMain, net, session, dialog } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

async function getNodeRequire() {
  if (typeof require !== 'undefined') return require
  const { createRequire } = await import('module')
  return createRequire(import.meta.url)
}

/* ==================== 本地库目录 ==================== */
function getLibsDir() {
  const dir = join(app.getPath('userData'), 'libs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeLibName(fileName) {
  if (typeof fileName !== 'string') return null
  if (!/^[\w.-]+\.js$/.test(fileName)) return null
  if (fileName.includes('..')) return null
  return fileName
}

function registerLibHandlers() {
  ipcMain.handle('lib:open-dir', async () => {
    const dir = getLibsDir()
    try { await shell.openPath(dir) } catch (e) { console.error(e) }
    return { ok: true, dir }
  })

  ipcMain.handle('lib:list', () => {
    try {
      const dir = getLibsDir()
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
      return {
        ok: true, dir,
        libs: files.map((f) => {
          const stat = fs.statSync(join(dir, f))
          return { fileName: f, size: stat.size, mtime: stat.mtimeMs }
        }),
      }
    } catch (e) {
      return { ok: false, error: String(e?.message || e), libs: [], dir: getLibsDir() }
    }
  })

  ipcMain.handle('lib:import', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择要导入的 JS 库',
        filters: [{ name: 'JavaScript', extensions: ['js'] }],
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) return { ok: false, canceled: true }
      const dir = getLibsDir()
      const imported = []
      for (const src of result.filePaths) {
        const fileName = safeLibName(basename(src))
        if (!fileName) { console.warn('[lib:import] 非法文件名:', src); continue }
        const dest = join(dir, fileName)
        fs.copyFileSync(src, dest)
        try { delete require.cache[require.resolve(dest)] } catch {}
        imported.push(fileName)
      }
      return { ok: true, imported }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  ipcMain.handle('lib:delete', (_e, { fileName }) => {
    try {
      const name = safeLibName(fileName)
      if (!name) throw new Error('非法文件名')
      const p = join(getLibsDir(), name)
      if (fs.existsSync(p)) fs.unlinkSync(p)
      try { delete require.cache[require.resolve(p)] } catch {}
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })
}

/* ==================== HTTP 代理 ==================== */
const proxySessionCache = new Map()
async function getProxySession(proxyUrl) {
  if (!proxyUrl) return null
  if (proxySessionCache.has(proxyUrl)) return proxySessionCache.get(proxyUrl)
  const tag = Buffer.from(proxyUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
  const sess = session.fromPartition(`persist:proxy-${tag}`)
  await sess.setProxy({ proxyRules: proxyUrl })
  proxySessionCache.set(proxyUrl, sess)
  return sess
}

function registerHttpHandler() {
  ipcMain.handle('http:request', async (_event, { url, method, headers, body, proxy }) => {
    const started = Date.now()
    const timeoutMs = 30000
    if (!url || typeof url !== 'string')
      return { status: 0, statusText: 'error', body: '[bad url] 空', headers: [], time: 0 }
    try { new URL(url) } catch (e) {
      return { status: 0, statusText: 'error', body: `[bad url] ${url} -> ${e.message}`, headers: [], time: 0 }
    }
    let proxySession = null
    if (proxy) {
      try { proxySession = await getProxySession(proxy) } catch (e) {
        return { status: 0, statusText: 'error', body: `[proxy error] ${e.message}`, headers: [], time: 0 }
      }
    }
    return new Promise((resolve) => {
      let request
      try {
        const opts = { url, method: (method || 'GET').toUpperCase(), redirect: 'follow' }
        if (proxySession) opts.session = proxySession
        request = net.request(opts)
      } catch (e) {
        return resolve({ status: 0, statusText: 'error', body: `[net.request 失败] ${e.message}`, headers: [], time: 0 })
      }
      const timer = setTimeout(() => {
        try { request.abort() } catch {}
        resolve({ status: 0, statusText: 'timeout', body: `请求超时（${timeoutMs}ms）\nurl=${url}`, headers: [], time: Date.now() - started })
      }, timeoutMs)
      Object.entries(headers || {}).forEach(([k, v]) => {
        try { request.setHeader(k, v) } catch {}
      })
      request.on('response', (response) => {
        const chunks = []
        response.on('data', (c) => chunks.push(Buffer.from(c)))
        response.on('end', () => {
          clearTimeout(timer)
          const buf = Buffer.concat(chunks)
          resolve({
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: Object.entries(response.headers || {}).map(([k, v]) => ({
              name: k, value: Array.isArray(v) ? v.join(', ') : String(v),
            })),
            body: buf.toString('utf-8'),
            time: Date.now() - started,
          })
        })
        response.on('error', (err) => {
          clearTimeout(timer)
          resolve({ status: 0, statusText: 'error', body: `[response error] ${err.message}`, headers: [], time: Date.now() - started })
        })
      })
      request.on('error', (err) => {
        clearTimeout(timer)
        console.error('[HTTP] ❌', err.message)
        resolve({
          status: 0, statusText: 'error',
          body: `[net error] ${err.message || err}${err.code ? `\ncode=${err.code}` : ''}\nurl=${url}`,
          headers: [], time: Date.now() - started,
        })
      })
      try {
        if (body != null) request.write(typeof body === 'string' ? body : JSON.stringify(body))
        request.end()
      } catch (e) {
        clearTimeout(timer)
        resolve({ status: 0, statusText: 'error', body: `[write error] ${e.message}`, headers: [], time: Date.now() - started })
      }
    })
  })
}

/* ==================== 脚本 / 库执行 ==================== */
function registerScriptHandler() {
  // 本地库执行
  ipcMain.handle('lib:run', async (_e, { fileName, fnName, input, config }) => {
    try {
      const libsDir = getLibsDir()
      const fullPath = join(libsDir, fileName)
      if (!fs.existsSync(fullPath)) return { ok: false, error: `库不存在：${fileName}` }
      delete require.cache[require.resolve(fullPath)]
      const lib = require(fullPath)
      const fn = lib[fnName]
      if (typeof fn !== 'function') return { ok: false, error: `库中无函数：${fnName}` }
      const result = await fn(String(input ?? ''), config || {})
      return {
        ok: true,
        value: result == null ? '' : (typeof result === 'string' ? result : JSON.stringify(result)),
      }
    } catch (e) {
      console.error('[lib:run]', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // ⬇ 外部脚本执行（渲染进程传 code + input + ctx + config）
  ipcMain.handle('script:run', async (_e, { code, input, ctx, config }) => {
    try {
      const nodeRequire = await getNodeRequire()
      const USER_DATA_PATH = app.getPath('userData')
      const APP_PATH = app.getAppPath()
      const RESOURCES_PATH = process.resourcesPath
      const LIBS_PATH = getLibsDir()

      const wrapper = new Function(
        'input', 'ctx', 'require', 'module', 'exports',
        'USER_DATA_PATH', 'APP_PATH', 'RESOURCES_PATH', 'LIBS_PATH',
        `"use strict";\n${code}\n`
      )
      const mod = { exports: {} }
      const runCtx = {
        config: config || {},
        responses: ctx?.responses || [],
        currentStep: ctx?.currentStep,
        entry: ctx?.entry,
        fieldPath: ctx?.fieldPath,
        log: (...args) => console.log('[script]', ...args),
        paths: { USER_DATA_PATH, APP_PATH, RESOURCES_PATH, LIBS_PATH },
      }
      let result = await wrapper(
        String(input ?? ''), runCtx, nodeRequire, mod, mod.exports,
        USER_DATA_PATH, APP_PATH, RESOURCES_PATH, LIBS_PATH
      )
      if (result === undefined && typeof mod.exports === 'function') {
        result = await mod.exports(String(input ?? ''), runCtx)
      } else if (result === undefined && mod.exports !== undefined && Object.keys(mod.exports).length > 0) {
        result = mod.exports
      }
      return {
        ok: true,
        value: result == null ? '' : (typeof result === 'string' ? result : JSON.stringify(result)),
      }
    } catch (e) {
      console.error('[script:run] 失败:', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })

  // 整条 entry 执行（保留兼容，如果某些地方用到）
  ipcMain.handle('script:run-entry', async (_e, { code, entry, groupEntries, index }) => {
    try {
      const nodeRequire = await getNodeRequire()
      const USER_DATA_PATH = app.getPath('userData')
      const APP_PATH = app.getAppPath()
      const RESOURCES_PATH = process.resourcesPath
      const LIBS_PATH = getLibsDir()

      const entries = JSON.parse(JSON.stringify(groupEntries || []))
      const idx = typeof index === 'number' ? index : 0

      const wrapper = new Function(
        'entry', 'ctx', 'require', 'module', 'exports',
        'USER_DATA_PATH', 'APP_PATH', 'RESOURCES_PATH', 'LIBS_PATH',
        `"use strict";\n${code}\n`
      )
      const runCtx = {
        index: idx,
        current: () => entries[idx],
        prev: () => idx > 0 ? entries[idx - 1] : undefined,
        at: (n) => (n >= 0 && n < entries.length) ? entries[n] : undefined,
        all: () => entries,
        log: (...args) => console.log('[script]', ...args),
        paths: { USER_DATA_PATH, APP_PATH, RESOURCES_PATH, LIBS_PATH },
      }
      const mod = { exports: {} }
      let result = await wrapper(
        entry, runCtx, nodeRequire, mod, mod.exports,
        USER_DATA_PATH, APP_PATH, RESOURCES_PATH, LIBS_PATH
      )
      if (result === undefined && typeof mod.exports === 'function') {
        result = await mod.exports(entry, runCtx)
      }
      return { ok: true, entry: result !== undefined ? result : entry }
    } catch (e) {
      console.error('[script:run-entry] 失败:', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })
}

/* ==================== 窗口 ==================== */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800, show: false, autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  ipcMain.on('ping', () => console.log('pong'))
  registerHttpHandler()
  registerLibHandlers()
  registerScriptHandler()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})