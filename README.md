# HAR 工作台 · 项目说明文档

> **用途**：开新会话时直接贴这份文档给我，能跳过探索阶段，直接理解你的意图。
> **维护建议**：每次大改动后更新「设计意图」「已知限制」「修复进度」三节。

---

## 一、项目定位

一个**本地运行、面向协议分析 / 重放 / 自动化签名**的桌面工具，核心工作流：

```
导入 HAR 抓包  →  按业务切分请求组  →  用标签描述加密/签名规则
              →  执行整组（自动处理前置依赖）  →  二进制/文本原样发送
```

**目标用户**：需要反复复现某个 App / SDK 加密流程、验证签名算法、批量重放带状态链的请求的人。

**不做的事**：
- 不是通用 HTTP 客户端（比如不是 Postman）
- 不做代理拦截（HAR 由外部工具导入）
- 不联网同步、不上传任何数据（全部本地）

---

## 二、技术栈与目录

| 层 | 技术 |
|---|---|
| 容器 | Electron + electron-vite |
| 渲染进程 | React 18 + Ant Design 5 + Vite（HMR） |
| 主进程 | Node.js（Electron 内置）+ `net.request`（不走 fetch） |
| 渲染 ↔ 主 | `ipcRenderer.invoke` / `ipcMain.handle`，`contextIsolation: true`，preload 暴露 `window.electronAPI` |
| 持久化 | 渲染进程 localStorage（配置类） / IndexedDB（HAR 大数据） / 主进程 `userData/config.json`（工作区路径） / `userData/libs/`（用户 JS 库） |

```
src/
  main/index.js                # 主进程：HTTP / crypto / script / workarea / libs
  preload/index.js             # IPC 桥
  renderer/src/
    App.jsx                    # 路由（无 react-router，Menu key 切换）
    pages/                     # HarViewer / ReplayPage / ProjectNew / ProjectHistory / ProjectDetail / GlobalAlgorithm / GlobalEnv
    components/                # RequestWorkbench / RequestDetail / HackvertorEditor / AddToProjectModal / ErrorBoundary
    store/                     # projectStore / algorithmStore / scriptStore / envStore / idbStore / replayStore
    utils/
      har.js                   # HAR 解析、path 工具、deepClone、uid
      hackTags.js              # 🔥 标签引擎核心（processTags / updateOpTags / extractVarsOnly）
      strictTransforms.js      # 🔥 算法注册表（TRANSFORMS / TRANSFORM_GROUPS / applyTransform）
    hooks/
      useIDBState.js           # IndexedDB 持久化 state
      usePersistentState.js    # localStorage 持久化 state
```

---

## 三、核心概念（必读）

### 1. Entry（请求条目）
HAR 的 `log.entries[i]`，扩充了 `_uid` / `_initialRequest` / `_initialResponse`（用于重置） / `tags`。

### 2. Project / Group / Level
- **Project**：一个测试目标（比如"某游戏 SDK"）
- **Group**：项目内的请求组，一个业务流（比如"登录"、"下单"）
- **Level**：每组有两层
  - **主组**（main）：按顺序执行，产出变量/响应，是正流程
  - **副组**（sub）：根据主组产出的"判定变量"（如等级 `level`）**条件触发**，内部再按「阶梯区间」分档

### 3. 阶梯区间（zones）
副组的执行策略：`[min, max)` 匹配判定值 → 执行副组 → 检查响应是否含 `successKeyword` → 成功则标记 `success`，失败则重试（`maxRetries` 次）→ 到顶标记 `failed`（死局）。

**执行期间 zones 状态写回 store，前端 Drawer 实时显示。**

### 4. 判定变量（judgeVar）
主组执行结束时，`vars[judgeVar]` 的值（一般由 `<@var:level>...</@var:level>` 提取）用于选档。

---

## 四、标签系统（Hackvertor 风格）—— 项目核心

### 1. 语法

