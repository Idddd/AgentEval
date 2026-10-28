# V2 真实版与 Mock 页面检查（2026-10-23）

本次对齐展示结构，保持真实版的后台身份、数据库、NeMo/F5 写入和权限检查。

| 页面 | 检查与处理 |
| --- | --- |
| Dashboard | 复用 Mock 的 ProtectionSummary 和 Enforce & Prevent 表格、搜索、Location 筛选、分页及抽屉。增加 Control Unit 筛选和 New Guardrail 入口。 |
| Dashboard 指标 | 未接入的扫描、通过、拦截、转交、告警、耗时等显示 0，并注明未接入；Profiles/Guardrails 数量来自已发布的数据库记录。发布不代表真实流量已生效。 |
| Profile 运行抽屉 | 按已发布 Profile 固定的版本展示 Guardrail 名称，避免显示后来发布的版本或未发布草稿；使用相同的卡片布局。Bypass 分为单条 Guardrail（仅当前 Profile 内的引用）和整个 Profile 两个入口。Monitoring、Preventing、Bypass 的真实接口尚未接入，保持禁用。 |
| Guardrail/Profile 列表 | 补齐状态、部门、Location 筛选和每页 6 条分页。保留真实后台查询和草稿同步状态。 |
| Guardrail 详情 | 复用 Ownership & scope、配置、Profile 引用、版本信息及流程步骤。 |
| Profile 详情 | 统一信息布局，流程步骤包含真实版需要的 Release 环节，不采用 Mock 中“审批即激活”的说明。 |
| 新建/编辑 | 使用共享 LiveForm 和自动 ID；User 仅填写业务需求，不选择 Source。Tech 在实现时选择来源；Profile 来源随所选同源已发布 Guardrail 自动推导。Dashboard 新建入口跳转到同一表单。 |
| Evaluation | 对齐文件选择框；保留真实 JSON 测试集输入及提交。缺少真实结果证据时展示缺失状态，不再生成 Mock benchmark。F5 证据正确标识为 F5。 |
| Sign-off | 复用审批历史折叠面板，依据后台当前审批人及部门筛选；现有审批/拒绝逻辑保留。 |
| Deployment | 复用 Mock 发布队列表格及分页，详情中保留真实 Release to NeMo/F5 操作。 |
| Trace | Mock 此页目前为空。真实版保留数据库操作历史并补齐卡片标题，明确区分操作历史和未接入的流量 Trace（0）。 |

未增加生产流量、运行模式切换或绕过控制接口。所有 0 占位均附带未接入说明，不能用作上线流量验收证据。
