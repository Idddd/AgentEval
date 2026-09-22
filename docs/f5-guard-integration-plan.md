# F5 AI Security 与 Tasklattice Guard 统一集成方案

日期：2026-09-21。状态：供评审的架构与实施方案，尚未实现双后端连接。

## 1. 目标与建议

在当前 UI 的 **Guardrail Profiles** 中统一展示两个内网后端的配置，通过 **Source** 区分来源；创建、编辑、绑定 Policy、发布和删除均调用所选来源的真实 API。

推荐采用「统一管理 API + 服务端适配器 + 集成元数据库」：

- 一个 Profile 属于一个后端实例，创建时选择 Source，创建后不可直接更换。
- 同一列表可包含 F5 和 Tasklattice Guard 数据；一个 Profile 只绑定同一实例的 Policy。
- 统一业务操作和展示，保留各后端独有的配置、权限和生命周期。
- 原生执行配置由对应后端负责，平台数据库保存业务元数据、资源映射、同步状态与操作记录。
- 创建成功必须有远端真实资源 ID，并完成回读验证；本地保存不能冒充远端创建成功。

这里将用户所说的「在真实 F5 或 Guard 创建」解释为**选择一个目标系统写入**。同时向两个系统创建一对镜像 Profile、或者一次请求串行执行两个引擎，需要额外的编排和失败处理，属于后续独立功能。

### 方案比较

| 方案 | 优点 | 问题 | 判断 |
|---|---|---|---|
| 浏览器分别直连两个后端 | 首次读列表改动少 | 凭据、CORS、权限、分页及业务差异散落在浏览器，缺少共享元数据 | 不采用 |
| 现有 Node 服务增加统一 API 与适配器 | 保留页面和部署入口，可集中权限、真实写入和错误处理 | 需要增加数据库和同步任务 | **推荐** |
| 单独新建大型管理微服务 | 可以独立扩容和发布 | 当前规模引入额外运维成本 | 先保留模块边界，后续再拆分 |

## 2. 调研范围与证据边界

- 当前前端：`web/apps/control`，现有发布基线 v0.2.4；当前会话 Demo 使用 mock。
- Guard：本地 `.artifacts/tasklattice-guard` 检查基线 `41bbdfd`，不代表本次已同步远端最新提交。
- 历史真实联调见 [2026-09-17 审计](live-backend-audit-2026-09-17.md)。该文件描述当日 live 状态，不代表现在仍是 live。
- F5：阅读官方部署、Project、Scanner、版本与权限文档。**未连接用户的 F5 实例，未实际创建或扫描**。
- F5 文档同时发布 SaaS 和 On-premises 信息，页面快照也存在版本差异；实现必须以准备部署的内网版本、许可证和其 OpenAPI 为准。

## 3. 当前系统实际上如何运行

### 3.1 前端和轻量 Node 服务

```text
React / TypeScript / TanStack Router + Start
  └─ business-demo provider
       ├─ MockProvider → localStorage + 模拟处理状态
       └─ RemoteProvider → 浏览器 GuardAdapter
                            └─ 同源 /api/guard/*
                                 └─ Nitro 代理 → Guard Controller
```

- 样式和交互使用 Tailwind、Radix。Profile 页面、Policy 抽屉、行内编辑等已有实现。
- `vite.config.ts` 将 Nitro 的服务目录指定为 `marketplace-server`。仓库保留的旧 `server/`、Prisma 控制平面并未挂载到此应用。
- `marketplace-server` 当前主要提供 branding、runtime config、health 和 Guard 白名单代理，**没有启动业务数据库**。
- mock 数据保存在浏览器 localStorage，不能实现跨用户共享和可靠审计。
- live 当前针对单一 Guard 连接，不能仅增加一个 F5 URL 就自动支持第二种后端。
- 已有 runtime `sourceId` 用于单连接隔离；不是完整的多后端资源身份。
- UI 的 `Entity`、`PolicyReference` 没有后端实例身份，版本混用 number/string，`remote` 也只有少量标记。
- 当前 Guard 列表读取后会逐条取详情，搜索、排序、分页主要发生在客户端；直接拼接两端第一页会导致统一列表不完整。

代码入口：