```
<@类型:算法名:参数1=值1,参数2=值2>内容</@类型:算法名>
```

| 类型 | 作用 | 执行时机 | 结果是否写回原文 |
|---|---|---|---|
| `enc` | 编码（encode 方向） | 每次发送前 | ❌ 不写回（每次都重算） |
| `dec` | 解码（decode 方向） | 每次发送前 | ❌ 不写回 |
| `op` | 累积运算（math/timestamp/hash 等） | 每次发送前 | ✅ **固化回原文**（5→6→7→8 累积） |
| `var` | 提取变量供后续标签/脚本使用 | 每次发送前 | ❌ 不写回（值进 `ctx.vars`） |
| `env` | 读取全局环境变量 | 每次发送前 | ❌ 不写回（值从 `envStore` 读） |
| `script` | 调用主进程 Node.js 脚本 | 每次发送前 | ❌ 不写回 |

**类型由 `getAlgoTagType(algoKey)` 自动推断**：`math`/`math-floor`/`number` 归 `op`，其余按 `TRANSFORMS[algoKey].direction` 归 `enc`/`dec`。

### 2. 三条关键执行函数

| 函数 | 用途 |
|---|---|
| `updateOpTags(text, ctx)` | 只处理 `op` 标签，结果**字符串化**写回 text，返回新文本 |
| `processTags(text, ctx)` | 处理 `enc/dec/var/env/script`，返回最终字符串（或纯二进制 `Uint8Array`） |
| `extractVarsOnly(text, ctx)` | 只跑 `var` 标签填充 `ctx.vars`，不改文本 |

**执行顺序（`processSingleEntry` 内）**：
```
extractVarsOnly → updateOpTags（写回） → processTags（发送） → applyResponse（写回响应）
```

### 3. 上下文 `ctx`（贯穿整条链路）

```js
{
  vars: {},        // <@var:name> 提取的变量
  envs: {},        // 全局环境变量
  scripts: {},     // 用户自定义脚本定义
  responses: [],   // 前面请求的响应（chain 依赖）
  config: {},      // 当前标签参数（如 key=xxx,iv=yyy）
  input,           // 当前标签包裹的原文
}
```

### 4. 算法注册表（`strictTransforms.js`）

`TRANSFORMS` 是 key → 定义 的映射：

```js
{
  'aes-cbc': {
    label: 'AES-CBC',
    group: 'crypto',
    direction: 'both',                    // encode-only / decode-only / both
    configFields: [                       // ← 决定右键菜单弹出什么配置表单
      { name: 'key', label: '密钥 (Hex)', required: true },
      { name: 'iv',  label: 'IV (Hex)',   required: true },
      { name: 'stripInnerNewlines', label: '去除内部换行', type: 'boolean', defaultValue: 'false' },  // 自动注入
    ],
    encode: async (v, cfg) => callCrypto('aes-cbc-encrypt', v, cfg),
    decode: async (v, cfg) => callCrypto('aes-cbc-decrypt', v, cfg),
  },
}
```

**新增算法 = 在 `TRANSFORMS` 里加一项 + （若需要底层能力）在主进程 `registerCryptoHandler` 加对应 case。**

### 5. `stripInnerNewlines` 开关

**自动注入**到 `encoding / format / crypto / hash / app` 组的算法上。默认 `false`。
- 勾选后 `applyTransform` 在调用 encode/decode 前执行 `v.replace(/\r?\n/g, '')`。
- **JSON 输入**天然被 `sanitizeContent` 紧凑化，不受影响。
- **PEM 私钥**绝不能开（依赖换行）。
- 参数以 `stripInnerNewlines=true/false` 写入标签。

### 6. 用户自定义脚本（`script` 标签）

用户在主进程 Node 环境执行任意 JS。可用变量：

```js
input, ctx,                       // 顶层函数参数
require, module, exports,         // 完整 Node 能力
USER_DATA_PATH, APP_PATH,
RESOURCES_PATH, LIBS_PATH,        // LIBS_PATH = userData/libs
vars, envs, responses, md5, config,
```

