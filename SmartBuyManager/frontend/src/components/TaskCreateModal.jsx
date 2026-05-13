/**
 * 任务创建弹窗组件
 */

import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  message,
  Typography,
  Space,
  Alert,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import useTaskStore from '../stores/taskStore';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Option } = Select;

const TaskCreateModal = () => {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  const { createTask } = useTaskStore();

  // 预设命令模板
  const commandTemplates = {
    kyart_batch: 'ky批量-13800000000-test_token_123456-123456-测试商品001*2*10',
    kyart_quick: 'ky快捷-13800000001-test_token_789012-123456-测试商品002*1*15',
    kyart_list: 'ky列表-13800000002-test_token_345678-123456-测试商品003*3*8',
    hzmiss_batch: 'hz批量-13900000000-test_password_123-123456-测试商品101*5*20',
    hzmiss_quick: 'hz快捷-13900000001-test_password_456-123456-测试商品102*1*25',
  };

  const handleTemplateChange = (template) => {
    if (template && commandTemplates[template]) {
      form.setFieldsValue({
        commandString: commandTemplates[template],
      });
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    
    try {
      await createTask(values);
      message.success('任务创建成功！');
      setOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(`创建失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => setOpen(true)}
        size="large"
      >
        创建任务
      </Button>

      <Modal
        title="创建新任务"
        open={open}
        onCancel={handleCancel}
        width={700}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={loading}
            onClick={() => form.submit()}
          >
            创建任务
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Alert
            message="提示"
            description="当前使用测试数据，不会执行真实的抢购操作。支持KyArt和HzMiss平台的批量、快捷、列表等模式。"
            type="info"
            showIcon
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{ priority: 1 }}
          >
            <Form.Item
              label="命令模板"
              help="选择预设模板快速填充命令字符串"
            >
              <Select
                placeholder="选择命令模板（可选）"
                allowClear
                onChange={handleTemplateChange}
              >
                <Option value="kyart_batch">
                  <Text strong>KyArt批量</Text> - ky批量-账号-token-支付密码-商品*数量*价格
                </Option>
                <Option value="kyart_quick">
                  <Text strong>KyArt快捷</Text> - ky快捷-账号-token-支付密码-商品*数量*价格
                </Option>
                <Option value="kyart_list">
                  <Text strong>KyArt列表</Text> - ky列表-账号-token-支付密码-商品*数量*价格
                </Option>
                <Option value="hzmiss_batch">
                  <Text strong>HzMiss批量</Text> - hz批量-账号-密码-支付密码-商品*数量*价格
                </Option>
                <Option value="hzmiss_quick">
                  <Text strong>HzMiss快捷</Text> - hz快捷-账号-密码-支付密码-商品*数量*价格
                </Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="commandString"
              label="命令字符串"
              rules={[
                { required: true, message: '请输入命令字符串' },
                { min: 10, message: '命令字符串至少10个字符' },
              ]}
              help="完整的抢购命令，格式：平台模式-账号-认证信息-支付密码-商品信息"
            >
              <TextArea
                rows={3}
                placeholder="例如: ky批量-13800000000-test_token_123456-123456-测试商品001*2*10"
                showCount
              />
            </Form.Item>

            <Form.Item
              name="description"
              label="任务描述"
              help="可选，便于识别任务用途"
            >
              <Input
                placeholder="例如: 测试KyArt批量抢购功能"
                maxLength={100}
                showCount
              />
            </Form.Item>

            <Form.Item
              name="priority"
              label="任务优先级"
              help="数字越大优先级越高，相同优先级按创建时间排序"
            >
              <InputNumber
                min={1}
                max={10}
                style={{ width: '100%' }}
                placeholder="1-10"
              />
            </Form.Item>
          </Form>

          <div style={{ padding: '16px', background: '#f5f5f5', borderRadius: '6px' }}>
            <Title level={5} style={{ margin: 0, marginBottom: '8px' }}>
              命令格式说明：
            </Title>
            <Space direction="vertical" size="small">
              <Text code>平台模式-账号-认证信息-支付密码-商品信息</Text>
              <Text type="secondary">• 平台：ky(KyArt) | hz(HzMiss)</Text>
              <Text type="secondary">• 模式：批量 | 快捷 | 列表</Text>
              <Text type="secondary">• 认证：token格式 [xxx] 或直接密码</Text>
              <Text type="secondary">• 商品：商品ID*数量*最高价格</Text>
            </Space>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default TaskCreateModal;