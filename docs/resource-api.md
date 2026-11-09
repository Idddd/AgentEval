# NMGR 独立资源 API 接入与排错

状态：在 v0.2.27 基础上新增，需部署包含本次修改的后端。原 v0.2.27 镜像尚不包含这些新路径。

## 地址、身份和兼容

前缀是 `/api/nmgr/v1`。项目另一套 TaskLattice control-plane 使用 `/api/v1`，因此本集成服务采用独立命名空间。
新 UI 通过同域网关转发 `/api`，沿用已有登录身份。严格模式使用业务用户 Bearer 身份和服务端角色映射；默认演示模式的 `X-Marketplace-Role: User | User Admin | IT Admin` 仅用于切换工作台，不是安全边界。NeMo/F5 服务 Token 不交给前端。

`GET /api/nmgr/connection` 返回 `connectionRevision`，后续请求可通过 `X-Marketplace-Connection` 携带它，后端连接变化后旧请求返回 409。原 `/api/nmgr/workspace`、`/commands`、配置和探测接口全部保留，内置 V3 继续作为兼容客户端。新接口与旧接口共用身份、数据库、权限、工作流、幂等和 NeMo/F5 adapter。

## 按页面接入

下表路径省略 `/api/nmgr/v1`。所有 ID 均为 Marketplace 本地 ID，只有 `/evaluations/{id}` 使用评测 run ID。

| 页面 / 操作 | 方法与路径 | 关键返回 / 注意事项 |
|---|---|---|
| Configurate Guardrails / Tech Requests | `GET /guardrails` | `items`、`pagination`、当前页的 `jobs/bindings` |
| Guardrail 详情 | `GET /guardrails/{id}` | `item`、`job`、`binding` |
| Configure Profiles | `GET /profiles` | 真实 Profile 列表；NeMo Guardrail 映射成这里的 Profile |
| Profile 详情 | `GET /profiles/{id}` | `item.refs`、`relatedGuardrails`、`binding` |
| 主动查询后端状态 | `GET /guardrails/{id}/backend-status`、`GET /profiles/{id}/backend-status` | 实时查询 NeMo/F5；200 也可能是 `status=unavailable`，不得显示连接正常 |
| 新建 | `POST /guardrails`、`POST /profiles` | `draft` 不传 kind；新建 Guardrail 需求等待 Tech 配置源 |
| 编辑草稿 | `PUT /guardrails/{id}`、`PUT /profiles/{id}` | 提交完整可编辑 draft，不是任意字段 PATCH；id/kind 由路径确定 |
| 创建新业务版本 | `POST /guardrails/{id}/revisions`、`POST /profiles/{id}/revisions` | 保留既有发布版本，复用原工作流 |
| Tech 保存实施配置 | `POST /guardrails/{id}/implementation` | `provider` 和 `config`；权限和源不可变规则仍由业务层校验 |
| 评测候选列表 | `GET /evaluation-candidates` | TEST READY / TEST PASSED / TEST FAILED 的 Guardrail |
| 发起评测 | `POST /guardrails/{id}/evaluations` | `dataset/cases`；返回当前任务 |
| 评测历史 / 详情 | `GET /evaluations`、`GET /evaluations/{id}` | 真实保存的 runs/evidence；没有运行过则为空 |
| 提交审批 | `POST /guardrails/{id}/approval-requests`、`POST /profiles/{id}/approval-requests` | 原作者提交；Profile 引用版本校验保持不变 |
| Sign-Off 列表 | `GET /approval-requests?kind=Profile` 或 `kind=Guardrail` | 当前待审批资源；默认只返回 SIGNOFF REQUESTED |
| 审批上下文 | `GET /approval-requests/{id}` | 当前资源版本和业务状态，不是历史审批单快照 |
| 批准 / 拒绝 / 撤回 | `POST /approval-requests/{id}/approve`、`/reject`、`/withdraw` | 拒绝须填 reason；原有独立审批人校验不变 |
| Deployment 列表 | `GET /deployments?kind=Profile` 或 `kind=Guardrail` | 当前 SIGNED OFF 和曾经发布的资源；结合 jobs 判断发布中/失败 |
| 发布上下文 | `GET /deployments/{id}` | 当前实体、job、binding；不是不可变的部署历史记录 |
| 发起发布 | `POST /guardrails/{id}/deployments`、`POST /profiles/{id}/deployments` | Tech 操作，保持审批和评测前置校验 |
| 任务列表 / 详情 | `GET /jobs`、`GET /jobs/{id}` | ID 是资源 ID，返回它当前任务，后续流程可能替换它 |
| 推进 / 对账恢复 | `POST /jobs/{id}/advance`、`POST /jobs/{id}/reconcile` | 一次推进一步；GET 不会执行任务，没有自动后台 worker |
| Trace | `GET /audit-events` | 配置操作历史，非会话流量 trace |
| Dashboard | `GET /dashboard/summary` | 发布配置数量、待审批和失败任务数；未接流量指标为 null |
| 导入 NeMo 已有资源 | `POST /integrations/nemo/imports` | body `{}`；同步执行，完成原子合并后 200；再刷新相应列表 |
| 能力检查 | `GET /capabilities` | Measure、Feedback、runtimeControl、runners 当前 unavailable |
| Connection Settings | 原 `/api/nmgr/connection`、`/connection/test` | GET/POST/DELETE 配置状态，POST 独立探测 |

所有资源列表都只返回当前身份可见范围。外部导入资源可读，不开放修改、审批和发布。

### NeMo Custom 与 F5 GenAI 配置

