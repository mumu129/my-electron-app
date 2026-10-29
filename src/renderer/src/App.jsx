import React, { useEffect, useState } from 'react';
import { App as AntApp, Breadcrumb, Layout, Menu, theme, Spin, Flex } from 'antd';
import {
  FileTextOutlined, ProjectOutlined, ExperimentOutlined,
  PlusOutlined, HistoryOutlined, SettingOutlined, GlobalOutlined,
} from '@ant-design/icons';
import ErrorBoundary from './components/ErrorBoundary';
import HarViewer from './components/HarViewer';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectSettingsPage from './pages/ProjectSettingsPage';
import GlobalAlgorithmPage from './pages/GlobalAlgorithmPage';
import { ProjectProvider, useProjects } from './store/projectStore';
import { AlgorithmProvider } from './store/algorithmStore';
import { ScriptProvider } from './store/scriptStore';
import usePersistentState from './hooks/usePersistentState';
import useIDBState from './hooks/useIDBState';

const { Header, Content, Footer } = Layout;

const items = [
  { key: 'har', label: 'HAR', icon: <FileTextOutlined /> },
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
  'project-new': [{ title: '项目' }, { title: '新建项目' }],
  'project-history': [{ title: '项目' }, { title: '历史项目' }],
  'project-settings': [{ title: '项目' }, { title: '项目设置' }],
  'algorithm-global': [{ title: '算法' }, { title: '全局算法' }],
};

const LABELS = {
  'project-settings': '项目设置',
  'algorithm-global': '全局算法',
};

function Placeholder({ title }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', color: '#8c8c8c',
    }}>
      <div style={{ fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>功能开发中</div>
    </div>
  );
}

function AppInner() {
  const { projects } = useProjects();
  const [current, setCurrent] = usePersistentState('ui-last-menu', 'har');
  const [viewingProjectId, setViewingProjectId] = usePersistentState('ui-last-project', null);
  const [harFileName, setHarFileName] = usePersistentState('ui-har-filename', '');
  const [harEntries, setHarEntries, harMeta] = useIDBState('har-entries-v1', []);

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

  const renderContent = () => {
    if (viewingProjectId) {
      return (
        <ProjectDetailPage
          projectId={viewingProjectId}
          onBack={() => setViewingProjectId(null)}
        />
      );
    }
    switch (current) {
      case 'har':
        if (!harMeta.loaded) {
          return (
            <Flex justify="center" align="center" style={{ height: '100%' }}>
              <Spin tip="加载 HAR 数据…" />
            </Flex>
          );
        }
        return (
          <HarViewer
            entries={harEntries}
            setEntries={setHarEntries}
            fileName={harFileName}
            setFileName={setHarFileName}
            flushHar={harMeta.flush}
          />
        );
      case 'project-new': return <ProjectNewPage />;
      case 'project-history':
        return <ProjectHistoryPage onOpenProject={(id) => setViewingProjectId(id)} />;
      case 'project-settings': return <ProjectSettingsPage />;
      case 'algorithm-global': return <GlobalAlgorithmPage />;
      default: return <Placeholder title={LABELS[current] || current} />;
    }
  };

  const crumbs = viewingProjectId
    ? [{ title: '项目' }, { title: '历史项目' }, { title: '项目详情' }]
    : BREADCRUMBS[current] || [{ title: LABELS[current] || current }];

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{
        display: 'flex', alignItems: 'center', paddingInline: 16,
        height: 56, lineHeight: '56px', background: colorBgContainer,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <div style={{ marginRight: 24, fontWeight: 600, fontSize: 16 }}>HAR 工作台</div>
        <Menu mode="horizontal" selectedKeys={[current]} onClick={handleMenuClick}
          items={items} style={{ flex: 1, minWidth: 0, borderBottom: 'none' }} />
      </Header>

      <Content style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {!isHar && <Breadcrumb style={{ margin: '12px 16px' }} items={crumbs} />}
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          margin: isHar ? 0 : '0 16px',
          background: isHar ? 'transparent' : colorBgContainer,
          borderRadius: isHar ? 0 : borderRadiusLG,
        }}>
          <ErrorBoundary>{renderContent()}</ErrorBoundary>
        </div>
        {!isHar && <div style={{ height: 16 }} />}
      </Content>

      <Footer style={{ textAlign: 'center', padding: '6px 16px', fontSize: 12, color: '#8c8c8c' }}>
        HAR 工作台 ©{currentYear}
      </Footer>
    </Layout>
  );
}

export default function App() {
  return (
    <AntApp>
      <AlgorithmProvider>
        <ProjectProvider>
          <ScriptProvider>
            <AppInner />
          </ScriptProvider>
        </ProjectProvider>
      </AlgorithmProvider>
    </AntApp>
  );
}