两种返回值写法：
```js
// 直接 return
return xxx;

// 或 module.exports
module.exports = function(input, ctx) { return xxx; };
```

返回 `Buffer` / `Uint8Array` 会被主进程原样返回（IPC 结构化克隆），走二进制发送链路。

---

## 五、二进制与文本边界（**最容易混淆的地方**）

### 1. 发送侧（请求 body）

| 场景 | 结果 | 说明 |
|---|---|---|
| body 整个就是**一个二进制标签** | `Uint8Array` | ✅ 主进程按字节发送 |
| body 是 `{"data":"<@enc:aes>...</@enc:aes>"}` | JSON 字符串（内层 base64） | 字符串模型的固有限制 |
| body 混合文本 + 二进制标签 | 字符串（二进制 base64 化） | 同上 |
| 多个二进制标签拼接 | 字符串（各自 base64 化） | 同上 |
| **二进制标签被外层标签包裹** | 外层拿到 **base64 文本** | **当前设计**（见下方说明） |

**规则**：`processTags` 里，如果整个 text 只剩这一个标签 → 返回 `Uint8Array`；否则 `btoa` 成 base64 嵌入字符串。

### 2. 二进制嵌套不是 bug（**设计意图**）

```
<@enc:gzip><@enc:aes>xxx</@enc:aes></@enc:gzip>
```

内层 `aes` 输出二进制 → 外层的输入是 **base64 字符串**，不是原始字节。
**这是有意为之**，因为 `processTags` 是字符串拼接模型。

**推荐做法**：复合操作写进**一个** `script` 标签内部串起来：
```js
// 一个 script 内同时完成 AES 加密 + gzip 压缩
const cipher = crypto.createCipheriv(...);
const encrypted = Buffer.concat([cipher.update(input, 'utf8'), cipher.final()]);
const gz = zlib.gzipSync(encrypted);
return gz;  // 直接返回 Buffer → 整段就是一个二进制标签 → 二进制发送
```

### 3. 接收侧（响应 body）

- 主进程按 `Content-Type` 判定文本 vs 二进制。
- **应主动解压 `Content-Encoding: gzip/deflate/br`**（待修复 A1）。
- 二进制响应进 `ctx.responses[i].body = { type: 'binary', bytes, base64, size }`。
- store 里 `response.content = { text: base64, encoding: 'base64', ... }`，`decodeContent` 会尝试还原。

### 4. `op` 标签永不输出二进制（**设计约束**）

`op` 的结果需要写回原文，二进制无法写回 → `updateOpTags` 遇到二进制直接跳过该标签（保留原样 + console.warn）。
**要输出二进制请用 `enc`。**

---

## 六、执行引擎（`ProjectDetailPage.executeGroup`）

### 1. 核心循环

```
while (!stop) {
  fresh = getProjectSnapshot(projectId)   // 每轮从 ref 读最新（保证 op 累积）
  for mainReq of fresh.groups[i].requests:
    processSingleEntry(mainReq, ctx, 'main')
  
  // 副组判定
  judgeVal = ctx.vars[judgeVar]
  matchedZone = zones.find(z => judgeVal in z)
  if (matchedZone && matchedZone.status === 'none' || isSoloSub):
    executeSubGroup()
  
  wait(intervalSec)  // 0 表示只跑一次
}
```

### 2. `processSingleEntry` 五步

1. `extractVarsOnly` → 填充 `ctx.vars`
2. `updateOpTags` → 累积运算写回 store（`updateRequestFields`）
3. `processTags(url/headers/body)` → 得到最终发送内容
   - **URL/Header 必须是字符串**（二进制抛错）
   - **body 允许 `Uint8Array`**
4. `http:request` → 主进程 `net.request` 发送
5. `applyResponse` → 响应写回 store（二进制用 base64 + `encoding: 'base64'`）

