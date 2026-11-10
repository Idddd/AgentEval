# F5 真实资源导入与排错

本次实现适用于 V3 NMGR；不使用旧版 `/api/f5` 模拟 CRUD，也不读取 V2 mock 数据。需要部署包含本次改动的前后端。

## 接入和页面

配置服务端 `F5_API_URL=https://<host>/backend/v1` 和 `F5_API_TOKEN_FILE`（或 `F5_API_TOKEN`）。使用现有连接配置页或运行环境；Token 只保留在服务端。连接探测成功仅表示 Scanner 列表可读，完整导入还需要读取 Scanner 详情、版本和 Project 列表/详情的权限。

V3 加载工作区后，F5 导入独立在后台执行；“Refresh backend status”会重新导入。F5 请求不占用页面操作锁，NeMo 列表、创建与工作流仍走原来的服务。F5 导入失败显示独立错误，保留最后一次完整数据；真实空列表保持为空。页面读取仍需现有 Marketplace 身份验证。

| F5 数据 | V3 页面 / 字段 |
|---|---|
| Scanner | Guardrail 列表和详情；`provider=F5` |
| Scanner 当前版本及历史版本 | `item.imported.f5.currentVersionId`、`versions[]`；显示名称、精确 ID、发布状态、创建时间 |
| Project | Configure Profiles 列表和详情 |
| Project 直接 Scanner 引用 | `item.imported.f5.scannerBindings[]`；保留 ID、version、direction、enabled、blocking、mode、force |
| Project 包引用 | `packageBindings[]` 保留 ID、版本及启用状态；不会推算包内 Scanner |
| Project 部署状态 | `item.imported.f5.deploymentStatus` 原样显示；不伪造 Profile 发布版本、审批或运行状态 |

导入项只读，在 F5 修改后重新刷新。已由 Marketplace 管理的记录不覆盖本地业务需求、审批、评测、任务和冻结绑定。旧连接的导入项保留在数据库，但在更换 F5 URL 后隐藏，避免混淆实例。可见资源按当前控制单元及现有 Tech 权限范围返回。

Project 引用的历史版本不会自动升级。停用、没有读取权限或目录中不存在的 Scanner 引用也保留原始 ID/版本；无法解析时显示提示。`refs` 只提供可见本地记录的跳转，`scannerBindings` 才是源端绑定事实。未提供的字段保持缺省，页面显示 `—`，不生成默认业务数据。

新建受管 Profile 可选择具有受支持方向和精确 UUID 的当前已发布 Scanner；审批时冻结该版本及方向。后续出现新版草稿不会阻断已冻结的历史发布版本；历史版本实际失效或撤销发布时会拒绝继续审批/部署。导入的 Project 本身不进入审批/部署流程，不推断其真实流量是否生效。

## 独立 API 与 Swagger

`POST /api/nmgr/v1/integrations/f5/imports`，JSON 请求体为 `{}`。返回 `revision`、`actor`、`sources` 和 `imported: { guardrails, profiles }`；数量是可见范围内当前可用的 F5 导入记录总数，不是本次新增数，不包含 NeMo 或已由 Marketplace 管理的记录。

随后调用：

- `GET /api/nmgr/v1/guardrails?provider=F5` 和 `GET /api/nmgr/v1/guardrails/{id}`。
- `GET /api/nmgr/v1/profiles?provider=F5` 和 `GET /api/nmgr/v1/profiles/{id}`。
- 详情中的 `id` 是 Marketplace ID；`imported.remoteId` 是 F5 ID。

原 `GET /api/nmgr/workspace` 保持兼容：`X-Marketplace-Import: true` 仅导入 NeMo；`X-Marketplace-Import: f5` 仅导入 F5。普通 GET 不进行远端目录导入。Swagger 同步包含导入路径、嵌套版本/绑定字段、错误结构及页面 API 映射。

导入只发出以下 GET 请求，不创建、修改、发布任何远端资源：

- `/scanners?limit=100[&cursor=...]`
- `/scanners/{id}`
- `/scanners/{id}/versions`
- `/projects?limit=100[&cursor=...]`
- `/projects/{id}`

Scanner 和 Project 列表使用 `next` 游标读取全部页面；版本接口返回完整 `versions` 数组。最多 1000 页，遇到重复资源、循环游标、身份或 schema 不匹配时停止并保留旧快照。详情读取最多并发 4 个资源。每个 F5 HTTP 请求有 20 秒超时，浏览器导入请求单独允许 120 秒，其余 API 仍使用 30 秒默认值。大目录部署需相应设置网关超时；浏览器超时不等于服务端已回滚，可刷新列表检查结果。

## 日志与故障隔离

查询 `f5_import_started`、`f5_import_page`、`f5_import_completed`、`f5_import_failed`。日志包含 `operationId`、`workspace`、`actorId`、`sourceId`、耗时和失败 `errorReference`。入口请求的 `operationReference` 对应导入 `operationId`；每个 F5 调用还记录 method、path、HTTP 状态和 requestId。错误页面的 Reference 可关联这些记录。

- `f5_http_401/403`：检查 Token 和对应列表/详情/版本接口权限；错误消息包含失败路径。
- `f5_unreachable`：网络、DNS、TLS 或超时；保留结构化原因及提示，不泄漏凭据。
- `f5_response_invalid`：检查 `/backend/v1` 地址、网关及 JSON 响应。
- `f5_catalog_invalid`：错误包含失败 endpoint、schema 字段路径及预期类型；`responseValidation` 可供其他 UI 展示。
- `f5_import_conflict`：读取期间 F5 状态被其他导入或操作更新，重新刷新即可。

远端读取在数据库锁外执行，完整成功后才一次性合并。并发保护按提供方隔离，F5 写入不会使 NeMo 导入无故失败，反之亦然。NeMo 刷新只标记 NeMo 导入项，F5 刷新只标记当前实例、当前控制单元的 F5 导入项。不会把失败读取当作空列表清除数据。

仅存储白名单元数据，不存储 Project providers、凭据或原始 Scanner 配置；日志不记录响应正文、Token、游标及输入内容。

## 文档依据与验证边界

依据 F5 官方 [Scanner 列表](https://docs.aisecurity.f5.com/operations/get_scanners.html)、[版本列表](https://docs.aisecurity.f5.com/operations/get_scanners_scannerId_versions.html)、[Project 列表](https://docs.aisecurity.f5.com/operations/get_projects.html)、[Project 详情](https://docs.aisecurity.f5.com/operations/get_projects_project.html)。当前没有可访问的真实 F5 实例；本地验证使用隔离的测试响应覆盖契约、故障及并发，不代表完成真实实例联调。部署后仍需用目标实例确认权限及版本兼容性。

本次验证：434 项测试通过（包括 NeMo/F5 回归、契约、UI、并发与本机 TLS 隔离）；未配置独立 MariaDB 测试实例，1 项数据库集成测试跳过。TypeScript 类型检查及生产构建通过。
