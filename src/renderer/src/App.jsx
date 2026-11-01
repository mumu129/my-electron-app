// src/renderer/src/App.jsx
import React, { useEffect, useState } from 'react'
import { App as AntApp, Breadcrumb, Layout, Menu, theme, Spin, Flex, Typography, Badge, Button } from 'antd'
import {
  FileTextOutlined, ProjectOutlined, ExperimentOutlined,
  PlusOutlined, HistoryOutlined, GlobalOutlined, SendOutlined, ControlOutlined,
  SettingOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import ErrorBoundary from './components/ErrorBoundary'
import HarViewer from './components/HarViewer'
import ExecutionLogPanel from './components/ExecutionLogPanel'
import ProjectNewPage from './pages/ProjectNewPage'
import ProjectHistoryPage from './pages/ProjectHistoryPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectSettingsPage from './pages/ProjectSettingsPage'
import GlobalAlgorithmPage from './pages/GlobalAlgorithmPage'
import GlobalEnvPage from './pages/GlobalEnvPage'
import ReplayPage from './pages/ReplayPage'
import SettingsPage from './pages/SettingsPage'
import { ProjectProvider, useProjects } from './store/projectStore'
import { AlgorithmProvider } from './store/algorithmStore'
import { ScriptProvider } from './store/scriptStore'
import { EnvProvider } from './store/envStore'
import { SettingsProvider } from './store/settingsStore'
import { ExecutionProvider, useExecution } from './store/executionStore'
import usePersistentState from './hooks/usePersistentState'
import useIDBState from './hooks/useIDBState'
import { ReplayContext } from './store/replayStore'

const { Header, Content, Footer } = Layout
const { Text } = Typography

const VALID_KEYS = [
  'har', 'replay',
  'project-new', 'project-history', 'project-settings',
  'algorithm-global', 'algorithm-env',
  'settings',
]

const items = [
  { key: 'har', label: 'HAR 查看器', icon: <FileTextOutlined /> },
  { key: 'replay', label: '重发台', icon: <SendOutlined /> },
  {
    key: 'project', label: '项目管理', icon: <ProjectOutlined />, children: [
      { key: 'project-new', label: '新建项目', icon: <PlusOutlined /> },
      { key: 'project-history', label: '历史项目', icon: <HistoryOutlined /> },
      { key: 'project-settings', label: '项目设置', icon: <SettingOutlined /> },
    ]
  },
  {
    key: 'algorithm', label: '算法配置', icon: <ExperimentOutlined />, children: [
      { key: 'algorithm-global', label: '全局算法', icon: <GlobalOutlined /> },
      { key: 'algorithm-env', label: '环境变量', icon: <ControlOutlined /> },
    ]
  },
  { key: 'settings', label: '设置', icon: <SettingOutlined /> },
]

const BREADCRUMBS = {
  har: [{ title: 'HAR 查看器' }],
  replay: [{ title: '重发台' }],
  'project-new': [{ title: '项目管理' }, { title: '新建项目' }],
  'project-history': [{ title: '项目管理' }, { title: '历史项目' }],
  'project-settings': [{ title: '项目管理' }, { title: '项目设置' }],
  'algorithm-global': [{ title: '算法配置' }, { title: '全局算法' }],
  'algorithm-env': [{ title: '算法配置' }, { title: '环境变量' }],
  settings: [{ title: '设置' }],
}

function AppInner() {
  const { projects } = useProjects()
  const { tasks } = useExecution()
  const [rawCurrent, setCurrentRaw] = usePersistentState('ui-last-menu', 'har')
  const current = VALID_KEYS.includes(rawCurrent) ? rawCurrent : 'har'
  const setCurrent = setCurrentRaw
  const [viewingProjectId, setViewingProjectId] = usePersistentState('ui-last-project', null)
  const [harFileName, setHarFileName] = usePersistentState('ui-har-filename', '')
  const [harEntries, setHarEntries, harMeta] = useIDBState('har-entries-v1', [])
  const [replayData, setReplayData] = useState(null)
  const [logPanelOpen, setLogPanelOpen] = useState(false)
  // 💡 项目设置页当前选中的项目（跨页面保持）
  const [settingsProjectId, setSettingsProjectId] = usePersistentState('ui-settings-project', null)

  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken()
  const currentYear = new Date().getFullYear()

  const runningCount = Object.values(tasks).filter(
    (t) => t.status === 'running' || t.status === 'paused' || t.status === 'stopping'
  ).length

  useEffect(() => {
    if (viewingProjectId && !projects.find((p) => p.id === viewingProjectId)) {
      setViewingProjectId(null)
    }
  }, [viewingProjectId, projects, setViewingProjectId])

  // 项目设置页：如果上次选的项目已删除，回退到第一个
  useEffect(() => {
    if (current !== 'project-settings') return
    if (settingsProjectId && !projects.find((p) => p.id === settingsProjectId)) {
      setSettingsProjectId(projects[0]?.id || null)
    } else if (!settingsProjectId && projects.length > 0) {
      setSettingsProjectId(projects[0].id)
    }
  }, [current, settingsProjectId, projects, setSettingsProjectId])

  const handleMenuClick = (e) => {
    setViewingProjectId(null)
    setCurrent(e.key)
  }

  const crumbs = viewingProjectId
    ? [{ title: '项目管理' }, { title: '历史项目' }, { title: '项目详情' }]
    : BREADCRUMBS[current] || [{ title: '工作区' }]

  const renderContent = () => {
    if (viewingProjectId) {
      return (
        <ProjectDetailPage
          projectId={viewingProjectId}
          onBack={() => setViewingProjectId(null)}
          // 💡 从项目详情页跳到项目设置页，并带上当前项目
          onOpenProjectSettings={(pid) => {
            setSettingsProjectId(pid || viewingProjectId)
            setViewingProjectId(null)
            setCurrent('project-settings')
          }}
        />
      )
    }
    switch (current) {
      case 'har':
        if (!harMeta.loaded) return <Flex justify="center" align="center" style={{ height: '100%' }}><Spin tip="加载 HAR…" /></Flex>
        return <HarViewer entries={harEntries} setEntries={setHarEntries} fileName={harFileName} setFileName={setHarFileName} flushHar={harMeta.flush} />
      case 'replay':
        return <ReplayPage key={replayData?._nonce || 'replay'} initialData={replayData} />
      case 'project-new': return <ProjectNewPage />
      case 'project-history': return <ProjectHistoryPage onOpenProject={(id) => setViewingProjectId(id)} />
      case 'project-settings':
        return <ProjectSettingsPage initialProjectId={settingsProjectId} />
      case 'algorithm-global': return <GlobalAlgorithmPage />
      case 'algorithm-env': return <GlobalEnvPage />
      case 'settings': return <SettingsPage />
      default: return null
    }
  }

  const sendToReplay = (data) => {
    setViewingProjectId(null)
    setReplayData({ ...data, _nonce: Date.now() })
    setCurrent('replay')
  }

  const isFullScreen = !!viewingProjectId
  const isHar = current === 'har'
  const isBare = isFullScreen || isHar || current === 'replay'

  return (
    <ReplayContext.Provider value={{ sendToReplay }}>
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        {!isFullScreen && (
          <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 24, height: 56, background: colorBgContainer, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ marginRight: 40, fontWeight: 700, fontSize: 18, color: '#1677ff', letterSpacing: 1 }}>HAR 工作台</div>
            <Menu mode="horizontal" selectedKeys={[current]} onClick={handleMenuClick} items={items} style={{ flex: 1, minWidth: 0, borderBottom: 'none' }} />
            <Badge count={runningCount} size="small" offset={[-2, 2]}>
              <Button
                type={runningCount > 0 ? 'primary' : 'default'}
                icon={<ThunderboltOutlined />}
                onClick={() => setLogPanelOpen(true)}
                ghost={runningCount > 0}
              >
                执行日志
              </Button>
            </Badge>
          </Header>
        )}
        <Content style={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!isFullScreen && !isHar && current !== 'replay' && (
            <Breadcrumb style={{ margin: '12px 16px' }} items={crumbs} />
          )}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            margin: isBare ? 0 : '0 16px 16px 16px',
            background: isBare ? 'transparent' : colorBgContainer,
            borderRadius: isBare ? 0 : borderRadiusLG,
          }}>
            <ErrorBoundary key={`${current}:${viewingProjectId || ''}`}>{renderContent()}</ErrorBoundary>
          </div>
        </Content>
        {!isFullScreen && (
          <Footer style={{ textAlign: 'center', padding: '6px 16px', fontSize: 12, color: '#8c8c8c', background: colorBgContainer }}>
            HAR 工作台 ©{currentYear}
          </Footer>
        )}
      </Layout>
      <ExecutionLogPanel open={logPanelOpen} onClose={() => setLogPanelOpen(false)} />
    </ReplayContext.Provider>
  )
}

export default function App() {
  return (
    <AntApp>
      <ErrorBoundary>
        <SettingsProvider>
          <EnvProvider>
            <AlgorithmProvider>
              <ProjectProvider>
                <ScriptProvider>
                  <ExecutionProvider>
                    <AppInner />
                  </ExecutionProvider>
                </ScriptProvider>
              </ProjectProvider>
            </AlgorithmProvider>
          </EnvProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </AntApp>
  )
}