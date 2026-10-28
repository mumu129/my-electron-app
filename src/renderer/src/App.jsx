import React, { useState } from 'react';
import FloatButtons from './components/HAR';
import {
  DesktopOutlined,
  PieChartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Breadcrumb, Layout, Menu, theme } from 'antd';

const { Header, Content, Sider } = Layout;

function getItem(label, key, icon, children) {
  return { key, icon, children, label };
}

const items = [
  getItem('HAR', '1', <PieChartOutlined />),
  getItem('新建项目', '2', <DesktopOutlined />),
  getItem('User项目', 'sub1', <UserOutlined />, [
    getItem('飞剑', '3'),
    getItem('Bill', '4'),
    getItem('Alex', '5'),
  ]),
  getItem('项目设置', '6', <DesktopOutlined />),
];



// ---------- 每个 key 对应的内容组件 ----------

const NewProjectPage = () => <div>新建项目页面内容</div>;
const FeijianPage = () => <div>飞剑页面内容</div>;
const BillPage = () => <div>Bill is a cat.</div>;
const AlexPage = () => <div>Alex 页面内容</div>;
const SettingsPage = () => <div>项目设置页面内容</div>;

const contentMap = {
  '1': <FloatButtons />,
  '2': <NewProjectPage />,
  '3': <FeijianPage />,
  '4': <BillPage />,
  '5': <AlexPage />,
  '6': <SettingsPage />,
};

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('1');

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 点击菜单更新选中 key
  const handleMenuClick = ({ key }) => {
    setSelectedKey(key);
  };



  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
      >
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          defaultOpenKeys={['sub1']}   // 让 User项目 默认展开（可选）
          items={items}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} />
        <Content style={{ margin: '0 16px' }}>
          
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {/* 根据当前选中 key 渲染对应组件 */}
            {contentMap[selectedKey] || <div>请选择左侧菜单</div>}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;