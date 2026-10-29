import { app, shell, BrowserWindow, ipcMain, net, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

// ============ 获取 require（兼容 CJS / ESM 环境） ============
async function getNodeRequire() {
  // 主进程一般打包成 CJS，require 全局可用
  if (typeof require !== 'undefined') return require
  // 极少数 ESM 环境兜底
  const { createRequire } = await import('module')
  return createRequire(import.meta.url)
}

// ============ 代理 Session 缓存 ============
const proxySessionCache = new Map()

async function getProxySession(proxyUrl) {
  if (!proxyUrl) return null
  const cached = proxySessionCache.get(proxyUrl)
  if (cached) return cached
  const tag = Buffer.from(proxyUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
  const partition = `persist:proxy-${tag}`
  const sess = session.fromPartition(partition)
  await sess.setProxy({ proxyRules: proxyUrl })
  proxySessionCache.set(proxyUrl, sess)
  console.log('[HTTP] 创建代理 session:', proxyUrl, 'partition=', partition)
  return sess
}

// ============ HTTP 代理 ============
function registerHttpHandler() {
  ipcMain.handle('http:request', async (_event, { url, method, headers, body, proxy }) => {
    const started = Date.now()
    const timeoutMs = 30000

    console.log('\n[HTTP] ========== 开始请求 ==========')
    console.log('[HTTP] URL:', url)
    console.log('[HTTP] Method:', method, 'Proxy:', proxy || '（不使用）')

    if (!url || typeof url !== 'string') {
      return { status: 0, statusText: 'error', body: '[bad url] 空或非字符串', headers: [], time: 0 }
    }
    try { new URL(url) } catch (e) {
      return { status: 0, statusText: 'error', body: `[bad url] ${url} -> ${e.message}`, headers: [], time: 0 }
    }

    let proxySession = null
    if (proxy) {
      try { proxySession = await getProxySession(proxy) }
      catch (e) {
        console.error('[HTTP] ❌ 代理 session 创建失败:', e)
        return { status: 0, statusText: 'error', body: `[proxy error] ${e.message}`, headers: [], time: 0 }
      }
    }

    return new Promise((resolve) => {
      let request
      try {
        const options = { url, method: (method || 'GET').toUpperCase(), redirect: 'follow' }
        if (proxySession) options.session = proxySession
        request = net.request(options)
      } catch (e) {
        console.error('[HTTP] ❌ 创建请求对象失败:', e)
        resolve({ status: 0, statusText: 'error', body: `[net.request 失败] ${e.message}`, headers: [], time: 0 })
        return
      }

      const timer = setTimeout(() => {
        try { request.abort() } catch {}
        console.error(`[HTTP] ⏱️ 超时 (${timeoutMs}ms)`)
        resolve({ status: 0, statusText: 'timeout', body: `请求超时（${timeoutMs}ms）\nurl=${url}`, headers: [], time: Date.now() - started })
      }, timeoutMs)

      const headerErrors = []
      Object.entries(headers || {}).forEach(([k, v]) => {
        try { request.setHeader(k, v) } catch (e) { headerErrors.push(`${k}: ${e.message}`) }
      })
      if (headerErrors.length) console.warn('[HTTP] ⚠️ setHeader 失败:', headerErrors)

      request.on('redirect', (code, redir) => {
        console.log(`[HTTP] 🔀 重定向: ${code} -> ${redir}`)
      })

      request.on('response', (response) => {
        clearTimeout(timer)
        console.log(`[HTTP] ✅ 响应: ${response.statusCode} ${response.statusMessage}`)
        const chunks = []
        response.on('data', (c) => chunks.push(Buffer.from(c)))
        response.on('end', () => {
          const buf = Buffer.concat(chunks)
          console.log(`[HTTP] 📦 ${buf.length} bytes, ${Date.now() - started} ms`)
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
          console.error('[HTTP] ❌ 响应流错误:', err)
          resolve({ status: 0, statusText: 'error', body: `[response error] ${err.message}`, headers: [], time: Date.now() - started })
        })
      })

      request.on('error', (err) => {
        clearTimeout(timer)
        console.error('[HTTP] ❌ 网络错误:', err.message, err)
        resolve({
          status: 0, statusText: 'error',
          body: `[net error] ${err.message || err}${err.code ? `\ncode=${err.code}` : ''}\nurl=${url}${proxy ? `\nproxy=${proxy}` : ''}`,
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

// ============ 脚本执行 ============
function registerScriptHandler() {
  ipcMain.handle('script:run', async (_e, { code, input, ctx, config }) => {
    console.log('[script:run] 收到请求, code 长度:', code?.length, 'input 长度:', String(input ?? '').length)

    try {
      // ⬇ 每次执行时获取 require，避免顶层作用域问题
      const nodeRequire = await getNodeRequire()

      const wrapper = new Function(
        'input', 'ctx', 'require', 'module', 'exports',
        `"use strict";\n${code}\n`
      )
      const mod = { exports: {} }
      const runCtx = {
        config: config || {},
        responses: ctx?.responses || [],
        currentStep: ctx?.currentStep,
        log: (...args) => console.log('[script:log]', ...args),
      }

      let result = await wrapper(String(input ?? ''), runCtx, nodeRequire, mod, mod.exports)

      if (result === undefined && typeof mod.exports === 'function') {
        console.log('[script:run] 调用 module.exports 函数')
        result = await mod.exports(String(input ?? ''), runCtx)
      } else if (result === undefined && mod.exports !== undefined && Object.keys(mod.exports).length > 0) {
        result = mod.exports
      }

      const value = result == null ? '' : (typeof result === 'string' ? result : JSON.stringify(result))
      console.log('[script:run] 执行成功, 返回值长度:', value.length)
      return { ok: true, value }
    } catch (e) {
      console.error('[script:run] 执行失败:', e)
      return { ok: false, error: String(e?.message || e) }
    }
  })

  console.log('[main] script:run handler 已注册')
}

// ============ 窗口 ============
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
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  ipcMain.on('ping', () => console.log('pong'))
  registerHttpHandler()
  registerScriptHandler()
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})