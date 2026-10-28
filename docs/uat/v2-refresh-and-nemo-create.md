# V2 NeMo 草稿同步与双入口

## 已实现的保存流程

真实版 `/v3/guardrails` 新建 Guardrail 的 Save 仅在 PostgreSQL/MariaDB 保存业务需求及自动 ID，标记等待 Tech 选择 Source，不提前调用 NeMo/F5。Tech 在 Implementation 选择已配置的来源并保存后，NeMo 才创建未发布 Policy 草稿并 GET 回读确认；F5 仍在评测阶段创建 Scanner。User 不能在 API 中提交 provider。Profile 来源由同源已发布 Guardrail 自动推导。列表、详情展示独立的同步状态与确认时间，不把草稿创建当作审批或发布成功。

UI Guardrail 对应 NeMo Policy；UI Profile 对应 NeMo Guardrail。

### Guardrail → Policy

1. 每个工作区、记录 ID、业务修订生成稳定 Policy ID。
2. Tech 首次选择 NeMo 并保存有效实现时，使用 `PUT /policies/{id}/definition`，携带 `expectedRevision: 0` 和 `create: true`，写入配置后的未发布草稿。
3. 来源选定后固定，旧记录保留原绑定；同一业务修订的后续实现更新同一 Policy，评测再写入测试集，均携带已确认的远端 revision。GET 核对 ID、内容和 revision 后确认同步。
4. 同一业务修订的编辑、实现、评测保持资源身份；新业务修订使用独立资源，保留上一已发布绑定和 Profile 的固定引用。

写响应丢失时，恢复先 GET 稳定 ID，比对内容及预期修订；不会直接重放 create:true 或覆盖外部修改。相同请求 ID 只执行一次，复用请求 ID 但修改内容会被拒绝。

已核对 NeMo 提交 `9a1971b81b38e2848641289cf7ce51aab544be28`。其 schema/编译器允许空 rules/tests 草稿，发布仍要求有效规则与评测证据。最终兼容性需以目标内网服务版本为准。

### Profile → Guardrail

选取同来源已发布策略后，Save 构造 `draftConfig.policyBindings` 并 `POST /guardrails`，保存 id/draftRevision；后续编辑使用带 `expectedDraftRevision` 的 PATCH。

提交审批固定策略版本并同步草稿，审批不会激活资源。发布复用创建时的 ID，先核对已审批草稿，再执行草稿测试、冻结版本、版本测试和 release。

Controller POST 由服务端生成 ID。超时、进程中断或成功响应不符合契约时保留“结果待核对”，不自动重复 POST。原作者或 Tech 在 NeMo 查到精确资源 ID 后，在 V2 填写 Remote resource ID 并 Reconcile；系统核对资源内容后绑定，不按相似名称猜测。若要在此场景完全自动恢复，NeMo 需提供原生幂等创建接口。

## 状态与恢复

- 同步状态独立于 DRAFT、审批、DEPLOYED；同步未完成时阻止后续评测/审批，避免使用未确认配置。明确的写入校验拒绝（400/422）回到 DRAFT，允许按原权限修正需求或实现后重试；冲突和结果未知继续禁止编辑，须先核对。
- 远端写前持久化 inflight 标记，覆盖“远端成功、本地回写前崩溃”的情况。
- 草稿同步允许原作者或 Tech 恢复；评测与发布仍由发起 Tech 继续。所有账号/部门检查先于网络写操作。
- NeMo 账号密码在后台配置，会话只保留在服务进程内存中，过期后自动重新登录。页面不接收或保存 NeMo 凭据。本地固定身份模式在 Tech 保存 NeMo 实现或保存已确定来源的 Profile 时尝试同步，页面在线时续跑待执行任务；不保证关页面后继续执行未完成步骤。
- 同步失败不自动删除另一侧；远端 revision 冲突需先核对并解决，不覆盖外部修改。
- F5 保留已有评测/发布流程。新 Guardrail 的 User Save 不同步后台；NeMo 的实现保存同步仍受权限与修订检查约束。

## 真实与 Mock 两个入口

- `/v3/guardrails`：真实版，使用 PostgreSQL/MariaDB 及配置的 NeMo/F5。配置缺失显示错误，不自动退回演示数据。
- `/v2/guardrails`：Mock 版，带明确模式提示，可切换演示角色。仅使用独立浏览器存储，不调用 NeMo/F5 或 Marketplace 工作区接口。
- `/v2/import`：仅导入 Mock 配置。真实版不开放演示导入。

同一镜像提供两种入口，页面顶部可互相切换；Mock 数据不会迁移进真实库，也不读取旧演示存储。

## 主动查询

`Refresh backend status` 先重读 Marketplace 工作区，再按关联 ID 查询 NeMo/F5，每次最多四个并发读取。展示查询时间、无关联、404、权限/网络错误、版本或绑定差异等结果。

刷新只读，不执行创建、评测、发布，不导入全部存量资源，也不覆盖业务状态。结果仅保留在当前页面，工作区修订改变或切换账号时清除；一条失败不影响其他查询。资源可读取不代表所有配置完全一致或业务流量已受保护。
