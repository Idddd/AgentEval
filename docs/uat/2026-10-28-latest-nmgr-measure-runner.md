# 最新 NMGR Measure 与 Runner 更新验收

来源：[NMGR 最新 Runner 节点](https://www.figma.com/design/67c1etjhoxv02cH1nAh5SM/NMGR?node-id=198-1413)，读取 Wireframes 页面及原型连接，与旧文件逐页比较。用户确认目标为当前 V2 Mock，保留现有样式。Figma 和真实 NeMo 服务未修改。

## 已实现的变化

| 页面 | 来源 / 变化 | 本地入口 |
| --- | --- | --- |
| Guardrail Runners | Figma `198:1413` 空白占位；使用用户截图及 NeMo `/settings/runner` 的布局和只读交互 | `/v2/guardrails?role=tech#Profile/runners/` |
| Protection Center | Figma `198:1449` 注明 Runtime Log；补入运行日志筛选、分页和事件详情 | `/v2/guardrails?role=tech#Profile/protection/` |
| Tech Measure | QPS → Protection Center；326/500 → Guardrail Runners；返回时保留报告筛选和页码 | `/v2/guardrails?role=tech#Profile/measure/` |
| CU 误报提交 | Figma `198:1976`：Report summary、证据、Report Reason、Cancel/Submit；保存原因供 Tech 查看 | `/v2/guardrails?role=user#Profile/measure/` → Agent → Policy → Report False Positive |
| CU 最低用量模型 | 最新首页为 Google / Gemini-2.5 Pro，Queries 12；卡片和详情统一 | User、Approver Measure |

Runner 保留原截图的一组示例：GuardRails 0 / Default group、1 Runner serving、吞吐量/并发占用/p95/错误率、实例状态/配置版本/心跳。实例支持展开查看 Runner/NeMo 版本、Compiler、CPU/Memory、并发和配置版本；容量规划支持展开查看 1 serving / 2 desired / 2 recommended。Refresh 与每 10 秒更新仅刷新 Mock 快照时间，隐藏页面暂停，离开后清理定时器。Health、Runner、Version 标签支持键盘切换。容量说明保留“不启动或停止 Runner”的边界。

现有 fleet 概览 326/500 与截图单组 1/2 是各自来源的演示样例；不解释为同一真实集群的同步测量。Protection Center 复用现有模拟事件，只读筛选 Guardrail、样例时间范围、Direction、Outcome；该组样例均为 Input，Output 显示空状态。不会请求 NeMo/F5。

## 报告与兼容性

- 打开/取消报告不写入存储；空白原因禁用 Submit。提交成功才保存原因、报告人/ISS、原事件证据与 Pending review 状态。
- 保存失败保留草稿和原因，显示错误；重复事件不重复创建。返回原策略、原页码；旧报告没有新增字段仍可读取。
- Tech 初始报告详情和后续审查页均展示真实提交原因、报告人单位；审查决定与报告原因分开。
- 浏览器键 `nmgr-v2-mock-measure-v1` 不变。新子页仅 Tech 可访问，侧栏保持 Measure 选中。V3 不开放模拟 Measure。
- 复用现有主题、BrandMark、图表本地 SVG、卡片、按钮及可调整宽度抽屉，无临时 Figma URL 或截图背景实现。

## 设计缺口的处理

新版 CU 表单仍使用复制的 `Review false-positive report` 标题，Submit 没有原型跳转；保留主要文案，补全“必填原因 → 提交 → Tech 队列”的可用流程。示例 ID 改为当前事件的稳定 Mock ID，不重复使用 FPR-2026-00418；日期、证据来自所选事件。新首页最低用量模型采用 Google，而旧叠层仍写 OpenAPI/GPT，按新首页统一。此前数字/比例等审查结果保留在原审查文档中。

## 验证

完整控制台测试 1111 通过、9 跳过（188 文件通过、3 文件跳过）；TypeScript 与 Mock 预览构建通过。新增测试覆盖 Runner 跳转/书签/角色限制、定时器清理、版本/健康/规划/刷新，日志筛选和只读详情，报告取消/必填/失败保留，以及 CU 提交后 Tech 立即查看真实原因。

浏览器验证桌面 Runner、实例/规划展开、日志筛选详情、报告表单必填和取消返回；390 像素窄屏的 Runner 和报告表单无整页横向溢出。截图位于 `.artifacts/measure-evidence/latest-runner-desktop.png`、`latest-runner-expanded.png`、`latest-runner-mobile.png`、`latest-protection-record.png`、`latest-report-form.png`。没有部署或执行生产操作。