| 文件（相对仓库根） | 当前职责 |
|---|---|
| `web/apps/control/src/features/business-demo/catalog.tsx` | 列表、创建、Policy 详情和版本交互 |
| `web/apps/control/src/features/business-demo/guardrail-detail.tsx` | Profile 详情 |
| `web/apps/control/src/features/business-demo/model.ts` | UI 数据模型、mock 规则 |
| `web/apps/control/src/features/business-demo/provider.tsx` | mock/live 状态和刷新、写入 |
| `web/apps/control/src/features/business-demo/guard-api.ts` | Guard 数据映射与写请求 |
| `web/apps/control/marketplace-server/guard-api.ts` | 单来源代理、路径和来源校验 |

### 3.2 真实 Guard 后端

```text
管理请求 → Controller（Node / TypeScript / Hono）→ PostgreSQL / Drizzle
                         ↕ gRPC：任务、心跳、ACK、结果
                      Runner（Python / NeMo）

应用运行时请求 → Runner / 已配置的运行时入口
```

Controller 管理 Policy 草稿和不可变版本、Guardrail 草稿/版本、校验任务、编译产物、Router/Endpoint、Runner 注册及审计等。Runner 执行校验与规则，可包含确定性检查和模型调用，不能笼统理解为「Runner 就是 AI 模型」。

重要边界：草稿保存、校验、编译发布、运行时路由生效是不同步骤。Router 可以固定引用某个已发布 Guardrail 版本，更新 activeVersion 不等于所有 Router 自动切换。

### 3.3 当前真实功能缺口

历史审计已验证 Guard 部分真实创建、修改、校验、发布与原生 Policy API；不能据此认为整个 Demo 已具备生产后端。

| 缺口 | 对双后端集成的影响 |
|---|---|
| Profile 的 owner/useCase/busu/location/agentType/dataType 缺少原生存储 | 需要持久化业务元数据，不能继续只存在 mock |
| live 启停未接通，Guard 基线没有匹配 Demo 的独立停用流程 | 不能将状态标签变化当作真实停用 |
| 后端有删除，现有代理不放行 DELETE，live UI 未完整接通 | 删除能力必须贯穿 API、权限、影响检查和 UI |
| 自然语言 Rule text 不等于 Guard 可执行 Policy | 要增加原生配置编辑或真正的作者服务 |
| 部分目录策略缺少 Owner、创建/更新时间 | 显示未知，不伪造当前用户和当前时间 |
| 刷新与写入共享锁 | 改为资源级写串行化与缓存更新，不能要求用户重复点 Save |
| 单一 status 无法表达草稿和线上版本共存 | 必须拆分状态维度 |

旧单后端审计建议在 Guard 内增加业务字段。现在有两个引擎，建议调整为平台统一存储业务元数据，避免要求 F5 暴露相同字段。

## 4. F5 概念与当前 UI 的映射

### 4.1 最关键的命名差异

F5 API 使用 Scanner 管理单条 Guardrail；Project 配置可以引用多条 Scanner。建议映射如下，属于本平台设计选择，不能当作两产品天然同义。

| 统一 UI 对象 | Tasklattice Guard | F5 AI Security | 设计理由 |
|---|---|---|---|
| Guardrail Profile | Guardrail | **Project** | 承载一组策略及执行配置 |
| Policy | Policy | Scanner / F5 Guardrail | 单项检测规则 |
| Policy version | 已发布版本 | Scanner version | 绑定具体版本，ID 格式可不同 |
| Profile 的 Policy binding | draftConfig.policyBindings | project.config.scanners | 必须保留版本及来源特有配置 |
| Policy package（暂不增加一级入口） | 无需强行映射 | Scanner Package | 可复用组合，后续单独支持 |
| UI Workspace | 平台工作空间 | 不直接等同 F5 Project | 一个工作空间可以显示多个 F5 Project |

