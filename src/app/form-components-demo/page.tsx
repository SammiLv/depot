"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  confirm,
  DatePicker,
  Drawer,
  DropdownMenu,
  Empty,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  InputNumber,
  message,
  Modal,
  notification,
  Pagination,
  Popconfirm,
  Popover,
  Progress,
  Radio,
  Rate,
  Result,
  Select,
  Spin,
  Steps,
  StepsStep,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
} from "@rjmart/ui";

// Entry 组件库全量走查页（@rjmart/ui 0.16.1，设计稿 MasterGo page 1107:11796）。
// 路径 /form-components-demo，仅开发环境可访问。

const CITY_OPTIONS = [
  { label: "杭州", value: "hangzhou" },
  { label: "上海", value: "shanghai" },
  { label: "北京", value: "beijing" },
  { label: "深圳", value: "shenzhen" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function FormComponentsDemoPage() {
  // 组件走查页仅开发环境开放
  if (process.env.NODE_ENV === "production") notFound();
  const [inputValue, setInputValue] = useState("");
  const [selectValue, setSelectValue] = useState<string | null>(null);
  const [radioValue, setRadioValue] = useState("a");
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [numberValue, setNumberValue] = useState<number | null>(3.5);
  const [textareaValue, setTextareaValue] = useState("");
  const [rateValue, setRateValue] = useState(3);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("1");

  return (
    <div className="min-h-screen bg-[#F5F7F9] px-8 py-10 text-[#181818]">
      <h1 className="text-2xl font-semibold">@rjmart/ui 组件库全量走查</h1>
      <p className="mt-2 text-sm text-[#777777]">
        公司组件库（Nexus 私服 @rjmart scope）全组件演示，对照 MasterGo「Entry 输入 / Formitems」设计稿（page 1107:11796）。
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8">
        {/* 表单 */}
        <Section title="表单 Form">
          <Field>
            <FieldLabel className="w-[92px]">文本输入</FieldLabel>
            <FieldContent>
              <Input placeholder="请输入内容" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">密码框</FieldLabel>
            <FieldContent>
              <Input type="password" placeholder="请输入密码" />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">选择器</FieldLabel>
            <FieldContent>
              <Select options={CITY_OPTIONS} value={selectValue} onChange={(v) => setSelectValue(v as string | null)} placeholder="请选择城市" />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">可搜索多选</FieldLabel>
            <FieldContent>
              <Select options={CITY_OPTIONS} multiple allowSearch placeholder="可搜索、可多选" />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">数字输入</FieldLabel>
            <FieldContent>
              <InputNumber value={numberValue} onChange={(v) => setNumberValue(v as number | null)} min={0} step={0.5} />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">日期选择</FieldLabel>
            <FieldContent>
              <DatePicker placeholder="请选择日期" />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">多行文本</FieldLabel>
            <FieldContent>
              <Textarea rows={3} placeholder="请输入描述" value={textareaValue} onChange={(e) => setTextareaValue(e.target.value)} />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">单选组</FieldLabel>
            <FieldContent>
              <Radio.Group
                value={radioValue}
                onChange={(v) => setRadioValue(v as string)}
                options={[
                  { label: "选项一", value: "a" },
                  { label: "选项二", value: "b" },
                  { label: "选项三", value: "c" },
                ]}
              />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">多选框</FieldLabel>
            <FieldContent>
              <Checkbox checked={checked} onChange={(v) => setChecked(Boolean(v))}>同意协议</Checkbox>
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">开关</FieldLabel>
            <FieldContent>
              <Switch checked={switchOn} onChange={setSwitchOn} />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">错误态</FieldLabel>
            <FieldContent>
              <FieldError>这是一段错误提示文案</FieldError>
              <Input status="error" defaultValue="格式不正确" />
            </FieldContent>
          </Field>
          <Field className="mt-5">
            <FieldLabel className="w-[92px]">禁用态</FieldLabel>
            <FieldContent>
              <Input disabled defaultValue="不可编辑" />
            </FieldContent>
          </Field>
        </Section>

        {/* 按钮与反馈 */}
        <div className="flex flex-col gap-8">
          <Section title="按钮 Button">
            <div className="flex flex-wrap items-center gap-3">
              <Button color="primary">主要按钮</Button>
              <Button>次要按钮</Button>
              <Button variant="outlined">线框按钮</Button>
              <Button variant="text">文字按钮</Button>
              <Button color="danger">危险按钮</Button>
              <Button loading>加载中</Button>
              <Button disabled>禁用</Button>
            </div>
          </Section>

          <Section title="反馈 Feedback">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => message.success("操作成功")}>message 成功</Button>
                <Button onClick={() => message.error("操作失败")}>message 错误</Button>
                <Button onClick={() => notification.info({ title: "通知", description: "你有一条新通知" })}>notification</Button>
                <Button
                  onClick={() => {
                    void confirm({ title: "确认删除？", description: "删除后不可恢复" }).then((ok) => {
                      if (ok) message.success("已删除");
                    });
                  }}
                >
                  confirm 确认框
                </Button>
                <Popconfirm description="确认执行该操作吗？" onConfirm={() => { message.success("已确认"); }}>
                  <Button>Popconfirm</Button>
                </Popconfirm>
                <Tooltip content="这是一段提示文字">
                  <Button>Tooltip</Button>
                </Tooltip>
              </div>
              <Alert type="info" title="提示" description="这是一条信息提示，用于向用户展示需要关注的内容。" />
              <div className="flex items-center gap-6">
                <Progress percent={60} className="w-40" />
                <Spin />
                <Steps current={1}>
                  <StepsStep title="填写信息" />
                  <StepsStep title="确认提交" />
                  <StepsStep title="完成" />
                </Steps>
              </div>
            </div>
          </Section>

          <Section title="数据展示 Data">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Tag>默认标签</Tag>
                <Tag color="info">信息</Tag>
                <Tag color="success">成功</Tag>
                <Tag color="error">错误</Tag>
                <Badge count={5}><Button>收件箱</Button></Badge>
                <span>评分：<Rate value={rateValue} onChange={setRateValue} /></span>
              </div>
              <Table
                rowKey="key"
                columns={[
                  { key: "name", title: "名称" },
                  { key: "owner", title: "负责人" },
                  { key: "status", title: "状态" },
                ]}
                dataSource={[
                  { key: "1", name: "文献头条", owner: "张永翔", status: "已上线" },
                  { key: "2", name: "商家移动端店铺", owner: "毛博雅", status: "已完成" },
                ]}
              />
            </div>
          </Section>
        </div>

        {/* 导航与浮层 */}
        <div className="flex flex-col gap-8">
          <Section title="导航 Navigation">
            <div className="flex flex-col gap-5">
              <Tabs
                value={tab}
                onChange={(k) => setTab(k)}
                items={[
                  { key: "1", label: "标签一", children: <div className="py-3 text-sm text-[#777777]">标签一内容区</div> },
                  { key: "2", label: "标签二", children: <div className="py-3 text-sm text-[#777777]">标签二内容区</div> },
                ]}
              />
              <Breadcrumb
                items={[
                  { title: "首页" },
                  { title: "产品管理" },
                  { title: "项目列表" },
                ]}
              />
              <Pagination current={page} total={86} pageSize={10} onChange={(p) => setPage(p)} />
            </div>
          </Section>

          <Section title="浮层 Overlay">
            <div className="flex flex-wrap items-center gap-3">
              <Button color="primary" onClick={() => setModalOpen(true)}>打开 Modal</Button>
              <Button onClick={() => setDrawerOpen(true)}>打开 Drawer</Button>
              <Popover content={<div className="p-2 text-sm">浮层内容</div>} title="标题">
                <Button>Popover</Button>
              </Popover>
              <DropdownMenu
                items={[
                  { key: "1", label: "选项一", onSelect: () => message.info("点击了选项一") },
                  { key: "2", label: "选项二", onSelect: () => message.info("点击了选项二") },
                  { type: "separator" },
                  { key: "3", label: "危险操作", variant: "destructive", onSelect: () => message.info("点击了危险操作") },
                ]}
              >
                <Button>DropdownMenu</Button>
              </DropdownMenu>
            </div>
            <div className="mt-4">
              <Empty description="暂无数据" />
            </div>
            <div className="mt-4">
              <Result status="success" title="提交成功" description="你的操作已完成。" />
            </div>
          </Section>
        </div>

        {/* 右侧补充：状态矩阵保留 */}
        <Section title="输入框状态矩阵">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Field>
              <FieldLabel className="w-[64px]">正常</FieldLabel>
              <FieldContent><Input placeholder="请输入内容" /></FieldContent>
            </Field>
            <Field>
              <FieldLabel className="w-[64px]">聚焦</FieldLabel>
              <FieldContent><Input placeholder="移入查看边框" /></FieldContent>
            </Field>
            <Field>
              <FieldLabel className="w-[64px]">警告</FieldLabel>
              <FieldContent><Input status="warning" defaultValue="警告内容" /></FieldContent>
            </Field>
            <Field>
              <FieldLabel className="w-[64px]">错误</FieldLabel>
              <FieldContent><Input status="error" defaultValue="格式不正确" /></FieldContent>
            </Field>
            <Field>
              <FieldLabel className="w-[64px]">清除</FieldLabel>
              <FieldContent><Input defaultValue="可清除内容" /></FieldContent>
            </Field>
            <Field>
              <FieldLabel className="w-[64px]">前后缀</FieldLabel>
              <FieldContent><Input addonBefore="￥" addonAfter="元" placeholder="金额" /></FieldContent>
            </Field>
          </div>
        </Section>
      </div>

      <Modal open={modalOpen} onOpenChange={(open) => setModalOpen(open)} title="示例弹窗" footer={
        <>
          <Button onClick={() => setModalOpen(false)}>取消</Button>
          <Button color="primary" onClick={() => setModalOpen(false)}>确定</Button>
        </>
      }>
        <p className="text-sm text-[#777777]">Modal 内容区。</p>
      </Modal>

      <Drawer open={drawerOpen} onOpenChange={(open) => setDrawerOpen(open)} title="示例抽屉">
        <p className="text-sm text-[#777777]">Drawer 内容区。</p>
      </Drawer>
    </div>
  );
}
