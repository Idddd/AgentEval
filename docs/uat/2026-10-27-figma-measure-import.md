# Figma Measure 导入 V2 Mock

本次将 NMGR Figma 的 Measure 交互要求适配到现有 `/v2-mock` 工作台，复用当前浅色背景、红色操作强调、字体、侧栏、卡片、表格、按钮和可调整宽度的右侧抽屉。

本地预览：`http://127.0.0.1:18086/v2-mock/guardrails?role=user#Profile/measure/`。技术角色可用 `?role=tech#Profile/measure/`，审批角色可用 `?role=approver#Profile/measure/`。三类工作台均增加 Measure；原默认首页保持原状。

## 功能与原型对照

| Figma 画板 | Mock 对应内容 |
| --- | --- |
| CUU `50:599` / CUA `111:816` | 扫描总数与 Pass/Block/Transformed；月度模型用量；Agent 超阈值列表与分页；保留描述、BU、版本、PoC、峰值与处置数量 |
| CUU `111:2160` / CUA `121:2970` / 独立 `158:5951` | Agent 的 Hits Threshold Breach 抽屉；Policy、Guardrail、Decision、Hits 和分页；Close 返回总览 |
| CUU `121:3250` / CUA `135:1221` | Policy 事件抽屉；Time、Prompt、Response、Action；Report False Positive 更新为 False Positive Reported；Close 返回上层告警 |
| TEC `111:270` | 吞吐/QPS、P99/P75/P50 延迟、当日错误、Runners/Quota、VRAM/RAM/GPU/CPU 及原始趋势图；误报列表与分页 |
| TEC `150:7941` | 状态/日期筛选；事件详情、报告人诉求、历史版本只读定义、请求/响应、事件审核边界；关闭保留列表筛选及页码 |
| TEC `150:8518` | Confirm false positive / Not a false positive、必填理由、Cancel、Submit review；取消返回详情；提交仅保存本次审核记录 |
| TEC `150:8779` | 审核完成反馈、结论/理由/审核人/时间、原处置、UTC 审计时间线、保留证据与历史定义、Back to reports、Next report、独立策略调整入口 |

策略调整入口说明后续 evaluation → approval → deployment，并可进入现有 Guardrail Requests。原型没有定义完整的调整申请表，本次未另造业务流程或执行生产策略修改。

## 保留与隔离

- [交互审查结果](../reviews/2026-10-27-figma-nmgr-interaction-review.md)独立存档，其提报表单、领取审核、通知等建议没有作为新增需求实施。
- 原型可见按钮按其已表达的意图连通，不保留 Figma 的断链；不添加新审核分工或生产权限。
- Measure 使用独立浏览器键 `nmgr-v2-mock-measure-v1`。原 Guardrail/Profile 数据、版本、运行模式和真实 `/v2` 的接口不变。
- 审核不会修改存储的事件证据。原型详情/审核与完成画板的不同响应文案作为独立 fixture 字段保留，其不一致已记入审查结果；不静默改写源设计。
- 源画板只提供部分分页样例。后续页复用同文件里的 Agent/Policy 示例补足演示记录，没有连接真实监控流量。
- 五张趋势 SVG 已保存为本地资源，保留原始尺寸；页头与交互控件复用现有组件。运行时不引用临时 Figma URL。

## Tech 监控区样式调整

根据浏览器批注，保留所有 ResourceMetric / MeasureCard 组件、文案、数据和行为，重新排列技术角色的性能与资源区域。Runners 从跨两行的高卡片改为横向摘要，四个资源指标在桌面等高并列、窄屏两列；性能区统一为紧凑卡片。原有趋势 SVG 仅调整背景、描边及填色，根尺寸与曲线路径不变。

本次纯展示变更的验证：26 项定向回归通过，TypeScript 和预览构建通过；1241px 桌面与 390px 窄屏检查通过。新截图为 `.artifacts/measure-evidence/technical-layout-refined.png`。

## 验收记录

### 业务概览配色与导航增强

根据后续浏览器批注，在保持原统计值、模型字段和审核流程的基础上增强业务概览。Pass、Block、Transformed 分别使用绿色、红色和琥珀色；模型摘要使用紫色和青色，并增加清晰的跳转箭头与摘要入口。

- Total Scans 进入现有同角色 Dashboard。
- Block / Transformed 定位 Agent 超阈值列表，按对应命中数降序排列并突出该列；清除聚焦后恢复原始顺序。
- 模型卡片打开月度用量摘要，只展示现有模型/提供方/Queries 和当前控制单元信息；不虚构逐请求用量数据。关闭保留列表页码。
- 新增 4 项导航行为测试，定向回归 30 项通过；完整 control 回归 1,072 项通过、9 项跳过。TypeScript、预览构建、桌面实际导航和 390px 窄屏检查通过。
- 新截图：`.artifacts/measure-evidence/business-overview-refined.png`。

### 初次导入验证

- 定向行为/集成/导航/模式隔离测试 26 项通过。
- TypeScript `--noEmit` 通过。
- Vite 静态预览生产构建与 SPA 预渲染通过。
- 完整 control 测试：1,068 项通过，9 项跳过；184 个文件通过，3 个文件跳过。最初的 SMTP 本机连接被沙箱拒绝；允许本机测试连接后完整运行通过。
- 浏览器验证 CUU 告警 → Policy → 报告误报 → 逐层关闭；技术列表立即显示新增报告。
- 浏览器验证 TEC 查看证据、必填理由报错、审核提交、完成反馈、重新打开时读取保存结果。
- 390px 窄屏验证：无页面级横向溢出；五张趋势图均加载成功且保留原始比例。验收后恢复默认窗口尺寸。
- 独立审查发现的“初次读取失败提示被角色 effect 清除”和“状态筛选后下一条定位错误”均先以测试复现，再修复。
- 截图保存在 `.artifacts/measure-evidence/technical-reviewed.png`。
