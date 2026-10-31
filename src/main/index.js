// src/main/index.js
import { app, shell, BrowserWindow, ipcMain, net, session, dialog } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import zlib from 'zlib'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let globalBasePath = app.getPath('documents')
let runTimer = null

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
      return { ok: true, dir, libs: files.map((f) => ({ fileName: f, size: fs.statSync(join(dir, f)).size, mtime: fs.statSync(join(dir, f)).mtimeMs })) }
    } catch (e) { return { ok: false, error: String(e?.message || e), libs: [], dir: getLibsDir() } }
  })
  ipcMain.handle('lib:import', async () => {
    try {
      const result = await dialog.showOpenDialog({ title: '选择要导入的 JS 库', filters: [{ name: 'JavaScript', extensions: ['js'] }], properties: ['openFile', 'multiSelections'] })
      if (result.canceled) return { ok: false, canceled: true }
      const dir = getLibsDir()
      const imported = []
      for (const src of result.filePaths) {
        const fileName = safeLibName(basename(src))
        if (!fileName) continue
        fs.copyFileSync(src, join(dir, fileName))
        imported.push(fileName)
      }
      return { ok: true, imported }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('lib:delete', (_e, { fileName }) => {
    try {
      const name = safeLibName(fileName)
      if (!name) throw new Error('非法文件名')
      const p = join(getLibsDir(), name)
      if (fs.existsSync(p)) fs.unlinkSync(p)
      return { ok: true }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
}

function registerWorkareaHandlers() {
  ipcMain.handle('workarea:set-path', async () => {
    const result = await dialog.showOpenDialog({ title: '选择绑定的工作目录', properties: ['openDirectory', 'createDirectory'] })
    if (!result.canceled && result.filePaths.length > 0) { globalBasePath = result.filePaths[0]; return { ok: true, path: globalBasePath } }
    return { ok: false, canceled: true }
  })
  ipcMain.handle('workarea:get-path', () => ({ ok: true, path: globalBasePath }))
  ipcMain.handle('workarea:mkdir', (_e, { folderName }) => {
    try {
      const safeName = folderName.replace(/[<>:"/\\|?*]/g, '_')
      const fullPath = join(globalBasePath, safeName)
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true })
      return { ok: true, path: fullPath }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('workarea:write-json', (_e, { folderName, fileName, data }) => {
    try {
      const safeFolder = folderName.replace(/[<>:"/\\|?*]/g, '_')
      const safeFile = fileName.replace(/[<>:"/\\|?*]/g, '_')
      const dir = join(globalBasePath, safeFolder)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const filePath = join(dir, safeFile)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
      return { ok: true, path: filePath }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('workarea:run', (_e, { folderName, intervalSec }) => {
    try {
      if (runTimer) clearInterval(runTimer)
      const safeFolder = folderName.replace(/[<>:"/\\|?*]/g, '_')
      const runJsPath = join(globalBasePath, safeFolder, 'run.js')
      if (!fs.existsSync(runJsPath)) return { ok: false, error: `未找到 run.js：${runJsPath}` }
      const execute = () => {
        const child = spawn('node', [runJsPath], { cwd: join(globalBasePath, safeFolder) })
        child.stdout.on('data', (d) => console.log(`[Run stdout] ${d}`))
        child.stderr.on('data', (d) => console.error(`[Run stderr] ${d}`))
      }
      execute()
      if (intervalSec > 0) runTimer = setInterval(execute, intervalSec * 1000)
      return { ok: true, msg: intervalSec > 0 ? `已启动，每 ${intervalSec}s 执行一次` : '已执行一次' }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('workarea:stop-run', () => {
    if (runTimer) { clearInterval(runTimer); runTimer = null }
    return { ok: true }
  })
}

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
    if (!url || typeof url !== 'string') return { status: 0, statusText: 'error', body: '[bad url] 空', headers: [], time: 0 }
    try { new URL(url) } catch (e) { return { status: 0, statusText: 'error', body: `[bad url] ${url} -> ${e.message}`, headers: [], time: 0 } }
    let proxySession = null
    if (proxy) {
      try { proxySession = await getProxySession(proxy) } catch (e) { return { status: 0, statusText: 'error', body: `[proxy error] ${e.message}`, headers: [], time: 0 } }
    }
    return new Promise((resolve) => {
      let request
      try {
        const opts = { url, method: (method || 'GET').toUpperCase(), redirect: 'follow' }
        if (proxySession) opts.session = proxySession
        request = net.request(opts)
      } catch (e) { return resolve({ status: 0, statusText: 'error', body: `[net.request 失败] ${e.message}`, headers: [], time: 0 }) }
      const timer = setTimeout(() => {
        try { request.abort() } catch {}
        resolve({ status: 0, statusText: 'timeout', body: `请求超时（${timeoutMs}ms）\nurl=${url}`, headers: [], time: Date.now() - started })
      }, timeoutMs)
      Object.entries(headers || {}).forEach(([k, v]) => { try { request.setHeader(k, v) } catch {} })
      request.on('response', (response) => {
        const chunks = []
        response.on('data', (c) => chunks.push(Buffer.from(c)))
        response.on('end', () => {
          clearTimeout(timer)
          resolve({
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers: Object.entries(response.headers || {}).map(([k, v]) => ({ name: k, value: Array.isArray(v) ? v.join(', ') : String(v) })),
            body: Buffer.concat(chunks).toString('utf-8'),
            time: Date.now() - started,
          })
        })
        response.on('error', (err) => { clearTimeout(timer); resolve({ status: 0, statusText: 'error', body: `[response error] ${err.message}`, headers: [], time: Date.now() - started }) })
      })
      request.on('error', (err) => { clearTimeout(timer); resolve({ status: 0, statusText: 'error', body: `[net error] ${err.message || err}`, headers: [], time: Date.now() - started }) })
      try {
        if (body != null) request.write(typeof body === 'string' ? body : JSON.stringify(body))
        request.end()
      } catch (e) { clearTimeout(timer); resolve({ status: 0, statusText: 'error', body: `[write error] ${e.message}`, headers: [], time: Date.now() - started }) }
    })
  })
}

function aesCipherName(kind, keyLen) {
  return `aes-${keyLen * 8}-${kind}`
}

function registerCryptoHandler() {
  ipcMain.handle('crypto:transform', async (_e, { type, input, options = {} }) => {
    try {
      const s = String(input ?? '')
      switch (type) {
        case 'md5': return { ok: true, value: crypto.createHash('md5').update(s, 'utf8').digest('hex') }
        case 'sha1': return { ok: true, value: crypto.createHash('sha1').update(s, 'utf8').digest('hex') }
        case 'sha256': return { ok: true, value: crypto.createHash('sha256').update(s, 'utf8').digest('hex') }
        case 'zlib-compress': return { ok: true, value: zlib.deflateSync(Buffer.from(s, 'utf8')).toString('base64') }
        case 'zlib-decompress': return { ok: true, value: zlib.inflateSync(Buffer.from(s, 'base64')).toString('utf8') }
        case 'deflate-compress': return { ok: true, value: zlib.deflateRawSync(Buffer.from(s, 'utf8')).toString('base64') }
        case 'deflate-decompress': return { ok: true, value: zlib.inflateRawSync(Buffer.from(s, 'base64')).toString('utf8') }
        case 'gzip-compress': return { ok: true, value: zlib.gzipSync(Buffer.from(s, 'utf8')).toString('base64') }
        case 'gzip-decompress': return { ok: true, value: zlib.gunzipSync(Buffer.from(s, 'base64')).toString('utf8') }
        case 'jiem-decompress': {
          const buf = Buffer.from(s, 'base64')
          if (buf.length < 8) throw new Error('数据长度 < 8 字节')
          buf[0] = 0x1f; buf[1] = 0x8b; buf[2] = 0x08; buf[4] = 0x00; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;
          return { ok: true, value: zlib.gunzipSync(buf).toString('utf8') }
        }
        case 'jiem-compress': {
          const compressed = zlib.gzipSync(Buffer.from(s, 'utf8'))
          compressed[0] = 0x01; compressed[1] = 0x01; compressed[2] = 0x01; compressed[4] = 0x01; compressed[5] = 0x01; compressed[6] = 0x01; compressed[7] = 0x01;
          return { ok: true, value: compressed.toString('base64') }
        }
        case 'qm': {
          const { secret } = options
          if (!secret) throw new Error('缺少 secret')
          const raw = Buffer.from(s, 'base64')
          const md5_1 = crypto.createHash('md5').update(raw).digest('hex')
          return { ok: true, value: crypto.createHash('md5').update(md5_1 + secret, 'utf8').digest('hex') }
        }
        case 'aes-cbc-encrypt': {
          const cipher = crypto.createCipheriv(aesCipherName('cbc', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([cipher.update(Buffer.from(s, 'utf8')), cipher.final()]).toString('base64') }
        }
        case 'aes-cbc-decrypt': {
          const decipher = crypto.createDecipheriv(aesCipherName('cbc', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([decipher.update(Buffer.from(s, 'base64')), decipher.final()]).toString('utf8') }
        }
        case 'aes-gcm-encrypt': {
          const cipher = crypto.createCipheriv(aesCipherName('gcm', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          const encrypted = Buffer.concat([cipher.update(Buffer.from(s, 'utf8')), cipher.final()])
          return { ok: true, value: Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64') }
        }
        case 'aes-gcm-decrypt': {
          const data = Buffer.from(s, 'base64')
          const tag = data.slice(data.length - 16); const encrypted = data.slice(0, data.length - 16)
          const decipher = crypto.createDecipheriv(aesCipherName('gcm', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          decipher.setAuthTag(tag)
          return { ok: true, value: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8') }
        }
        case 'aes-ctr-encrypt': {
          const cipher = crypto.createCipheriv(aesCipherName('ctr', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([cipher.update(Buffer.from(s, 'utf8')), cipher.final()]).toString('base64') }
        }
        case 'aes-ctr-decrypt': {
          const decipher = crypto.createDecipheriv(aesCipherName('ctr', options.key.length / 2), Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([decipher.update(Buffer.from(s, 'base64')), decipher.final()]).toString('utf8') }
        }
        case 'des-cbc-encrypt': {
          const cipher = crypto.createCipheriv('des-cbc', Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([cipher.update(Buffer.from(s, 'utf8')), cipher.final()]).toString('base64') }
        }
        case 'des-cbc-decrypt': {
          const decipher = crypto.createDecipheriv('des-cbc', Buffer.from(options.key, 'hex'), Buffer.from(options.iv, 'hex'))
          return { ok: true, value: Buffer.concat([decipher.update(Buffer.from(s, 'base64')), decipher.final()]).toString('utf8') }
        }
        case 'rsa-oaep-encrypt': return { ok: true, value: crypto.publicEncrypt({ key: options.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(s, 'utf8')).toString('base64') }
        case 'rsa-oaep-decrypt': return { ok: true, value: crypto.privateDecrypt({ key: options.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(s, 'base64')).toString('utf8') }
        case 'rsa-pkcs1-encrypt': return { ok: true, value: crypto.publicEncrypt({ key: options.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(s, 'utf8')).toString('base64') }
        case 'rsa-pkcs1-decrypt': return { ok: true, value: crypto.privateDecrypt({ key: options.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(s, 'base64')).toString('utf8') }
        case 'jwt-hs256-sign': {
          const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
          const payload = Buffer.from(s, 'utf8').toString('base64url')
          const sign = crypto.createHmac('sha256', options.secret).update(`${header}.${payload}`).digest('base64url')
          return { ok: true, value: `${header}.${payload}.${sign}` }
        }
        default: return { ok: false, error: `未知类型：${type}` }
      }
    } catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
}

function registerScriptHandler() {
  ipcMain.handle('script:run', async (_e, { code, input, config, context }) => {
    try {
      const { createRequire } = await import('module')
      const req = createRequire(import.meta.url)
      
      if (context) {
        const crypto = (await import('crypto')).default;
        const md5Fn = (text) => crypto.createHash('md5').update(String(text)).digest('hex');
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction('input', 'vars', 'envs', 'responses', 'md5', `"use strict";\n${code}`);
        const r = await fn(input, context.vars || {}, context.envs || {}, context.responses || [], md5Fn);
        return { ok: true, value: r == null ? '' : (typeof r === 'object' ? JSON.stringify(r) : String(r)) };
      }

      const mod = { exports: {} }
      const ctx = { config, input }
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        'input', 'ctx', 'require', 'module', 'exports', 
        'USER_DATA_PATH', 'APP_PATH', 'RESOURCES_PATH', 'LIBS_PATH', code
      );
      
      const directResult = await fn(
        input, ctx, req, mod, mod.exports, 
        app.getPath('userData'), app.getAppPath(), process.resourcesPath, getLibsDir()
      );
      
      if (directResult !== undefined) return { ok: true, value: directResult };
      
      const exportedFn = mod.exports || mod.export;
      if (typeof exportedFn === 'function') {
        const result = await exportedFn(input, ctx);
        return { ok: true, value: result };
      }
      
      return { ok: true, value: input };
    } catch (e) {
      return { ok: false, error: String(e?.stack || e?.message || e) }
    }
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800, show: false, autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, contextIsolation: true, nodeIntegration: false,
    },
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url); return { action: 'deny' }
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
  registerHttpHandler()
  registerLibHandlers()
  registerWorkareaHandlers()
  registerCryptoHandler()
  registerScriptHandler()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})