依据：[创建 Project](https://docs.aisecurity.f5.com/operations/post_projects.html)、[读取 Project](https://docs.aisecurity.f5.com/operations/get_projects_project.html)、[创建 Scanner](https://docs.aisecurity.f5.com/operations/post_scanners.html)。

为什么第一期不直接用 Scanner Package 作为 Profile：其公开创建示例使用 `scannerIds`，不能仅据此确认逐条版本固定语义；而 Project 配置和按 Project 扫描更接近当前 Profile 的使用方式。若实际业务要求一个 Profile 复用于多个 F5 Project，再设计 Package 与部署绑定两层。[创建 Package](https://docs.aisecurity.f5.com/operations/post_scanner_packages.html)、[按 Project 扫描](https://docs.aisecurity.f5.com/api-docs/sending-scan-request-specific-project.html)。

Project 还包含成员、Provider 等其他概念。平台只能修改自己支持的字段，必须保留其余配置；不允许把原生 Project 简化后整份覆盖。

### 4.2 F5 Policy 编辑不是统一文本框就能解决

F5 自定义 Scanner 支持 GenAI、Regex、Keyword 类型。建议根据类型显示相应配置；自然语言输入只在适用类型启用。Guard 则仍需要可编程草稿/作者服务，不能把描述字符串分别 POST 到两端就声称策略可执行。[自定义 Scanner](https://docs.aisecurity.f5.com/api-docs/creating-custom-scanner.html)。

版本使用独立的 `versionId` 与 `versionLabel`。F5 版本 ID 是 UUID，不能用 `v2` 或数字比较代替。普通发布固定 `push=false`，避免一次编辑影响所有引用项目；升级某个 Profile 必须单独修改该 Profile 的绑定。[Scanner 版本](https://docs.aisecurity.f5.com/api-docs/working-with-scanner-versions.html)、[发布版本接口](https://docs.aisecurity.f5.com/operations/patch_scanners_scannerId_versions_versionId.html)。

## 5. 推荐目标架构

```text
用户浏览器
    │ 公司登录会话；同源请求
    ▼
现有 UI + Nitro：Marketplace Management API（新增）
    ├─ 身份、工作空间授权、输入校验、幂等和审计
    ├─ Source registry / 能力发现 / 聚合查询
    ├─ 集成 PostgreSQL：元数据、映射、同步投影、操作记录
    ├─ Guard server adapter → 内网 Guard Controller → Guard 自有 PostgreSQL
    │                                            ↕ Runner
    └─ F5 server adapter    → 内网 F5 Management API → F5 管理的存储/执行服务

后台 worker：同步目录、跟踪长任务、回读、恢复中断操作
密钥：Kubernetes Secret / 企业密钥服务，由服务端适配器读取
```

第一期 API 可和现有 Node 应用同部署；worker 可以是同镜像的独立 Deployment，使用数据库租约避免多副本重复执行。不要依赖一次 HTTP 请求结束后仍存活的内存计时器。

这是管理面集成。业务应用的实际检查请求仍进入 F5 或 Guard 的运行时接口；本方案不在 UI 服务中转发所有 LLM 流量。需要展示运行时绑定和验证结果，避免「创建成功」被误读为「业务流量已受保护」。

### 5.1 数据归属

| 数据 | 权威来源 | 平台保存什么 |
|---|---|---|
| 原生名称、执行配置、版本、绑定 | 对应 F5/Guard API | 可重建的查询投影、remote revision/hash |
| BUSU、Location、Use case、Agent type、Data type、业务 Owner | 集成数据库 | 真实持久记录；支持权限与筛选 |
| Source URL、实例标签、scope、能力 | 平台 Source registry | 配置与 secret 引用，非明文 token |
| 发布/校验/启停结果 | 后端确认和运行时证据 | 任务句柄、最近确认结果、时间 |
| 平台操作历史 | 集成数据库 | 操作者、目标、变化摘要、远端结果、关联 ID |

允许共用 PostgreSQL 集群，但逻辑数据库/角色隔离。不读写 F5 私有表，不跨越 Guard 的 API 直接改其执行配置。

Location 的 All 表示业务分类适用于所有地点，建议存为 `locationScope=all`，不要展开成今天已知地点列表。它本身不保证数据地域路由或驻留；若要控制执行区域，需要单独定义部署约束。

### 5.2 最小持久模型（建议新增）

- `source_instances`：类型、显示名、API 地址、版本、工作空间 scope、secretRef、连接健康、能力。
- `resource_links`：平台 UUID、sourceInstanceId、nativeKind、remoteId、nativeScope、managed/imported 标志。唯一约束 `(sourceInstanceId,nativeKind,remoteId)`。
- `resource_metadata`：平台 UUID、业务字段、元数据 revision、更新者和时间。
- `resource_projections`：原生详情的受控投影、remote revision/hash、lastSyncedAt、stale、deleted tombstone。
- `policy_binding_projections`：Profile、Policy、精确 versionId、draft/published/deployed 引用类别；由后端配置重建。
- `operations` 与 `audit_events`：幂等键、请求摘要、阶段、remoteId、重试状态、操作者；禁止保存明文密钥或不必要的扫描原文。

不能把 Guard 的 `policy_record.source=builtin/custom` 当作 Source 列；前者是策略来源类型，后者是后端实例身份。

## 6. 统一契约与能力

以下为**建议新增的契约**，不是当前已实现接口。

资源至少返回：

```text
id: 平台 UUID
source: { type: f5 | tasklattice-guard, instanceId, label }
native: { kind, id, scope }
name, metadata, nativeOwner, nativeStatus
version: { id: 不透明字符串, label, published, createdAt }
bindings: [{ policyId, sourceInstanceId, versionId, versionLabel, config }]
state: { draft, validation, publication, execution, sync }
capabilities: { edit, delete, validate, publish, activate, deactivate, createPolicy }
capabilityReasons: 每项禁用原因
revision, lastSyncedAt, stale
```

- Source 创建后不可直接 PATCH。迁移到另一引擎要重新创建和验证，保留 lineage。
- 用户不能通过请求提交任意 upstream URL；服务器根据已授权 instanceId 查 registry。
- 后端重新校验绑定来源、版本可用性和对象权限，不相信浏览器筛选结果。
- 内置 Policy 可以只读；资源可编辑能力还取决于用户、版本和运行状态。
- 未知状态显示原生状态/未知，不能默认为 Ready。未知时间显示 `—`。

### 建议 API

统一前缀 `/api/marketplace/v1`，与现有 `/api/guard/*` 迁移期并存。

| 方法与路径 | 用途 |
|---|---|
| GET `/sources` | 当前用户可访问的实例及健康/能力 |
| GET `/profiles`、`/policies` | Source/Owner/Status/关键字筛选、统一排序和游标分页 |
| POST `/profiles` | 指定 sourceInstanceId 创建真实对象，携带 Idempotency-Key |
| GET/PATCH `/profiles/{id}` | 详情及修改，PATCH 带 expectedRevision |
| GET `/policies/{id}/versions` | 原生版本 ID 和标签，发布/可选择状态 |
| POST/PATCH `/policies[/{id}]` | 来源特定的类型化定义，不是统一字符串直传 |
| POST `/profiles/{id}/actions/{action}` | 验证、发布、启停；服务器能力校验 |
| GET `/resources/{id}/deletion-impact` | 删除前依赖和运行时影响 |
| DELETE `/profiles/{id}`、`/policies/{id}` | 按来源删除，回读/后续同步确认 |
| GET `/operations/{id}` | 跟踪远端任务和部分成功 |

列表返回 `items,nextCursor,sourceHealth,lastSyncedAt`。聚合分页基于完整同步投影进行全局排序，稳定次序为 `(sortField,id)`；同步不完整时标注 coverage，不给出虚假的完整总数。一端故障时仍展示另一端和明确标注的旧快照，不自动混入 mock。

## 7. 真实创建、修改与版本升级

### 7.1 创建通用流程

1. 用户选择 Source；只加载该实例内可授权、可绑定的 Policy 版本。
2. 填写业务字段及来源特定配置，确认目标实例。
3. 服务端校验权限、版本和 Source；持久化操作记录/幂等键。
4. 适配器在目标后端创建真实对象，记录 remoteId。
5. GET 回读，核对名称、绑定的 Policy ID 和精确版本。
6. 写入映射、业务元数据和投影；全部完成后返回 confirmed。
7. UI 显示来源、真实对象信息；发布和启用另走明确流程。

长任务返回 `202 {operationId}`，不能返回伪造 Ready。POST 超时后进入 reconciling，不盲目重试：优先使用后端幂等机制；没有时采用已验证可用的关联标记和查询方式。若无法唯一确认创建结果，显示「结果待确认」，由操作恢复流程处理，不靠名称猜测对象归属。

跨系统没有数据库事务。远端成功而平台落库失败时，保留操作证据并恢复映射；不自动删除一个可能已在远端使用的对象。启动恢复任务处理 executing/reconciling 记录。

### 7.2 Guard 写入

- 复用现有 GuardAdapter 的契约知识，迁移到服务端；创建 `/api/v1/guardrails`，写入后端支持的 name、runtimeProfile 和 draftConfig.policyBindings。
- 精确固定 Policy 版本，并保留规则、Rails、参数默认值和其他运行配置。
- 修改带草稿 revision 校验；业务元数据存平台数据库，不能追加到拒绝这些字段的原生 PATCH。
- 校验关联当前 draftRevision；发布只接受对应 revision 的有效结果，并跟踪编译状态。
- 若需要实际生效，额外检查 Router/Endpoint 与版本的绑定及 Runner 状态。

### 7.3 F5 写入

- 推荐 `POST /backend/v1/projects` 创建 Profile，随后 GET 回读。请求严格使用已部署版本的 schema，配置所选 scanners 与其版本；不要照抄文档示例中的任意占位值或全局权限设置。[创建接口](https://docs.aisecurity.f5.com/operations/post_projects.html)。
- 修改使用 Project PATCH，保留未编辑的 providers、packages、权限相关设置及其他 scanner 配置。[修改接口](https://docs.aisecurity.f5.com/operations/patch_projects_project.html)。
- 单独的「加入 Scanner」接口示例没有版本请求体，不能用它证明精确版本固定；应验证 Project 配置的 version 字段真实语义，并在写后读回对应版本。[加入 Scanner](https://docs.aisecurity.f5.com/operations/post_projects_project_scanners_scannerId.html)。
- F5 Scanner 的可见范围 `/access` 管理 global/projectIds；它不是启停开关。[访问范围接口](https://docs.aisecurity.f5.com/operations/patch_scanners_scannerId_access.html)。
- `deploymentStatus` 存在不代表修改它会停止执行。实施阶段先用专用测试 Project 验证扫描行为和实际停用机制；未证实时禁用 Activate/Deactivate，并明确原因。
- 原生 Project 可能已经被其他应用使用。首次导入默认只读，显式纳管后才能修改；删除整个 Project 前必须检查成员、token、providers、扫描/业务引用等影响，不能把它当作无副作用的 UI 行删除。

### 7.4 单个 Profile 升级 Policy 版本

用户选择新版本 → 保存该 Profile 的绑定 → 后端回读确认 → 同时更新 Profile 详情、Policy Used by 和列表缓存。

Used by 必须区分 draft 与已发布/运行中的引用：新草稿引用 v2，不代表当前线上 v1 已替换。版本详情默认显示当前版本的引用，可另外查看其他版本引用。禁止从旧的 Policy 计数推断新版本已被使用。

刷新不重置未保存的编辑内容；保存期间按资源串行化，刷新响应使用 revision/请求序号防止旧响应覆盖新结果。外部原生控制台修改时返回冲突和差异，不能整份覆盖。若后端没有原子条件更新，回读 hash 只能缩小竞争窗口；需明确剩余限制，并采用单写入方约定或后端原生并发机制。

## 8. 状态、编辑和删除

当前单个 status 不足以准确表示两端。内部拆为：草稿状态、校验状态、发布状态、执行状态、同步健康；UI 用主标签加辅助说明。

| UI 表达 | 条件 |
|---|---|
| Draft | 保存了未发布配置 |
| Processing | 真实异步操作未完成，并提供具体操作名 |
| Ready | 满足该来源已核实的可使用条件，尚未确认启用 |
| Active | 有明确的启用/版本绑定证据；不声称已有生产流量 |
| Needs input | 配置错误或校验失败，显示后端原因 |
| Unknown / Sync failed | 无法确认远端状态，不修改为 Ready |

保留用户要求：Active 先 Deactivate 才能修改执行配置或删除；服务端也必须执行约束。Guard 当前缺少对应停用语义，F5 尚待实测，因此不能先在平台改标签模拟实现。元数据编辑是否也随之锁定，第一期保持当前 UI 一致，统一锁定。

发布、启用、扫描调用链分别验收。F5 一次 scan 不是 Guard 的完整 regression validation；两种结果应显示测试范围和引擎，不提供虚假的统一「全部通过」。

删除前展示具体 Source、资源、依赖和影响。解除 Profile 的 Policy 绑定与删除全局 Policy 使用不同入口与文案。真实删除确认后列表隐藏，保留平台审计/tombstone；不显示 Deprecated 条目来代替删除。

## 9. UI 改动

### 列表

- Guardrail Profiles 增加 **Source** 列，示例 `F5 · 内网生产`、`Guard · 内网生产`。详情头部保持相同标识。
- 保留直观 checkbox 筛选，在 Status/Owner 旁新增 Source：All / F5 / Guard；多实例时可进一步选择实例。
- Policies 同样加 Source，防止两端同名 Policy 混淆；内置/自定义作为独立属性。
- 同步错误显示在对应来源区域；能够继续访问其他正常来源。

### 创建和编辑

- 创建第一步选 Source，再选名称、业务字段、Policy 版本。只有一个可写来源时可预选，但仍显示。
- 更换 Source 会清空不兼容 Policy 选择，提示用户；已创建对象不允许改 Source。
- Policy picker 展示名称、Source、所选版本、Latest 与可用状态；精确绑定一条版本，不自动追随 Latest。
- F5 增加适用的扫描方向、动作/模式等；Guard 保留原生规则配置或高级入口。枚举取部署版契约，不凭文档示例硬编码。
- 名称、业务字段继续使用悬停浅色 edit icon、图标悬停加深、点击进入编辑。禁用时给出具体原因。
- 保存成功基于远端回读；局部成功明确区分「后端已保存，元数据待同步」和「请求未执行」。

### 来源不可用

可以查看标记时间的旧快照；创建/写入该来源禁用。正式双后端模式禁止自动 fallback 到 mock。Demo 仍可独立选 mock，但整页清晰显示 Demo，并使用独立存储空间。

## 10. 身份、内网部署与运维

- 接入公司 SSO；浏览器只持有平台会话。根据 Workspace 和角色限制 Source、对象及写操作。
- 两个来源使用独立最小权限凭据，保存在服务端 secret 引用中；不要把 F5 token 发给 Guard，也不要沿用单机自动 token 作为共享内网身份。
- F5 存在用户、全局、Project token，权限范围不同。跨 Project 管理所需权限应按实际端点验证；不能默认采用组织管理员 token。[F5 权限](https://docs.aisecurity.f5.com/api-docs/permissions-in-calypsoai.html)。
- 使用服务账号时，平台必须在每次请求执行自己的授权，并在审计保存真实用户；远端只记录服务账号这一限制需要明确。
- 继续同源写请求校验，补充会话 CSRF 防护、目标地址 allowlist、TLS/内网 CA、超时、限流、错误脱敏。
- F5 的 Helm 安装涉及 Operator、镜像访问、许可证与持久存储，文档建议生产使用外部 PostgreSQL。具体组件与资源按部署版本确定。[F5 Helm 部署](https://docs.aisecurity.f5.com/get-started/get-started-helm.html)。
- 内网部署需准备镜像/模型镜像、许可证、DNS、证书、模型依赖及离线更新策略；「部署在内网」不自动代表所有组件完全无外联。
- 应用 chart 增加集成数据库连接、source registry、Secret references、worker 和迁移 Job；数据库迁移不放进每个 Web 副本启动逻辑。
- 分开 liveness、readiness 与每个 Source 的健康检查；一个来源故障不导致整个 UI 被重启。
- 观测至少包含来源延迟、错误率、同步延迟、操作积压、恢复失败和审计 correlationId。

## 11. 实施阶段与验收

### 阶段 0：对齐部署契约

获取内网 F5 版本/OpenAPI/许可能力/API 地址与权限，锁定 Guard 版本。用独立测试数据验证 Project 创建、绑定 UUID 版本、回读、更新、删除和按 Project 扫描；验证 F5 启停与 Guard 路由启停语义。

交付：固定版本契约样本和能力矩阵；明确不支持的操作。实际不可用能力不阻碍只读集成，但阻止对应写操作上线。

### 阶段 1：统一读与 Source

新增契约、Source registry、server adapters、集成数据库及同步 worker；改 provider 接统一 API。实现 Source 列/筛选、双来源详情、真实版本与 Used by。

交付：两端数据在一个列表，来源/实例身份明确；同名同 ID 不冲突；一端离线仍可使用另一端。

### 阶段 2：真实创建与编辑

实现操作记录、幂等恢复、远端创建回读、元数据保存、版本绑定与冲突处理。先支持已有可用 Policy 组装 Profile，再补来源特定的 Policy 创建。

交付：从 UI 创建 F5 Profile 能在 F5 查到 Project；创建 Guard Profile 能在 Controller 查到 Guardrail；刷新/换浏览器后数据一致。

### 阶段 3：生命周期与运行验证

实现能力已证实的校验/发布/启停、删除影响检查、Active 编辑限制及运行时绑定视图。补齐 Guard 必需的后端能力，完成两个引擎的真实行为测试。

交付：不能仅通过改平台 status 得到 Active；发布失败和运行时未生效被准确区分。

### 阶段 4：内网发布

完成 SSO/授权、Secret 轮换、备份恢复、同步恢复、配置迁移、压测与升级回滚演练。保持 mock 演示部署与正式数据隔离。

### 文件级改动建议

| 位置 | 改动 |
|---|---|
| `src/features/business-demo/model.ts` | 将可复用 UI 契约与 mock 演算拆开；新增 source、opaque version、状态维度和 capability |
| `provider.tsx` | 接统一 API，资源级写状态、缓存失效、操作轮询 |
| `catalog.tsx` / `guardrail-detail.tsx` | Source 列和选择、来源特定配置、能力驱动操作 |
| `marketplace-server/integrations/`（新增） | 公共 adapter interface、Guard/F5 实现、Source registry |
| `marketplace-server/routes/api/marketplace/v1/`（新增） | 统一查询、真实写操作、任务查询 |
| `marketplace-server/db/`（新增） | 元数据库 schema 和迁移 |
| 独立 worker 入口（新增） | 同步、任务恢复、回读与失效刷新 |
| 当前 Compose/Helm | 集成 DB、sources、secret refs、worker、migration job |

旧 `src/features/marketplace/api.ts` facade 提案没有接入当前页面，不应误认为可以直接开启。现有 `/api/guard/*` 迁移完成后再决定退役，避免同时保留两个不同写入口。

### 必须通过的测试

1. 两端重名/同 remoteId 数据隔离；不同 F5 实例同样隔离。
2. Source 筛选、统一排序/分页不丢记录；部分同步清晰标注。
3. 跨来源 Policy binding 被服务端拒绝。
4. 创建成功可在对应后端原生 API 查到精确绑定；另一端没有新增对象。
5. 创建超时不重复生成；远端成功/本地失败可以恢复。
6. F5 发布新版本 `push=false` 不改变其他 Profile，单个 Profile 升级只影响目标。
7. 精确版本 Used by、草稿/线上引用分别正确；保存一次即可完成，刷新不能覆盖。
8. Active 禁止编辑/删除；停用后真实执行状态和 UI 一致。能力缺失时禁止模拟成功。
9. 删除引用保护、原生 Project 的额外影响、内置策略只读与未授权访问。
10. 未登录/越权、跨工作空间、凭据过期、后端 422/409/429/5xx 错误可定位。
11. 重启、多副本和外部控制台修改后同步不丢失；冲突不静默覆盖。
12. 每个引擎用明确应允许/应拦截样例验证实际扫描路径，记录项目/路由、版本和返回证据。

## 12. 进入实现前需要确定的输入

这些是落地依赖，不影响本方案交付：

- F5 内网目标版本、OpenAPI、许可证/模型能力、地址和测试用凭据。
- 确认 F5 以「一个 UI Profile 对应一个 Project」纳管；若组织已有固定 Project 分配规则，则需调整为 Project 下的配置视图或 Package + 部署绑定。
- Guard 内网版本、运行入口、是否允许扩展启停/作者服务。
- SSO 和角色约定、Source 的生产/测试实例划分、哪些原生现有资源允许纳管。
- 正式启停的定义：停止绑定规则、解绑运行路由，还是拒绝所有相关请求；不能从按钮名推断。

结论：这项工作是把现有单后端 Demo 升级为双来源管理平台。Source 列只是展示入口；核心交付是服务端资源映射、精确版本绑定、真实写入确认和可验证的执行状态。
