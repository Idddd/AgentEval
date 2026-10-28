# V2 Mock / V3 真实版与部署诊断

- `/v2/guardrails`：Mock，保留演示组件、交互、角色切换和浏览器数据。
- `/v3/guardrails`：真实版，使用服务端配置与真实账号权限。
- `/v2-mock/guardrails`：兼容旧 Mock 链接，query 和 hash 继续可用。
- `/v2/import`（兼容 `/v2-mock/import`）：仅导入 Mock；`/v3/import` 不开放导入。
- 无版本前缀的书签默认进入 V2 Mock；原真实版书签需改为 `/v3`。

浏览器存储键、`MARKETPLACE_V2_*` 环境变量、Helm `marketplace.v2Live` 和镜像/脚本文件名保持兼容。Mock 数据不会迁入真实数据库；真实版错误不会自动回退成 Mock。

## 关联页面和日志

真实版错误显示 code、component、需检查的环境变量名和 Reference。相同编号出现在 API JSON 的 `error.requestId`、`X-Request-ID` 响应头和服务端 JSON 日志中。日志包含时间、operation、status、component、code、settings、requestId，不输出原始异常、连接串、账号映射、请求体、密码、Token 或上游响应体。工作流同步失败将编号保存在操作提示里；资源查询失败也显示编号。写入结果未知时先 Reconcile，不能盲目重复创建。

```sh
oc logs deployment/marketplace-v2 --since=30m | grep '页面 Reference 编号'
oc logs deployment/marketplace-v2 --previous
```

客户端连接失败、超时或收到 HTML 时，浏览器控制台输出 `workspace_request_failed` 事件和本地编号。未到达 API 的请求不会在服务端留下该编号。`api_response_invalid` 常见于仅部署静态页面或反向代理将 `/api` 回退到 `index.html`；检查 Network 的状态码和 Content-Type。`workspace_render_failed` 指向前端资源或渲染问题，检查静态资源路径、UI/API 版本与 HTML 缓存。页面提供重试和手动进入 Mock 的链接。

## 排查对应关系

| 组件 / 错误码 | 首先检查 |
| --- | --- |
| runtime / live_mode_required | `MARKETPLACE_DATA_MODE=live`；真实版要求 `MARKETPLACE_CRUD_ONLY=false`；静态预览不提供真实 API。 |
| origin / public_origin_*、origin_mismatch | `MARKETPLACE_PUBLIC_ORIGIN` 等于浏览器实际 HTTP(S) origin，不带路径或尾斜杠；核对 Ingress 域名。 |
| database_config_invalid | `MARKETPLACE_DATABASE_URL` 含 PostgreSQL/MariaDB 协议、用户名、主机、库名；独立密码 Secret 键与可读 CA 文件。 |
| database_auth_failed | URL 用户名、`MARKETPLACE_DATABASE_PASSWORD` 或 URL 编码密码、Secret 名称和键。 |
| database_not_found / database_permission_denied | 库已创建；应用账号在专用库/schema 有建表和读写权限。 |
| database_unreachable / database_tls_failed | DNS、端口、NetworkPolicy、`MARKETPLACE_DB_TLS`、`MARKETPLACE_DB_CA_FILE` 与证书主机名。 |
| identity / account_mapping_* | `MARKETPLACE_V2_ACCOUNTS_FILE` 挂载和 JSON，或 `MARKETPLACE_V2_ACCOUNTS_JSON`；用户 ID 必须与 NeMo 一致。 |
| identity / identity_unavailable | 浏览器用户身份/SSO 转发。后台 NeMo Token 不能替代用户登录；OCP 不能开启 loopback 固定身份绕过认证。 |
| nemo / nemo_url_*、nemo_response_invalid | `GUARD_API_URL` 以 `/api/v1` 结尾；网关、Content-Type、API 版本。 |
| nemo / nemo_token_*、nemo_credentials_missing、nemo_sign_in_failed | `GUARD_API_TOKEN_FILE` / `GUARD_API_TOKEN` 或 `GUARD_USERNAME` + `GUARD_PASSWORD_FILE` / `GUARD_PASSWORD`，文件可读且权限正确；选定的 Token 无效时不会切换到密码账号。 |
| nemo / upstream_unavailable、nemo_unreachable | NeMo DNS/端口/NetworkPolicy、`NODE_EXTRA_CA_CERTS`、`GUARD_AUTH_ORIGIN`、服务账号权限。 |
| f5 / f5_config_invalid、f5_http_*、f5_unreachable | `F5_API_URL` 为 HTTPS `/backend/v1`，Token/文件、权限、DNS/网络与 CA。完全不配 F5 为仅 NeMo 模式；配置一半会报错。 |

## 探针与 Pod 无法启动

`/api/health` 仅表示进程存活。`/api/nmgr/ready` 检查真实配置、账号映射和数据库读取；明确返回 `database: reachable`、`identity: mapping_configured`、`nemo/f5: not_probed`，未启用 F5 为 `not_configured`。Ready 不代表 NeMo/F5 已接受凭证，也不代表 Runner、推理或发布可用，仍需真实流程验收。

当前离线包的 Docker 健康检查和 OCP 三类探针统一使用 `/api/health`，保证真实依赖错误不会把共享 UI/Mock 从 Service 摘除。`/api/nmgr/ready` 作为独立的真实集成诊断保留，必须单独监控，不再用它决定 Mock 的可访问性。

NeMo/F5/数据库 Secret 引用及账号/CA ConfigMap 挂载允许缺失，让 UI 先启动；真实 API 会拒绝缺失输入并输出相应错误。Chart 设置的 `MARKETPLACE_NEMO_AUTH_MODE`、`MARKETPLACE_F5_ENABLED`、`MARKETPLACE_DATABASE_PASSWORD_REQUIRED` 保留已选择的配置来源，缺少 Secret 时不会退用另一账号或 URL 内旧密码。Token 和密码同时选择时返回 `nemo_auth_mode_invalid`。这不放宽认证、权限或 TLS 校验；真实模式不会自动变为 Mock。

若 Pod 处于 `CreateContainerConfigError`，应用尚未启动，无法生成应用日志。执行：

```sh
oc get pods
oc describe pod POD_NAME
oc get events --sort-by=.lastTimestamp
```

按 Events 核对 Secret/ConfigMap 名称、键、挂载、镜像和资源限制，不要打印 Secret 内容。当前 Chart 的集成引用允许缺失；自定义非可选挂载、镜像/存储/调度问题仍可能阻止容器启动，需查 Events。修正后重新部署，再检查 `/api/nmgr/ready` 与真实操作。`deploy/v2/check-nemo.mjs` 只检查只读 API 声明，不代替身份/权限/发布验收。

## 本地验证记录

1102 项测试通过、9 项跳过；类型检查、静态预览构建、Nitro 部署构建通过。构建产物实际 HTTP 验证 7 类错误配置，响应、X-Request-ID 与日志编号一致。浏览器验证 V2 Mock、V3 错误页及返回 Mock。尚未执行目标 OCP 环境或真实 NeMo/F5 的部署验收。
