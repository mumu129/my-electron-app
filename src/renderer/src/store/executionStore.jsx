// src/renderer/src/store/executionStore.jsx
import React, { createContext, useContext, useCallback, useRef, useState } from 'react'
import { App as AntApp } from 'antd'
import { useProjects } from './projectStore'
import { useScripts } from './scriptStore'
import { useEnvs } from './envStore'
import { useSettings } from './settingsStore'
import { processTags, updateOpTags, extractVarsOnly } from '../utils/hackTags'

const Ctx = createContext(null)

export function ExecutionProvider({ children }) {
  const { getProjectSnapshot, updateRequestFields, applyResponse, updateSubGroup } = useProjects()
  const { scripts } = useScripts()
  const { envs } = useEnvs()
  const { settingsRef } = useSettings()
  const { message } = AntApp.useApp()

  const scriptsRef = useRef(scripts); scriptsRef.current = scripts
  const envsRef = useRef(envs); envsRef.current = envs

  const [tasks, setTasks] = useState({})
  const tasksRef = useRef({})
  const taskRefsRef = useRef({})

  const updateTask = useCallback((taskId, patchOrUpdater) => {
    setTasks((prev) => {
      const t = prev[taskId]
      if (!t) return prev
      const nextTask = typeof patchOrUpdater === 'function' ? patchOrUpdater(t) : { ...t, ...patchOrUpdater }
      const next = { ...prev, [taskId]: nextTask }
      tasksRef.current = next
      return next
    })
  }, [])

  const appendLog = useCallback((taskId, logItem) => {
    setTasks((prev) => {
      const t = prev[taskId]
      if (!t) return prev
      const body = logItem.body && logItem.body.length > 2000
        ? logItem.body.slice(0, 2000) + `\n...[已截断 ${logItem.body.length - 2000} 字符]`
        : logItem.body
      const nextLogs = [{ ...logItem, body }, ...t.logs].slice(0, 150)
      const next = { ...prev, [taskId]: { ...t, logs: nextLogs } }
      tasksRef.current = next
      return next
    })
  }, [])

  const processSingleEntry = useCallback(async (taskId, entry, ctx, source, freshGroup) => {
    const t = tasksRef.current[taskId]
    if (!t) return null
    const { projectId, groupId } = t
    const entryUid = entry._uid
    const req = entry.request || {}
    const method = req.method || 'GET'
    const updates = []

    const mainProxy = freshGroup.proxy || ''
    const subProxy = freshGroup.subGroup?.proxy || ''
    const currentProxy = source === 'sub' ? (subProxy || mainProxy) : mainProxy

    try {
      let rawUrl = req.url || ''
      let rawBody = req.postData?.text
      let rawHeaders = req.headers || []

      const allTextFields = [rawUrl, rawBody, ...rawHeaders.map(h => h.value)].filter(Boolean)
      for (const text of allTextFields) await extractVarsOnly(text, ctx)

      let updatedUrl = await updateOpTags(rawUrl, ctx)
      let updatedBody = rawBody ? await updateOpTags(rawBody, ctx) : undefined
      let updatedHeaders = [...rawHeaders]

      for (let i = 0; i < updatedHeaders.length; i++) {
        if (updatedHeaders[i].value) {
          updatedHeaders[i] = { ...updatedHeaders[i], value: await updateOpTags(updatedHeaders[i].value, ctx) }
        }
      }

      if (updatedUrl !== rawUrl) updates.push({ fieldPath: 'request.url', value: updatedUrl })
      if (updatedBody && updatedBody !== rawBody) updates.push({ fieldPath: 'request.postData.text', value: updatedBody })
      updatedHeaders.forEach((h, i) => {
        if (h.value !== rawHeaders[i].value) updates.push({ fieldPath: `request.headers.${i}.value`, value: h.value })
      })

      if (updates.length > 0) {
        updateRequestFields(projectId, groupId, entryUid, updates, source === 'sub' ? 'sub' : 'main')
      }

      let finalUrl = await processTags(updatedUrl, ctx)
      let finalBody = updatedBody ? await processTags(updatedBody, ctx) : undefined

      let finalHeaders = {}
      for (const h of updatedHeaders) {
        if (h.name && !['host', 'content-length', 'connection'].includes(h.name.toLowerCase())) {
          finalHeaders[h.name] = await processTags(h.value || '', ctx)
        }
      }

      const s = settingsRef.current
      const payload = {
        url: finalUrl, method, headers: finalHeaders, body: finalBody,
        proxy: currentProxy || undefined,
        timeoutMs: s.timeoutMs,
      }
      const maxRetries = Number(s.retries) || 0
      let res = null
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        res = await window.electronAPI.httpRequest(payload)
        if (res && res.status > 0) break
        if (attempt < maxRetries) {
          appendLog(taskId, {
            id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(),
            url: finalUrl, method, status: 'RETRY', statusText: `第 ${attempt + 1} 次失败，即将重试`,
            body: '', timeCost: 0, source,
          })
          await new Promise(r => setTimeout(r, s.retryDelayMs))
        }
      }

      ctx.responses.push({ status: res.status, headers: res.headers, body: res.body })

      appendLog(taskId, {
        id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(),
        url: finalUrl, method, status: res.status, statusText: res.statusText,
        body: res.body || '', timeCost: res.time, source,
      })

      applyResponse(projectId, groupId, entryUid, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers || [],
        content: { text: res.body, size: res.body?.length || 0, mimeType: 'application/json' },
        time: res.time,
      }, source === 'sub' ? 'sub' : 'main')

      return { ...res, _payload: payload }
    } catch (e) {
      ctx.responses.push({ status: 0, headers: [], body: `[ERROR] ${e.message}` })
      appendLog(taskId, {
        id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(),
        url: req.url, method, status: 'ERR', statusText: e.message,
        body: '', timeCost: 0, source,
      })
      return null
    }
  }, [getProjectSnapshot, updateRequestFields, applyResponse, settingsRef, appendLog])

  const runLoop = useCallback(async (taskId) => {
    const refs = taskRefsRef.current[taskId]
    if (!refs) return
    const { stopFlag, pauseFlag, pendingSubPayload } = refs

    const checkPause = async () => {
      while (pauseFlag.v && !stopFlag.v) await new Promise(r => setTimeout(r, 500))
    }

    try {
      while (!stopFlag.v) {
        const t = tasksRef.current[taskId]
        if (!t) break
        const { projectId, groupId, isSoloSub, intervalSec } = t

        const fresh = getProjectSnapshot(projectId)
        const freshGroup = fresh?.groups?.find((g) => g.id === groupId)
        if (!freshGroup) {
          message.warning(`[${t.groupName}] 请求组已被删除，执行终止`)
          break
        }

        const mainReqs = freshGroup.requests || []
        const subReqsData = freshGroup.subGroup?.requests || []
        const freshSubConfig = freshGroup.subGroup || {
          zones: [], successKeyword: '"code":200', maxRetries: 3, judgeVar: 'level', proxy: '',
        }

        const groupCtx = { vars: {}, responses: [], scripts: scriptsRef.current, envs: envsRef.current }

        if (!isSoloSub) {
          for (let i = 0; i < mainReqs.length; i++) {
            await checkPause()
            if (stopFlag.v) break
            await processSingleEntry(taskId, mainReqs[i], groupCtx, 'main', freshGroup)
            await new Promise(r => setTimeout(r, settingsRef.current.requestDelayMs))
          }
        }

        if (!stopFlag.v && subReqsData.length > 0) {
          await checkPause()

          const judgeVarName = freshSubConfig.judgeVar || 'level'
          const judgeVal = isSoloSub ? 999999 : groupCtx.vars[judgeVarName]

          if (judgeVal !== undefined) {
            const currLevel = Number(judgeVal)
            updateTask(taskId, { currentLevel: currLevel })

            const matchedZone = (freshSubConfig.zones || []).find(z => currLevel >= z.min && currLevel < z.max)

            if (isSoloSub || (matchedZone && matchedZone.status === 'none')) {
              let lastSubResponseText = ''
              let currentRetryCount = 1

              if (pendingSubPayload.v && pendingSubPayload.v.zoneId === (isSoloSub ? 'solo' : matchedZone.id)) {
                currentRetryCount = pendingSubPayload.v.retryCount
                message.warning(`[${t.groupName} 副组] 原包重试中 (${currentRetryCount}/${freshSubConfig.maxRetries})...`)

                for (const p of pendingSubPayload.v.payloads) {
                  await checkPause()
                  if (stopFlag.v) break
                  const res = await window.electronAPI.httpRequest(p)
                  if (res && res.body) lastSubResponseText = res.body
                  appendLog(taskId, {
                    id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(),
                    url: p.url, method: p.method, status: res.status, statusText: res.statusText,
                    body: res.body || '', timeCost: res.time, source: 'sub-retry',
                  })
                  await new Promise(r => setTimeout(r, settingsRef.current.requestDelayMs))
                }
              } else {
                const subCtx = { vars: groupCtx.vars, responses: [], scripts: scriptsRef.current, envs: envsRef.current }
                let cachedPayloads = []

                for (let j = 0; j < subReqsData.length; j++) {
                  await checkPause()
                  if (stopFlag.v) break
                  const res = await processSingleEntry(taskId, subReqsData[j], subCtx, 'sub', freshGroup)
                  if (res && res._payload) {
                    cachedPayloads.push(res._payload)
                    if (res.body) lastSubResponseText = res.body
                  }
                  await new Promise(r => setTimeout(r, settingsRef.current.requestDelayMs))
                }
                pendingSubPayload.v = { zoneId: isSoloSub ? 'solo' : matchedZone?.id, payloads: cachedPayloads, retryCount: 1 }
              }

              if (lastSubResponseText.includes(freshSubConfig.successKeyword)) {
                message.success(`[${t.groupName} 副组] 响应成功！`)
                if (!isSoloSub && matchedZone) {
                  updateSubGroup(projectId, groupId, (prev) => ({
                    zones: (prev.zones || []).map(z => (z.id === matchedZone.id ? { ...z, status: 'success' } : z)),
                  }))
                }
                pendingSubPayload.v = null
              } else {
                if (currentRetryCount >= (freshSubConfig.maxRetries || 3)) {
                  message.error(`[${t.groupName} 副组] 达到最大重试次数，标记为死局！`)
                  if (!isSoloSub && matchedZone) {
                    updateSubGroup(projectId, groupId, (prev) => ({
                      zones: (prev.zones || []).map(z => (z.id === matchedZone.id ? { ...z, status: 'failed' } : z)),
                    }))
                  }
                  pendingSubPayload.v = null
                } else {
                  message.warning(`[${t.groupName} 副组] 失败，等待原包重试...`)
                  pendingSubPayload.v = { zoneId: isSoloSub ? 'solo' : matchedZone?.id, payloads: pendingSubPayload.v?.payloads || [], retryCount: currentRetryCount + 1 }
                }
              }
            }
          }
        }

        updateTask(taskId, (prev) => ({ ...prev, rounds: (prev.rounds || 0) + 1 }))

        if (stopFlag.v) {
          message.success(`[${t.groupName}] 平滑停止完成`)
          break
        }
        if (isSoloSub || !intervalSec || intervalSec <= 0) break

        let waitTime = intervalSec * 1000
        while (waitTime > 0 && !stopFlag.v) {
          await new Promise(r => setTimeout(r, 500))
          if (!pauseFlag.v) waitTime -= 500
        }
      }
    } catch (e) {
      console.error('[ExecutionStore] 循环异常:', e)
      message.error(`[${tasksRef.current[taskId]?.groupName || taskId}] 执行异常: ${e.message}`)
    } finally {
      updateTask(taskId, { status: 'stopped' })
    }
  }, [getProjectSnapshot, processSingleEntry, updateTask, updateSubGroup, appendLog, message, settingsRef])

  const startTask = useCallback(({ projectId, groupId, intervalSec, isSoloSub = false }) => {
    const existing = Object.values(tasksRef.current).find(
      (t) => t.projectId === projectId && t.groupId === groupId && t.status !== 'stopped'
    )
    if (existing) {
      message.warning(`「${existing.groupName}」已在执行中`)
      return null
    }

    const snap = getProjectSnapshot(projectId)
    const group = snap?.groups?.find((g) => g.id === groupId)
    if (!group) { message.error('请求组不存在'); return null }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const task = {
      id: taskId, projectId, groupId,
      groupName: group.name, projectName: snap.name,
      intervalSec, isSoloSub,
      status: 'running', currentLevel: '-',
      logs: [], startedAt: Date.now(), rounds: 0,
    }

    taskRefsRef.current[taskId] = {
      stopFlag: { v: false },
      pauseFlag: { v: false },
      pendingSubPayload: { v: null },
    }

    setTasks((prev) => {
      const next = { ...prev, [taskId]: task }
      tasksRef.current = next
      return next
    })

    message.success(`[${group.name}] 已启动${intervalSec > 0 ? `，每 ${intervalSec}s 执行一次` : ''}`)
    runLoop(taskId).catch(() => {})
    return taskId
  }, [getProjectSnapshot, runLoop, message])

  const pauseTask = useCallback((taskId) => {
    const refs = taskRefsRef.current[taskId]
    if (!refs) return
    refs.pauseFlag.v = true
    updateTask(taskId, { status: 'paused' })
    message.warning(`[${tasksRef.current[taskId]?.groupName || taskId}] 已暂停`)
  }, [updateTask, message])

  const resumeTask = useCallback((taskId) => {
    const refs = taskRefsRef.current[taskId]
    if (!refs) return
    refs.pauseFlag.v = false
    updateTask(taskId, { status: 'running' })
    message.success(`[${tasksRef.current[taskId]?.groupName || taskId}] 已继续`)
  }, [updateTask, message])

  const stopTask = useCallback((taskId) => {
    const refs = taskRefsRef.current[taskId]
    if (!refs) return
    refs.stopFlag.v = true
    updateTask(taskId, { status: 'stopping' })
    message.warning(`[${tasksRef.current[taskId]?.groupName || taskId}] 停止指令已发出，等待本轮结束`)
  }, [updateTask, message])

  const removeTask = useCallback((taskId) => {
    const t = tasksRef.current[taskId]
    if (!t) return
    if (t.status !== 'stopped') { message.warning('任务仍在运行，请先停止'); return }
    delete taskRefsRef.current[taskId]
    setTasks((prev) => {
      const next = { ...prev }
      delete next[taskId]
      tasksRef.current = next
      return next
    })
  }, [message])

  // 💡 新增：清空所有日志
  const clearAllLogs = useCallback(() => {
    setTasks((prev) => {
      const next = {}
      for (const [id, t] of Object.entries(prev)) next[id] = { ...t, logs: [] }
      tasksRef.current = next
      return next
    })
    message.success('已清空所有日志')
  }, [message])

  // 💡 新增：清空单个任务的日志
  const clearTaskLogs = useCallback((taskId) => {
    updateTask(taskId, { logs: [] })
  }, [updateTask])

  const findTaskByGroup = useCallback((projectId, groupId) => {
    return Object.values(tasksRef.current).find((t) => t.projectId === projectId && t.groupId === groupId) || null
  }, [])

  return (
    <Ctx.Provider value={{
      tasks,
      startTask, pauseTask, resumeTask, stopTask, removeTask,
      clearAllLogs, clearTaskLogs,
      findTaskByGroup,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useExecution() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useExecution 必须在 ExecutionProvider 内使用')
  return ctx
}