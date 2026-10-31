// src/renderer/src/App.jsx
import React, { useEffect, useState } from 'react';
import { App as AntApp, Breadcrumb, Layout, Menu, theme, Spin, Flex, Typography } from 'antd';
import {
  FileTextOutlined, ProjectOutlined, ExperimentOutlined,
  PlusOutlined, HistoryOutlined, GlobalOutlined, SendOutlined, ControlOutlined,
} from '@ant-design/icons';
import ErrorBoundary from './components/ErrorBoundary';
import HarViewer from './components/HarViewer';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import GlobalAlgorithmPage from './pages/GlobalAlgorithmPage';
import GlobalEnvPage from './pages/GlobalEnvPage';
import ReplayPage from './pages/ReplayPage';
import { ProjectProvider, useProjects } from './store/projectStore';
import { AlgorithmProvider } from './store/algorithmStore';
import { ScriptProvider } from './store/scriptStore';
import { EnvProvider } from './store/envStore';
import usePersistentState from './hooks/usePersistentState';
import useIDBState from './hooks/useIDBState';
import { ReplayContext } from './store/replayStore';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

const items = [
  { key: 'har', label: 'HAR 查看器', icon: <FileTextOutlined /> },
  { key: 'replay', label: '重发台', icon: <SendOutlined /> },
  {
    key: 'project', label: '项目管理', icon: <ProjectOutlined />,
    children: [
      { key: 'project-new', label: '新建项目', icon: <PlusOutlined /> },
      { key: 'project-history', label: '历史项目', icon: <HistoryOutlined /> },
    ],
  },
  {
    key: 'algorithm', label: '算法配置', icon: <ExperimentOutlined />,
    children: [
      { key: 'algorithm-global', label: '全局算法', icon: <GlobalOutlined /> },
      { key: 'algorithm-env', label: '环境变量', icon: <ControlOutlined /> },
    ],
  },
];

const BREADCRUMBS = {
  har: [{ title: 'HAR 查看器' }],
  replay: [{ title: '重发台' }],
  'project-new': [{ title: '项目管理' }, { title: '新建项目' }],
  'project-history': [{ title: '项目管理' }, { title: '历史项目' }],
  'algorithm-global': [{ title: '算法配置' }, { title: '全局算法' }],
  'algorithm-env': [{ title: '算法配置' }, { title: '环境变量' }],
};

function AppInner() {
  const { projects } = useProjects();
  const [current, setCurrent] = usePersistentState('ui-last-menu', 'har');
  const [viewingProjectId, setViewingProjectId] = usePersistentState('ui-last-project', null);
  const [harFileName, setHarFileName] = usePersistentState('ui-har-filename', '');
  const [harEntries, setHarEntries, harMeta] = useIDBState('har-entries-v1', []);
  const [replayData, setReplayData] = useState(null);

  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (viewingProjectId && !projects.find((p) => p.id === viewingProjectId)) {
      setViewingProjectId(null);
    }
  }, [viewingProjectId, projects, setViewingProjectId]);

  const handleMenuClick = (e) => {
    setViewingProjectId(null);
    setCurrent(e.key);
  };

  const crumbs = viewingProjectId
    ? [{ title: '项目管理' }, { title: '历史项目' }, { title: '项目详情' }]
    : BREADCRUMBS[current] || [{ title: '工作区' }];

  const renderContent = () => {
    if (viewingProjectId) {
      return <ProjectDetailPage projectId={viewingProjectId} onBack={() => setViewingProjectId(null)} />;
    }
    switch (current) {
      case 'har':
        if (!harMeta.loaded) return <Flex justify="center" align="center" style={{ height: '100%' }}><Spin tip="加载 HAR…" /></Flex>;
        return <HarViewer entries={harEntries} setEntries={setHarEntries} fileName={harFileName} setFileName={setHarFileName} flushHar={harMeta.flush} />;
      case 'replay': return <ReplayPage key={replayData?._id || 'replay'} initialData={replayData} />;
      case 'project-new': return <ProjectNewPage />;
      case 'project-history': return <ProjectHistoryPage onOpenProject={(id) => setViewingProjectId(id)} />;
      case 'algorithm-global': return <GlobalAlgorithmPage />;
      case 'algorithm-env': return <GlobalEnvPage />;
      default: return null;
    }
  };

  const sendToReplay = (data) => {
    setReplayData(data);
    setCurrent('replay');
  };

  // 💡 判断是否进入全屏沉浸模式（即查看项目详情时）
  const isFullScreen = !!viewingProjectId;
  const isHar = current === 'har';

  return (
    <ReplayContext.Provider value={{ sendToReplay }}>
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        {/* 仅在非全屏模式下显示顶栏 */}
        {!isFullScreen && (
          <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 24, height: 56, background: colorBgContainer, borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ marginRight: 40, fontWeight: 700, fontSize: 18, color: '#1677ff', letterSpacing: 1 }}>
              HAR 工作台
            </div>
            <Menu mode="horizontal" selectedKeys={[current]} onClick={handleMenuClick} items={items} style={{ flex: 1, minWidth: 0, borderBottom: 'none' }} />
          </Header>
        )}

        <Content style={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* 仅在非全屏模式下显示面包屑 */}
          {!isFullScreen && !isHar && current !== 'replay' && (
            <Breadcrumb style={{ margin: '12px 16px' }} items={crumbs} />
          )}
          
          {/* 💡 核心：去除所有 margin 和 padding，让它撑满 */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            margin: isFullScreen || isHar || current === 'replay' ? 0 : '0 16px 16px 16px',
            background: isFullScreen || isHar || current === 'replay' ? 'transparent' : colorBgContainer,
            borderRadius: isFullScreen || isHar || current === 'replay' ? 0 : borderRadiusLG,
          }}>
            <ErrorBoundary>{renderContent()}</ErrorBoundary>
          </div>
        </Content>
        
        {/* 仅在非全屏模式下显示页脚 */}
        {!isFullScreen && (
          <Footer style={{ textAlign: 'center', padding: '6px 16px', fontSize: 12, color: '#8c8c8c', background: colorBgContainer }}>
            HAR 工作台 ©{currentYear}
          </Footer>
        )}
      </Layout>
    </ReplayContext.Provider>
  );
}

export default function App() {
  return (
    <AntApp>
      <EnvProvider>
        <AlgorithmProvider><ProjectProvider><ScriptProvider><AppInner /></ScriptProvider></ProjectProvider></AlgorithmProvider>
      </EnvProvider>
    </AntApp>
  );
}