`scannerType=custom` 的 `config.content` 随 provider 不同而不同：NeMo 要求 **JSON 编码的 Policy definition 字符串**，包含 `kind: "Policy"`、`schema_version: 1`、非空 `rules` 和 `tests` 数组；F5 接受自然语言检测指令。不能把 User 提交的业务需求直接当作 NeMo 可执行实现，也不会自动生成或伪造规则。

NeMo 的关键词和正则实现可直接选择 `keyword` 或 `regex`，后端会转换为 Policy 定义。Custom 使用 JSON 中的 `rules[].stages` 指定输入/输出方向；同步未发布草稿时可使用空 `tests`，但评测前必须补充验收测试。前端和后端共享基础结构检查，完整 detector/rule 校验由真实 NeMo 执行。格式错误返回 422，不写入 NeMo；UI 保留输入供修正。

## 列表与详情

通用分页参数：`page`（默认 1）、`pageSize`（默认 20，最大 100）、`q`、`order=asc|desc`。

- Guardrail/Profile、审批、发布、评测候选：另支持 `sort=id|name|updated`（默认 updated）、`status`、`kind`、`provider=NeMo|F5`、`unit`。
- Jobs：另支持 `status=pending|failed|uncertain|done`、`resourceId`，按 started 排序。
- Evaluations：另支持 `resourceId`，按 start 排序。
- Audit：另支持 `resourceId`、`actor`、`from/to`（含时区的 ISO 时间），按 time 排序。
- 无结果返回 `items: []`、`total: 0`；不生成 placeholder 业务记录。
- 非法、未知或重复查询参数返回 422。稳定排序以 ID 为第二排序键。多个请求间发生写入时 revision 可能改变，必要时重新获取列表。

```js
const response = await fetch('/api/nmgr/v1/profiles?page=1&pageSize=20', {
  headers: { 'X-Marketplace-Role': 'User' }, // 仅演示模式
  cache: 'no-store'
});
const result = await response.json();
if (!response.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
renderProfiles(result.items, result.pagination);
// 保存 result.revision，下一次业务操作传 expectedRevision。
```

列表返回顶层 revision、actor、sources、可选 sourceErrors/accessMode。详情返回 item、job/binding（无值为 null）以及 Profile 的 relatedGuardrails。
绑定远端版本是字符串，不能与本地 `item.version` 整数混用。

## 修改与任务语义

所有业务修改必须传 `requestId`（UUID）和 `expectedRevision`（最近查询的工作区 revision）。新逻辑操作用新 UUID；网络重试复用完全相同的 UUID 与内容。409 后先重新查询/对账，不能直接用新 UUID 重放远端写入。

```json
{
  "requestId": "d594d357-2aeb-446b-a116-2e1d8dca4a7b",
  "expectedRevision": 12,
  "reason": "Requirements need revision"
}
```

上例用于 `POST /approval-requests/{id}/reject`。每个路径的请求模型和可执行示例详见 Swagger。

- `201`：资源已创建；检查 job，NeMo 草稿同步可能需要后续恢复。
- `202`：任务 pending/inflight，返回 `jobId`、`jobUrl`、`Location`。当前模型 jobId=resourceId。
- `200`：请求已执行，但不保证远端业务成功；检查 `job.status`、`message`、`canResume`。
- `failed`：明确失败；`uncertain`：写入可能成功，须 reconcile，不可盲目重建。
- NeMo 导入 POST 是同步的；返回的 imported 数量是当前可见且可用的导入资源总数，不是本次新增数。普通新 GET 不理会旧的导入请求头，避免列表读取隐式导入。

## 日志与排错

所有 `/api/nmgr/*` 请求返回 `X-Request-ID` 和 `X-Operation-ID`。一次 HTTP 请求对应一条 `api_request_completed` JSON 日志：

- `requestId`：响应头、错误响应体和依赖错误日志一致。
- `operationId`：对应 Swagger，如 listProfiles、implementGuardrail、deployProfile。
- `route`：路径模板，例如 `/api/nmgr/v1/profiles/{id}`，不记录查询字符串。
- `resourceId`、`commandId`：已校验的资源 ID、幂等 UUID。
- `method/status/durationMs`：HTTP 结果和耗时。
- `jobStatus/operationReference`：任务结果以及可关联的 F5 operation reference。

不记录 Token、Authorization、密码、请求正文、策略内容、扫描正文、查询关键字。配置读取/数据库初始化阶段失败也记录请求完成日志。

排错顺序：浏览器 Network 确认 operationId → 查看 error.code/component/message → 用 requestId 搜服务端日志 → 查询 jobs/{id} 和 backend-status → 对 uncertain 执行 reconcile。F5 不可用通过 sourceErrors.F5 或资源任务状态呈现，不把所有 NeMo 接口变成失败。

## V3 导航

V3 页面与详情现在记录在同一 V3 URL 的 hash 中，例如 `/v3/guardrails?role=user#Profile/repository/{id}`。页面切换写入浏览历史，Back/Forward 恢复页面，刷新可恢复详情，角色和配置切换保留 router history state。只有明确点击 Open Mock V2 或返回到进入 V3 之前的历史记录才会离开 V3。

## 尚未接入

Measure/scan、反馈关闭、会话流量 trace、运行时 Bypass/Kill Switch、runner monitoring 均未新增真实执行接口。新 UI 使用 capabilities 禁用相关动作，并将 null 指标展示为未接入。F5 真实实例验收仍需要部署后的 URL、权限和 CA；本地合同/隔离测试不等于目标实例验收。