### 3. 停止 / 暂停语义

- **暂停**：`pauseFlagRef.current = true`，500ms 轮询阻塞
- **停止**：`stopAfterRoundRef.current = true`，**当前整组执行完毕后**才退出（平滑停止）
- 执行期间即使用户切页面，执行仍在后台跑，UI 通过 `setExecLogs` 更新（Modal 可关闭）

### 4. 副组重试机制

- 副组执行后检查响应是否含 `successKeyword`
- 成功 → `zone.status = 'success'`，清空 `pendingSubPayloadRef`
- 失败 → 缓存当前 payloads，下一轮主循环用**原包重试**（不重新计算标签）
- 到达 `maxRetries` → `zone.status = 'failed'`（死局）

---

## 七、主进程安全边界

| 接口 | 安全措施 |
|---|---|
| `lib:*` | `safeLibName`：只允许 `[\w.-]+\.js`，拒绝 `..`、Windows 保留名 |
| `workarea:*` | `safeSegment`：拒绝 `..` / 隐藏文件 / 保留名；`run.js` 在 `userData` 下的子进程执行 |
| `http:request` | 30s 超时、URL 校验、代理 session 独立 partition |
| `script:run` | **无沙箱**（用户明确写脚本，主动授权），但 contextIsolation 保证渲染进程无 Node |
| `crypto:transform` | 纯计算，无 IO |

**CSP**：`index.html` 允许 `'unsafe-eval'`（`new AsyncFunction` 执行用户脚本必需）。Electron 的 CSP 警告可忽略（打包后消失）。

---

## 八、持久化

| 数据 | 存储 | 键 |
|---|---|---|
| 项目列表 | localStorage | `har-projects-v1` |
| HAR entries | IndexedDB (`har-tool/kv`) | `har-entries-v1` |
| 脚本定义 | localStorage | `har-scripts-v1` |
| 全局算法配置 | localStorage | `har-algorithms-v3` |
| 环境变量 | localStorage | `har-env-v1` |
| UI 状态 | localStorage | `ui-*` |
| 工作区路径 | `userData/config.json` | `{ basePath }` |
| 用户 JS 库 | `userData/libs/*.js` | - |

**Store 模式**：全部 `useRef` 同步跟踪 + `setState` 内 `ref.current = next`（为了让执行引擎的 `getProjectSnapshot` 在同一个同步块拿到最新）。

---

## 九、**哪些是设计意图，不是 Bug**

1. **`op` 输出二进制会被跳过** —— 有意的，op 语义就是"可字符串化的累积运算"。
2. **二进制标签被外层包裹时变 base64** —— 字符串拼接模型的固有限制，推荐用一个 `script` 串起来。
3. **CSP 允许 `unsafe-eval`** —— `new AsyncFunction` 执行用户代码必需。
4. **`script` 标签无沙箱** —— 用户主动编写的脚本，等同本地执行 Node。
5. **执行停止是"平滑"的** —— 当前整组跑完才停，避免中途丢状态。
6. **副组失败用原包重试** —— 因为重算标签可能得到不同结果（时间戳等），重试应保持同一包。
7. **主进程返回的 `res.body` 始终以 `Content-Type` 判定** —— 不强制 base64，避免二次编码开销。
8. **每轮执行都从 `getProjectSnapshot` 重新读** —— 为了让 `op` 标签累积生效（5→6→7→8），不要改回用闭包变量。
9. **`updateOpTags` 用占位符 `\x00OP{n}\x00`** —— 防止新标签被再次匹配（外层标签干扰）。
10. **`sanitizeContent` 对 JSON 紧凑化但不删非 JSON 内部换行** —— PEM 私钥、多行签名原文需要保留换行。

---

## 十、已知限制（功能未实现，不是 Bug）

