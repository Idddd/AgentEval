# V3 F5 集成、故障隔离与溯源

更新：2026-11-05。没有目标 F5 实例，本次交付依据官方 API 文档、契约测试和故障注入验证；不代表已完成真实 F5 联调。

## 部署与连接

- V3 使用 `MARKETPLACE_DATA_MODE=live`、`MARKETPLACE_CRUD_ONLY=false`。不要启用历史 `MARKETPLACE_F5_MOCK`。
- 手动打开 `/v3/guardrails#connection`，启用 F5，填写以 `/backend/v1` 结尾的 HTTPS API URL 和服务端 Bearer Token。先测试地址，再测试 Token，最后保存。地址测试接受 JSON 401 作为可达证据；Token 测试必须返回符合官方结构的 `scanners` 列表。测试成功只证明连接和读取权限，写入权限在相应业务操作中验证。
- 或由部署配置提供 `MARKETPLACE_F5_ENABLED=true`、`F5_API_URL`、`F5_API_TOKEN_FILE`（优先）/`F5_API_TOKEN`，以及可选 `F5_PROJECT_ADMIN_IDS`（逗号分隔）。私有 CA 可使用配置页可信 CA 或部署 `NODE_EXTRA_CA_CERTS`。F5 始终校验证书，NeMo 的演示 TLS 选项不会降低 F5 校验。
- F5 Token 应具有目标实例中创建/读取 Scanner、管理版本/访问范围、创建/配置 Project、执行 Scan 的权限。仅具备读取权限时，UI 会在写入时显示 HTTP 403 和 Reference。
- 更换 F5 地址必须提供该地址的新 Token。保存失败保留原连接；可以禁用可选 F5 后先连接 NeMo。服务凭据不会发送到浏览器或日志。

## 已支持流程

User 创建业务需求 → Tech 选择 F5 并配置 Scanner → 运行评测（创建私有未发布 Scanner 和测试 Project，绑定真实 version UUID，执行真实 Scan）→ 提交独立审批 → Tech 发布。Profile 只绑定同一 F5 实例中已发布、已批准的精确 Scanner 版本，发布时创建并回读 Project。

发布使用 `push:false`，不修改其他 Project 的版本；Project 配置更新保留 providers、packages 和未知字段。Scanner `/access` 只处理访问范围，不作为流量启停开关。F5 存量目录导入、删除和应用流量接入不属于这一流程，不能把连接成功当作这些功能已启用。

## 错误与隔离

- F5 配置格式错误：V3 显示 F5 专属诊断；NeMo 工作区、导入和命令仍可用。`/api/nmgr/ready` 返回 `checks.f5=configuration_error`，不会因可选 F5 错误将整个服务置为不可用。
- HTTP 401/403、5xx、DNS/TLS/网络错误、非 JSON 或不兼容数据：仅对应 F5 操作失败。页面显示错误码、建议检查项、操作 Reference 和错误 Reference。
- 每个 F5 HTTP 请求最多 20 秒，单阶段操作租约 120 秒。远程请求不持有共享数据库锁；同一 F5 实例的操作通过数据库租约协调，避免多个 Profile 相互覆盖 Scanner 访问列表。共享此集成的副本必须使用同一 Marketplace 数据库。
- 页面后台 F5 任务及状态查询不会占用 NeMo 操作入口。F5 引发的修订冲突只在确认所有 NeMo 数据和身份未改变时重试一次；未知写入结果和真实业务冲突不会自动重试。
- 写入超时可能已在 F5 生效：保留 `uncertain`，使用 Reconcile 核实。创建响应丢失时需从 F5 获取确切远端 ID；不自动重发创建。进程崩溃后的未完成操作等租约到期再恢复，晚到的旧结果不得覆盖新操作。
- 数据库和 NeMo 身份认证仍是 V3 公共依赖；本次隔离的是可选 F5 故障。外部系统绕过此 Marketplace 直接修改 F5 时仍须回读检查并处理冲突。

## 日志与溯源

服务端输出结构化 JSON，业务操作包含时间、event、sourceId、workspace、actorId、resourceId、phase、operationId；每个 HTTP 请求另有 requestId、method、path、status、durationMs、outcome。F5 请求发送 `X-Request-ID`。失败事件通过 errorReference 关联页面错误和 dependency_failure 日志。

- `f5_phase_started`：开始已持久化预留的阶段。
- `f5_request_started` / `f5_request_completed`：每次 F5 HTTP 请求及结果。
- `f5_phase_remote_completed`：远端执行已返回，不表示数据库提交成功。
- `f5_phase_persisted`：业务状态和审计记录已保存。
- Trace / Operation History 的阶段记录含操作 Reference，失败详情保留错误 Reference；绑定中保留真实 Scanner、version 和 Project ID。

不记录 Token、请求/响应正文、扫描文本、完整 URL 或查询参数。部署平台应采集容器 stdout/stderr 至现有日志系统，设置检索与保留策略；Marketplace 数据库需持久化和备份。日志落地失败不应中断业务，但基础设施必须监控日志采集健康。可用 operationId 检索一次阶段，再用 requestId/errorReference 定位 F5 HTTP 和错误事件。

## 验证范围

覆盖完整创建/评测/审批/发布契约、精确版本和实例绑定、私有访问范围、未知创建结果恢复、HTTP 401/403/5xx、错误 JSON、配置缺失、F5 请求挂起时 NeMo 并发保存、过期租约及旧结果隔离、F5 多任务协调、前端错误展示与安全冲突重试、Swagger schema 和类型检查。协议夹具仅用于自动化测试，不写入部署运行数据。

官方契约参考：[Scanner 列表](https://docs.aisecurity.f5.com/operations/get_scanners.html)、[Scanner 详情](https://docs.aisecurity.f5.com/operations/get_scanners_scannerId.html)、[Project 详情](https://docs.aisecurity.f5.com/operations/get_projects_project.html)、[版本管理](https://docs.aisecurity.f5.com/api-docs/working-with-scanner-versions.html)。

本地验证记录：166 项自动化测试通过，1 项需要专用数据库环境的测试未运行；类型检查和生产构建通过。使用现有真实 NeMo/MariaDB 注入 F5 无效配置及无法连接两种情况，均正常导入 39 条已有资源（33 个 Guardrail / NeMo Policy、6 个 Profile / NeMo Guardrail），没有创建模拟运行数据。生产 HTTP/Swagger 检查验证 15 个响应、29 个 schema、12 个操作和 14 项页面映射。真实 F5 仍待部署时验证实例版本、权限、网络及 CA。
