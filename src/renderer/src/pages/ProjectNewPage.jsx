import React, { useState } from 'react';
import { Input, Modal, Button, App as AntApp, Flex, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useProjects } from '../store/projectStore';

const { Text } = Typography;

export default function ProjectNewPage() {
  const { createProject } = useProjects();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openModal = () => { setName(''); setOpen(true); };

  const handleOk = () => {
    setSubmitting(true);
    try {
      const trimmed = (name || '').trim();
      if (!trimmed) { message.warning('请输入项目名称'); return; }
      const p = createProject(trimmed);
      console.log('[ProjectNewPage] 已创建:', p);
      message.success(`项目「${trimmed}」已创建`);
    } catch (e) {
      console.error('[ProjectNewPage] 出错:', e);
      message.error(String(e?.message || e));
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  };

  return (
    <Flex vertical justify="center" align="center" style={{ height: '100%', padding: 24 }}>
      <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openModal}>
        新建项目
      </Button>
      <Text type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
        输入名称即可创建项目，之后在 HAR 页把请求加进项目
      </Text>

      <Modal
        title="新建项目"
        open={open}
        onOk={handleOk}
        onCancel={() => setOpen(false)}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        destroyOnHidden
      >
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, color: '#595959' }}>项目名称</div>
          <Input
            placeholder="请输入项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={handleOk}
            autoFocus
          />
        </div>
      </Modal>
    </Flex>
  );
}