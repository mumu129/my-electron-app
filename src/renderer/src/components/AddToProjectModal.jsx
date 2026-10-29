import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Select, AutoComplete, App as AntApp } from 'antd';
import { useProjects } from '../store/projectStore';

export default function AddToProjectModal({ open, onClose, entries, onAdded }) {
  const { projects, createGroup, addRequestsToGroup } = useProjects();
  const { message } = AntApp.useApp();
  const [projectId, setProjectId] = useState();
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (open) {
      setProjectId(projects[0]?.id);
      setGroupName('');
    }
  }, [open, projects]);

  const currentProject = projects.find((p) => p.id === projectId);

  const groupOptions = useMemo(
    () => (currentProject?.groups || []).map((g) => ({
      value: g.name,
      label: `${g.name}（${g.requests.length} 条）`,
    })),
    [currentProject]
  );

  const handleOk = () => {
    try {
      if (!projectId) { message.warning('请选择项目'); return; }
      const name = (groupName || '').trim();
      if (!name) { message.warning('请输入请求组名称'); return; }
      const project = projects.find((p) => p.id === projectId);
      if (!project) { message.error('项目不存在'); onClose(); return; }
      let group = project.groups.find((g) => g.name === name);
      if (!group) group = createGroup(projectId, name);
      addRequestsToGroup(projectId, group.id, entries);
      message.success(`已添加 ${entries.length} 条请求到「${project.name} / ${name}」`);
      onAdded?.();
    } catch (e) {
      console.error('[AddToProjectModal] 出错:', e);
      message.error(String(e?.message || e));
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      title={`添加 ${entries.length} 条请求到项目`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnHidden
    >
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 8, color: '#595959' }}>选择项目</div>
        <Select
          style={{ width: '100%' }}
          placeholder="选择项目"
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          notFoundContent="还没有项目，请先到「新建项目」创建"
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, color: '#595959' }}>
          请求组名称（选择已有或输入新名称自动创建）
        </div>
        <AutoComplete
          style={{ width: '100%' }}
          placeholder="选择已有请求组或输入新名称"
          value={groupName}
          onChange={setGroupName}
          options={groupOptions}
          filterOption={(input, option) =>
            (option?.value || '').toLowerCase().includes(input.toLowerCase())
          }
        />
      </div>
    </Modal>
  );
}