1. **没有请求间的延迟控制**（组内每条请求固定 50~100ms，不暴露 UI）。
2. **没有并发执行**（一次只跑一组，防止状态冲突）。
3. **没有历史执行记录持久化**（`execLogs` 只在内存，关闭 Modal 清空）。
4. **没有断点 / 单步调试**（只能"跑整组"或"单测副组"）。
5. **没有 HAR 请求的 diff / 对比视图**。
6. **没有标签语法高亮以外的自动补全**（Hackvertor 编辑器只做了着色）。
7. **不支持 WebSocket 抓包 / 重放**。
8. **浏览器 DevTools 未开放**（可在 `createWindow` 里加 `mainWindow.webContents.openDevTools()`）。

---

## 十一、修复进度索引（截至最近一轮）

### ✅ 已完成
- #1 `scriptStore.createScript` 竞态（ref 同步检查）
- #2 `getProjectSnapshot` 竞态（`setProjectsSync` 同步写 ref）
- #3 `executeGroup` 中 `subConfig` 闭包（每轮读 `freshGroup.subGroup` + 函数式 `updateSubGroup`）
- #4 `setEntries` 旧状态覆盖（updater 直传 store）
- #5 高亮滚动同步（去掉 `font-weight: bold`）
- #6 预览模式强制切换（`userToggledPreviewRef`）
- #7 JWT padding
- #8 全局配置表单值不同步（`onOpenChange` 时 `setFieldsValue`）
- #9 脚本配置字段必填开关（`Checkbox`）
- #10 `RequestWorkbench` 渲染性能（`entriesIndexMap`）
- `script:run` 统一注入 `require/module/exports/路径/vars/envs/responses/md5/config`
- `stripInnerNewlines` 开关（`configFields` 自动注入 + `Switch` UI + `applyTransform` 执行）
- 二进制发送链路（`http:request` 支持 `Uint8Array` body）
- `updateOpTags` 拒绝二进制写回

### ⏳ 待修复（优先级）
- **A1** `http:request` 未解压 gzip/deflate/br 响应（🔴 高）
- **A2** `RequestWorkbench` 过滤状态下拖拽索引错位（🔴 高）
- **A3** `RequestDetail` 执行中 op 写回不同步到编辑区（🟠 中）
- **A5** `updateOpTags` 遇二进制 `break` 导致后续 op 不处理（🟠 中，实际很少遇到）
- **B1** `HackvertorEditor` 每次按键触发 `processTags`（无 debounce）
- **B2** `insertCode` 光标位置（追加末尾而非光标处）
- **B3** 副组模式导出 `userInfo.json` 用主组请求（🟠）
- **B4** `intervalSec` 闭包旧值（执行中改无效）
- **B5** `useIDBState` 可能写默认值进 IDB
- **B6** `JsonTree` 大 JSON 卡顿（限制展开深度）
- **B7** `registerScriptHandler` 冗余 `await import('crypto')`（直接用顶层）
- **C1~C8** 低优先级清理项（`safeSegment` 误伤、子进程未等待、Drawer `width` deprecated 等）

---

## 十二、下次开新会话时，请这样开场

> "读一下这份项目说明（贴入），我现在要[做什么]，涉及[哪个模块]。如果需要看代码我会贴。"

**特别提醒**：
- 涉及**标签引擎**（`hackTags.js`）的改动，**先确认是否与"设计意图第 1/2/9/10 条"冲突**，不要擅自"修复"这些刻意设计。
- 涉及**执行引擎**的改动，**必须保证 `getProjectSnapshot` 每轮从 ref 读**（否则 op 累积会失效，这是曾经踩过的坑）。
- 涉及**二进制**，先回顾「第五节」，**默认走 base64 文本嵌入**，除非明确要纯二进制发送。

---

## 附：一句话总结给未来的我

> 这是一个「以标签语法描述加密规则 + 请求组状态机驱动执行」的本地 HAR 分析工具。**标签引擎是字符串模型，二进制只在纯标签场景原样透传**。**执行引擎是"快照驱动 + 平滑停止"**。**存储全部本地，不联网**。