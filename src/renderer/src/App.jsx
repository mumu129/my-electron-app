import React, { useEffect, useState, createContext, useContext } from 'react';
import { App as AntApp, Breadcrumb, Layout, Menu, theme, Spin, Flex } from 'antd';
import {
  FileTextOutlined, ProjectOutlined, ExperimentOutlined,
  PlusOutlined, HistoryOutlined, SettingOutlined, GlobalOutlined, SendOutlined,
} from '@ant-design/icons';
import ErrorBoundary from './components/ErrorBoundary';
import HarViewer from './components/HarViewer';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectSettingsPage from './pages/ProjectSettingsPage';
import GlobalAlgorithmPage from './pages/GlobalAlgorithmPage';
import ReplayPage from './pages/ReplayPage';
import { ProjectProvider, useProjects } from './store/projectStore';
import { AlgorithmProvider } from './store/algorithmStore';
import { ScriptProvider } from './store/scriptStore';
import usePersistentState from './hooks/usePersistentState';
import useIDBState from './hooks/useIDBState';

const { Header, Content, Footer } = Layout;

// 新建 Context 用于发送到重发台
export const ReplayContext = createContext(null);
export const useReplay = () => useContext(ReplayContext);

const items = [
  { key: 'har', label: 'HAR', icon: <FileTextOutlined /> },
  { key: 'replay', label: '重发台', icon: <SendOutlined /> },
  {
    key: 'project', label: '项目', icon: <ProjectOutlined />,
    children: [{
      type: 'group', label: '项目管理',
      children: [
        { key: 'project-new', label: '新建项目', icon: <PlusOutlined /> },
        { key: 'project-history', label: '历史项目', icon: <HistoryOutlined /> },
        { key: 'project-settings', label: '项目设置', icon: <SettingOutlined /> },
      ],
    }],
  },
  {
    key: 'algorithm', label: '算法', icon: <ExperimentOutlined />,
    children: [{
      type: 'group', label: '算法配置',
      children: [
        { key: 'algorithm-global', label: '全局算法', icon: <GlobalOutlined /> },
      ],
    }],
  },
];

const BREADCRUMBS = {
  har: [{ title: 'HAR' }],
  replay: [{ title: '重发台' }],
  'project-new': [{ title: '项目' }, { title: '新建项目' }],
  'project-history': [{ title: '项目' }, { title: '历史项目' }],
  'project-settings': [{ title: '项目' }, { title: '项目设置' }],
  'algorithm-global': [{ title: '算法' }, { title: '全局算法' }],
};

function AppInner() {
  const { projects } = useProjects();
  const [current, setCurrent] = usePersistentState('ui-last-menu', 'har');
  const [viewingProjectId, setViewingProjectId] = usePersistentState('ui-last-project', null);
  const [harFileName, setHarFileName] = usePersistentState('ui-har-filename', '');
  const [harEntries, setHarEntries, harMeta] = useIDBState('har-entries-v1', []);

  // 重发台的数据源
  const [replayData, setReplayData] = useState(null);

  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const currentYear = new Date().getFullYear();
  const isHar = current === 'har';

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
    ? [{ title: '项目' }, { title: '历史项目' }, { title: '项目详情' }]
    : BREADCRUMBS[current] || [{ title: '工作区' }];

  const renderContent = () => {
    if (viewingProjectId) {
      return <ProjectDetailPage projectId={viewingProjectId} onBack={() => setViewingProjectId(null)} />;
    }
    switch (current) {
      case 'har':
        if (!harMeta.loaded) return <Flex justify="center" align="center" style={{ height: '100%' }}><Spin tip="加载 HAR…" /></Flex>;
        return (
          <HarViewer entries={harEntries} setEntries={setHarEntries} fileName={harFileName} setFileName={setHarFileName} flushHar={harMeta.flush} />
        );
      case 'replay': return <ReplayPage initialData={replayData} />;
      case 'project-new': return <ProjectNewPage />;
      case 'project-history': return <ProjectHistoryPage onOpenProject={(id) => setViewingProjectId(id)} />;
      case 'project-settings': return <ProjectSettingsPage />;
      case 'algorithm-global': return <GlobalAlgorithmPage />;
      default: return null;
    }
  };

  // 提供给子组件跳转到重发台的方法
  const sendToReplay = (data) => {
    setReplayData(data);
    setCurrent('replay');
  };

  return (
    <ReplayContext.Provider value={{ sendToReplay }}>
      <Layout style={{ height: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', paddingInline: 16, height: 56, background: colorBgContainer, borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ marginRight: 24, fontWeight: 600, fontSize: 16 }}>HAR 工作台</div>
          <Menu mode="horizontal" selectedKeys={[current]} onClick={handleMenuClick} items={items} style={{ flex: 1, minWidth: 0, borderBottom: 'none' }} />
        </Header>

        <Content style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {!isHar && current !== 'replay' && <Breadcrumb style={{ margin: '12px 16px' }} items={crumbs} />}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            margin: isHar || current === 'replay' ? 0 : '0 16px',
            background: isHar || current === 'replay' ? 'transparent' : colorBgContainer,
            borderRadius: isHar || current === 'replay' ? 0 : borderRadiusLG,
          }}>
            <ErrorBoundary>{renderContent()}</ErrorBoundary>
          </div>
        </Content>
        
        <Footer style={{ textAlign: 'center', padding: '6px 16px', fontSize: 12, color: '#8c8c8c' }}>HAR 工作台 ©{currentYear}</Footer>
      </Layout>
    </ReplayContext.Provider>
  );
}

export default function App() {
  return (
    <AntApp>
      <AlgorithmProvider><ProjectProvider><ScriptProvider><AppInner /></ScriptProvider></ProjectProvider></AlgorithmProvider>
    </AntApp>
  );
}