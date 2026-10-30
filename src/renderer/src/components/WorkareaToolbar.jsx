import React, { useState, useEffect } from 'react';
import { Dropdown, Button, App, Modal, InputNumber, Space, Tag } from 'antd';
import { FolderOutlined, DownOutlined, GlobalOutlined, SaveOutlined, FileTextOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';

export default function WorkareaToolbar({ projectName, groupName, groupRequests, onFieldSelectForExport }) {
  const { message } = App.useApp();
  const { projects, updateProjectProxy } = useProjects();
  const [basePath, setBasePath] = useState('');
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [intervalSec, setIntervalSec] = useState(0);

  // 获取绑定路径
  useEffect(() => {
    window.electronAPI?.workarea?.getPath().then(r => { if (r.ok) setBasePath(r.path); });
  }, []);

  const handleBindPath = async () => {
    const r = await window.electronAPI?.workarea?.setPath();
    if (r?.ok) {
      setBasePath(r.path);
      message.success(`已绑定工作区：${r.path}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!basePath) return message.warning('请先绑定工作区路径');
    const folderName = `${projectName}_${groupName}`.replace(/[<>:"/\\|?*]/g, '_');
    const r = await window.electronAPI?.workarea?.mkdir({ folderName });
    if (r?.ok) message.success(`已创建文件夹：${folderName}`);
    else message.error(r?.error || '创建失败');
  };

  const handleExportUserInfo = () => {
    onFieldSelectForExport?.();
  };

  const handleExportGtlId = async () => {
    if (!basePath) return message.warning('请先绑定工作区路径');
    // 寻找包含 gtl_id 的响应
    const targetReq = groupRequests.find(req => (req.response?.content?.text || '').includes('gtl_id'));
    if (!targetReq) return message.warning('当前请求组中没有找到包含 gtl_id 的响应');

    try {
      const text = targetReq.response.content.text;
      const json = JSON.parse(text);
      const gtlId = json.gtl_id || json.data?.gtl_id; // 尝试提取
      if (!gtlId) return message.warning('响应 JSON 中未找到 gtl_id 字段');

      const folderName = `${projectName}_${groupName}`.replace(/[<>:"/\\|?*]/g, '_');
      const r = await window.electronAPI?.workarea?.writeJson({
        folderName,
        fileName: 'gtl_id.json',
        data: { gtl_id: gtlId }
      });
      if (r?.ok) message.success(`已生成 gtl_id.json`);
      else message.error(r?.error);
    } catch {
      message.error('解析响应 JSON 失败，无法生成 gtl_id.json');
    }
  };

  const handleRun = async () => {
    if (!basePath) return message.warning('请先绑定工作区路径');
    const folderName = `${projectName}_${groupName}`.replace(/[<>:"/\\|?*]/g, '_');
    const r = await window.electronAPI?.workarea?.run({ folderName, intervalSec });
    if (r?.ok) {
      message.success(r.msg);
      setRunModalOpen(false);
    } else {
      message.error(r.error);
    }
  };

  const menuItems = [
    { key: 'bind', label: '绑定/切换工作区路径', icon: <GlobalOutlined /> },
    { key: 'folder', label: '新建项目请求组文件夹', icon: <FolderOutlined /> },
    { type: 'divider' },
    { key: 'userInfo', label: '导出选中请求/字段到 userInfo.json', icon: <SaveOutlined /> },
    { key: 'gtlId', label: '根据响应提取并生成 gtl_id.json', icon: <FileTextOutlined /> },
    { type: 'divider' },
    { key: 'run', label: '运行 run.js', icon: <PlayCircleOutlined /> },
  ];

  const onMenuClick = ({ key }) => {
    if (key === 'bind') handleBindPath();
    else if (key === 'folder') handleCreateFolder();
    else if (key === 'userInfo') handleExportUserInfo();
    else if (key === 'gtlId') handleExportGtlId();
    else if (key === 'run') setRunModalOpen(true);
  };

  return (
    <Space>
      {basePath && <Tag color="blue" title={basePath}>{basePath.slice(-20)}</Tag>}
      <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']}>
        <Button size="small" type="primary" icon={<FolderOutlined />}>
          文件操作 <DownOutlined />
        </Button>
      </Dropdown>

      <Modal title="运行 run.js" open={runModalOpen} onOk={handleRun} onCancel={() => setRunModalOpen(false)} okText="开始运行">
        <Space direction="vertical">
          <div>将执行请求组文件夹下的 <code>run.js</code></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>定时运行（秒，0 表示仅一次）：</span>
            <InputNumber min={0} value={intervalSec} onChange={setIntervalSec} />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}