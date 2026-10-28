# Marketplace V3 真实版 / V2 Mock 内网交付

这个包部署 Marketplace V3 真实版，并保留 V2 Mock 入口。交付目录、镜像名和配置键延用 V2 命名以兼容已有部署。复用内网已有的 NeMo 与 PostgreSQL/MariaDB，可选接入已有 F5 AI Security；不安装后端或模型服务。镜像不包含本地测试数据、API key 或数据库密码，运行时不需要联网安装依赖。

## 包内容

- `marketplace-v2.tar`：Linux amd64 镜像，通过 Docker/Podman 导入。
- `helm/`：无外部 chart 依赖的 OCP 部署模板。
- `values.uat.yaml`：镜像仓库、UI 域名、NeMo 地址与配置引用。
- `accounts.json`：已有 NeMo 用户 ID 到 Marketplace 三角色/部门的映射。
- `database.env.example`、`marketplace.env.example`：数据库与容器运行时配置示例。
- `nemo.env.example`：后台 NeMo token / 账号密码 Secret 配置示例。
- `f5.env.example`：可选 F5 服务端令牌 Secret 示例。
- `manifest.json`、`SHA256SUMS`：镜像标识与文件校验值。
- `mock-isolation-validation.md`、`isolation-test-results.json`：当前镜像的故障隔离验证及边界。
- `verify-ui-isolation.mjs`：使用 Docker 和合成配置复查故障隔离，不访问真实后端。

无需重建前端或镜像即可修改连接配置。首次接入仍需填入有效的数据库凭证与账号映射，并保证网络、证书和 NeMo 接口版本兼容。

## 兼容要求

本包已对接 `tasklattice/tasklattice-guard` 提交 `9a1971b81b38e2848641289cf7ce51aab544be28` 的 Controller/Runner API，PostgreSQL 17 与 MariaDB 11.4。内网 NeMo 必须提供 Policy definition/test-runs/publish 和 Guardrail frozen-version test/release 接口。F5 按 2026-10-21 官方文档实现并做契约测试，未连接真实 F5 验收。不能假定任意旧版后端只改地址就兼容。

NeMo 连接使用后台配置的 **user** 业务账号 PAT，或邮箱和密码；PAT 需具有 policies、guardrails 读写权限，平台 admin token、Runner token 或初始化凭证不能替代业务 API token。Marketplace 的 `User`（提交）、`User Admin`（审批）、`IT Admin`（实现/评测/发布）由 `accounts.json` 分配；相同 unit 才共享业务记录，Tech 可处理各部门请求。审批账号必须与提交人不同。

UAT 使用 Secret `tali` 中的 `tali-guard-bootstrap-user-ini`（精确拼写，不带末尾 t）注入 `GUARD_API_TOKEN`，服务端自动添加 `Authorization: Bearer ...`。Secret 值只放原始 token，不带 Bearer 前缀，也不是 JSON。也支持 `GUARD_API_TOKEN_FILE` 读取挂载文件；文件优先于环境变量，token 优先于密码。token 缺失、格式错误或被拒绝时不会回退到密码或浏览器凭证；401/403 返回不含上游详情的错误，不自动重试写入。环境变量方式轮换 Secret 后须重启 Pod；文件方式在下一次 API 请求创建客户端时读取新值。

已有离线镜像未因源码修改而自动更新，旧镜像不支持新增 token 变量；采用此功能需使用包含该改动的新镜像。内网 GitOps 配置详见 [UAT token 配置](UAT-token-config.md)。

后台配置 `GUARD_USERNAME` 和 `GUARD_PASSWORD_FILE`（挂载的私密密码文件），也支持 Secret 注入 `GUARD_PASSWORD`。后端自动调用 NeMo `/api/auth/sign-in/email`，仅在进程内存中保留会话，收到 401 后重新登录并重试一次；网络超时或不确定写入结果不会自动重试。并发请求共享一次登录，登录失败后冷却 30 秒。NeMo 密码、Cookie 和 Token 均不发给浏览器，也不写入业务数据库或镜像。参见 `nemo.env.example`。不要配置 `MARKETPLACE_DEMO_TOKEN` 自动绕过登录。

本地测试可设 `MARKETPLACE_V2_LOCAL_ACCESS=true`，并将 `MARKETPLACE_V2_LOCAL_ACTOR_ID` 指向 `accounts.json` 中的固定身份。页面直接进入且显示 Local test identity，不显示任何登录凭据表单。该模式要求 `MARKETPLACE_PUBLIC_ORIGIN` 为 loopback 地址，并且容器端口必须只绑定 `127.0.0.1`；不允许在 OCP 域名启用。固定身份不是多用户认证，不能用它验证提交人与审批人分离。前端不能选择角色，切换本地身份须修改后台配置并重启。

内网部署仍需独立 Marketplace 用户认证/SSO 接入，不能把 NeMo 后台服务账号当成所有人的身份。本次按要求只开放本地固定身份测试；现有 PAT API 保留供兼容自动化鉴权，但新 UI 不再提供 PAT 输入框。未接入独立身份的内网 UI 会拒绝访问，不可直接宣称已具备多用户生产登录能力。

仅密码模式需要 NeMo 启用邮箱密码登录，并允许 Marketplace 服务端访问 `/api/auth/sign-in/email`。如果 `guardApiUrl` 使用集群内部主机名，而 NeMo 配置的可信 Origin 是另一个域名，将 `marketplace.guardAuthOrigin`（容器变量 `GUARD_AUTH_ORIGIN`）设为 NeMo 已信任的完整 Origin。token 模式不调用密码登录接口。内网连接使用 HTTPS 保护凭证传输。

数据库需事先准备 Marketplace 专用库和账号（建议库名 `marketplace_uat`）。应用首次连接会创建 `marketplace_*` 业务表，不会自动删除、迁移或清空已有数据。NeMo 始终通过 API 对接，不直接读取 NeMo 的业务表。

- PostgreSQL：支持 `postgresql://`、`postgres://`；账号需 CONNECT、目标 schema 的 USAGE/CREATE 和业务表读写权限。默认 schema 为 `public`；也可用 `?schema=marketplace` 指定预先创建、应用账号拥有的 schema。不要直接把 Marketplace 表写入 NeMo 的业务 schema。
- MariaDB：支持 `mariadb://`、`mysql://`；使用 utf8mb4 专用库，账号具有该库的 SELECT、INSERT、UPDATE、DELETE、CREATE、ALTER、INDEX、REFERENCES 权限。
- `MARKETPLACE_DATABASE_PASSWORD` 如有配置，优先于 URL 内密码，原样传入驱动，不需要 URL 编码；未设置时仍支持 URL 内编码过的密码。两种方式使用的密码必须属于 URL 中的用户名。
- TLS 由 `MARKETPLACE_DB_TLS` 和 `MARKETPLACE_DB_CA_FILE` 配置；PostgreSQL URL 也支持 `sslmode=disable/require/verify-ca/verify-full`，所有启用 TLS 的模式均严格校验证书。拒绝矛盾设置和不支持的 URL 参数，不静默降低校验。

### UAT Secret 与之后的 MariaDB 切换

交付的 `values.uat.yaml` 已设置以下映射。Secret 必须与 Marketplace Pod 在同一 namespace；不用把密码写进 GitOps values，也不用给应用读取 OCP Secret API 的权限。

```yaml
marketplace:
  nemoSecret: ""
  nemoTokenSecret: tali
  nemoTokenKey: tali-guard-bootstrap-user-ini
  databaseSecret: tali
  databaseUrlKey: tali-guard-postgresql-init
  databasePasswordKey: ""
```

`tali-guard-postgresql-init` 必须是含协议、主机、用户名、密码、数据库名的完整 URL，不能是初始化脚本、JSON 或裸密码。若密码单独存储，将 `databasePasswordKey` 设为同一 Secret 内的实际密码键名，且必须对应该 URL 的用户。`tali` 是 Secret 名称，不代表 namespace。

删档测试结束后，停止 Marketplace 写入，准备空的 MariaDB 专用库和账号，将上述映射指向 MariaDB 的 Secret（或者更新专用于 Marketplace 的 Secret）。URL 改为 `mariadb://marketplace@mariadb.internal:3306/marketplace_uat`，更新密码及 TLS 设置后重新部署 Pod。同一镜像按 URL 选择驱动，无需重新打包；新库呈现空工作区。系统不会自动复制 PostgreSQL 数据，也不会删除 NeMo/F5 中已创建的资源。不要修改或删除仍被 NeMo 使用的共享 Secret/数据库。

## OCP 安装

1. 验证 `SHA256SUMS`，导入并推送到内网镜像仓库；标签以 `manifest.json` 为准：

```sh
sha256sum -c SHA256SUMS
podman load -i marketplace-v2.tar
podman tag marketplace-v2:uat-20261028-mock-isolation registry.internal/project/marketplace-v2:uat-20261028-mock-isolation
podman push registry.internal/project/marketplace-v2:uat-20261028-mock-isolation
```

2. 编辑 `values.uat.yaml`：`image.repository/tag`、`openshift.route.host`、`marketplace.publicOrigin`（完整 UI origin，不带路径/尾斜杠）、`marketplace.guardApiUrl`（以 `/api/v1` 结尾）。保持 `dataMode: live`、`v2Live: true`、`crudOnly: false`、单副本。

3. 确认目标 namespace 已有 `tali` Secret 及以上两个键，填写 `accounts.json` 的用户 ID、显示名和部门。不需要重新创建或覆盖已有 Secret。然后在目标 OCP 项目执行：

```sh
oc project YOUR_PROJECT
oc create configmap marketplace-accounts --from-file=accounts.json --dry-run=client -o yaml | oc apply -f -
helm upgrade --install marketplace-v2 ./helm -f values.uat.yaml --wait --timeout 5m
oc rollout status deployment/marketplace-v2
```

若不复用现有 Secret，可用 `database.env.example` 创建专用的 `marketplace-database` Secret，再把 values 的 `databaseSecret`、`databaseUrlKey`、`databasePasswordKey` 分别设为 `marketplace-database`、`MARKETPLACE_DATABASE_URL`、`MARKETPLACE_DATABASE_PASSWORD`。

若内网使用私有 CA，将可信 PEM 证书链保存为 `ca.crt`，创建 `oc create configmap marketplace-ca --from-file=ca.crt`，将 `marketplace.caConfigMap` 设为 `marketplace-ca`。NeMo HTTPS 与数据库 TLS 共用该信任包；需要时包含两者 CA。`databaseTls` 应与现有数据库的 TLS 设置一致；`sslmode` 启用 TLS 时也应将该值设为 true 以挂载私有 CA。不要关闭证书校验来绕过错误。

OCP 使用现有 restricted SCC 分配的 UID，非 root、只读根文件系统，临时目录使用 emptyDir。镜像仓库需要鉴权时，配置 `imagePullSecrets`。

4. 检查已有 NeMo API：

```sh
oc exec deployment/marketplace-v2 -- node /opt/marketplace/check-nemo.mjs
```

该检查只读 `/api/openapi.json`；网关若限制该文档地址，请由 NeMo 管理员核对以上 API。通过仅证明接口声明与配置可读，不代替实际验收。

5. **内网 UI 验收前置条件：先完成独立 Marketplace 用户认证/SSO 对接。** 此镜像的后台 NeMo 密码连接已实现，但当前直接进入模式仅供 loopback 本地测试，OCP 默认关闭，不提供前端 Token 或 NeMo 密码输入框。独立身份接入完成后，再以不同身份验收提交、实现/评测、审批和发布；禁止通过在 OCP 打开固定身份模式来绕过认证。

同一镜像保留两个独立入口：`/v3/guardrails` 为真实版，`/v2/guardrails` 为 Mock 演示版。页面顶部显示当前模式并提供切换链接。Mock 无需登录，使用独立浏览器存储，不调用 NeMo/F5，也不写 Marketplace 数据库；演示导入地址为 `/v2/import`。真实入口配置失效时显示错误，不自动切换为 Mock。

## 状态与使用边界

- Guardrail 是 NeMo 中可复用的 Policy；Profile 是绑定已发布策略版本的 NeMo Guardrail。Profile 在提交审批时固定策略版本，审批不会自动激活。
- 真实版 User 新建 Guardrail 仅保存业务需求，等待 Tech 选择 Source。Tech 选择 NeMo 并保存实现时创建未发布 Policy 草稿并回读确认；同一业务修订后续编辑、评测复用该 Policy。Profile 保存时即创建远端 Guardrail，之后复用该 ID 完成测试与发布。新业务修订使用独立资源，保留旧已发布绑定。
- 列表与详情单独显示草稿同步状态和确认时间。同步未完成时阻止后续评测/审批；原作者或 Tech 可执行 Reconcile。明确的配置校验拒绝（400/422）允许按原角色修改草稿后重新同步；修订冲突和结果未知仍禁止编辑。Profile 创建响应丢失时，需要在 NeMo 查到精确资源 ID 后填写，系统校验内容后恢复，不按名称认领、不盲目再次创建。远端修订冲突需先核对并解决，系统不会覆盖外部修改。
- Profile 发布依次执行草稿测试、生成冻结版本、版本测试、release。页面显示 NeMo 返回的结果；没有模拟成功或模拟流量。
- `Released to NeMo` 表示版本已可供 NeMo 使用。已有 Endpoint/Router 如何引用该版本由内网 NeMo 服务管理，不能仅凭这个状态宣称实际业务流量已受保护。
- 评测失败会保留真实报告。发布连接中断时保留待核对状态，由发起 Tech 账号执行 `Reconcile with NeMo`；页面打开且同一账号在线时继续处理待执行步骤。关闭页面不会把进行中的操作改为成功。
- 自定义 Policy 的验收用例来自 JSON 中的 tests；关键词/正则用例格式见下文。模型类检测仍需要已有 NeMo 服务自身的模型配置，Marketplace 不接收 DeepSeek/NVIDIA 模型 key。
- 当前不连接流量监控，也不自动导入原有 NeMo 所有资源；V2 展示自己保存和管理的业务记录。

测试集示例（实际内容要与配置规则对应）：

```json
[
  {"input":"marketplace-secret","expected":"block","phase":"input"},
  {"input":"hello world","expected":"allow","phase":"input"}
]
```

## 配置修改与故障定位

修改地址后重新执行 Helm upgrade；修改账号 ConfigMap 后刷新页面即可。更改 DB 连接 Secret 或 CA 后执行 `oc rollout restart deployment/marketplace-v2`。工作区标识与 NeMo 地址共同隔离数据；更换 NeMo URL 会进入独立工作区，原数据仍在原数据库。相同 NeMo 的网关地址迁移也应先规划数据迁移，不要在上线后随意改 URL。

Docker 健康检查和 OCP startup/readiness/liveness 探针统一使用 `/api/health`，保证真实集成错误不摘除共享 UI/Mock。`/api/nmgr/ready` 检查真实运行时配置与数据库，须作为独立诊断监控，不要设为共享 UI 的就绪探针。UI Ready 不代表真实服务可用；NeMo 账号权限、检测模型及 Runner 就绪仍须通过真实流程验证。

集成 Secret/ConfigMap 引用允许缺失以便 UI 先启动；访问 V3 时会显示错误码、组件、配置变量名和 Reference。Chart 用 `MARKETPLACE_NEMO_AUTH_MODE`、`MARKETPLACE_F5_ENABLED`、`MARKETPLACE_DATABASE_PASSWORD_REQUIRED` 保留明确选择的来源，缺失 Token/密码时不会退用另一套旧凭据；认证和 TLS 校验仍然严格。修复 Secret 或 CA 后按上述步骤重启 Pod，再检查真实诊断。

- 401：检查独立用户身份接入或自动化 PAT。后台 NeMo 会话过期由服务端自动重新登录。
- 403：检查 NeMo user 类型、accounts.json 的 userId/部门映射和可信 Origin；自动化 PAT 请求另需校验令牌权限。
- 503 / automatic sign-in unavailable：管理员检查后台 NeMo 账号密码、Origin 和服务连通性；登录失败冷却 30 秒后重试。
- 409：刷新并核对冲突或未完成的 NeMo 操作。
- 422：按提示修正配置、测试样本或生命周期操作。
- 503/就绪探针失败：核对地址、DNS/网络、可信 CA、数据库及配置挂载。

升级前备份 Marketplace 专用数据库。不要删除数据库来处理连接问题。应用的数据库版本会阻止不兼容的旧镜像直接使用新模式。PostgreSQL 和 MariaDB 的备份不可互换；删档切换按上文使用空库。

实际内网连通性、目标 NeMo 版本、OCP 准入和业务流量验收需在目标环境完成；本包不会自动修改现有 NeMo 的路由或模型绑定。

## 可选 F5 接入

登录和三角色权限继续使用 NeMo PAT 与 Marketplace accounts.json。F5 使用服务端专用凭证；用户不需要在页面填 F5 key，令牌不会发送到浏览器。所有操作仍按当前 Marketplace 用户审计。未配置 F5 时，NeMo 正常工作，创建表单不提供 F5。

1. 复制 `f5.env.example` 为私密的 `f5.env`，填写具有 Scanner 创建/读取/版本发布/访问范围管理、Project 创建/读取/修改及 scan 权限的 F5 服务令牌。
2. 在 OCP 项目创建 Secret：

```sh
oc create secret generic marketplace-f5 --from-env-file=f5.env --dry-run=client -o yaml | oc apply -f -
```

3. 在 `values.uat.yaml` 的 marketplace 下填写 `f5ApiUrl: https://f5.internal/backend/v1` 和 `f5Secret: marketplace-f5`。全局/Project 类型令牌创建 Project 时，F5 要求提供管理员用户 ID：将 `f5ProjectAdminIds` 填为逗号分隔的真实 F5 user ID。使用用户令牌时默认创建者为管理员。执行 Helm upgrade；换 token 后重启 Deployment。私有 CA 复用 `caConfigMap`，不关闭证书校验。
4. 普通容器可设置 `F5_API_URL`，并通过只读文件 `F5_API_TOKEN_FILE` 或私密环境变量 `F5_API_TOKEN` 提供凭证。配置完全在运行时读取，不需要重建镜像。

V2 的 Source 由 Tech 在 Guardrail 实现环节选择，User 新建表单不显示 Source，后台拒绝 User 提交来源字段；首次选定后不能更换。Profile 自动继承所选已发布 Guardrail 的来源，不能混用 NeMo/F5。旧记录保留原来源及远端绑定。F5 Guardrail 对应 Scanner，Profile 对应 Project。支持 keyword、regex、GenAI 三种 Scanner；GenAI 内容是 F5 检测指令，regex 使用 F5 的 Python 正则语法并由服务端验证；版本名限 1–100 个字母、数字、下划线或连字符。

评测上传上面的 cases JSON，每个配置方向至少一个 block 样本。每次评测创建独立的非全局、未发布 Scanner 和专用测试 Project；按固定 version ID 逐条调用 F5 `/scans`。只接受返回的同 Scanner、同版本、同方向结果，缺少版本证据时保持待处理，不显示假成功。测试 Project 和 Scanner 保留供审计，需要由管理员按保留策略清理。

审批后发布 Scanner 使用 `published=true,push=false`，不会向其他 Project 推送。Profile 发布为本次修订创建独立 Project，赋予引用 Scanner 对该 Project 的可见权限，固定已审批的版本并 GET 回读确认。此状态表示配置已保存到 F5；没有自动修改业务应用的 Project 绑定，也不表示线上流量已经切换。F5 Profile 发布不宣称已执行整体 Profile 扫描。

写请求超时或进程中断时，操作进入待确认状态。若在创建阶段丢失响应，在 F5 中查到此次 `mp-<操作 UUID>` 资源后，在 V2 填写精确的 Remote resource ID 并点 Reconcile；系统会核对资源内容，不按相似名称猜测，也不盲目重新 POST。后续阶段可点 Reconcile 回读/继续；扫描重试可能产生额外扫描记录。无对应资源时先由管理员核实失败原因，不以重复创建绕过待确认状态。

F5 URL 标识实例。上线后改地址会阻止旧记录继续写入，需恢复原地址或规划迁移。不会自动导入、删除或接管已有 F5 Projects；不提供未经实证的 Activate/Deactivate 开关，不把 `/access` 当作启停接口。

内网验收需确认：上述权限、未发布版本测试支持、`scannerVersionMeta.id` 回传、Project 精确版本绑定和业务应用使用指定 Project。文档依据：[Scanner 创建](https://docs.aisecurity.f5.com/operations/post_scanners.html)、[版本发布](https://docs.aisecurity.f5.com/operations/patch_scanners_scannerId_versions_versionId.html)、[Project 创建](https://docs.aisecurity.f5.com/operations/post_projects.html)、[Project 更新](https://docs.aisecurity.f5.com/operations/patch_projects_project.html)、[扫描](https://docs.aisecurity.f5.com/operations/post_scans.html)。

## 主动查询后端状态

在 V3 点击 `Refresh backend status`，会按当前账号权限读取工作区记录，并主动查询其关联的 NeMo/F5 资源。列表与详情显示结果和查询时间；可区分当前修订未关联资源、资源可读取、版本/绑定差异、远端未找到、查询失败和 F5 实例配置变化。一个资源失败不会阻止其他查询。

此操作不会导入后端全部存量数据，也不创建/修改/发布资源，不覆盖 Marketplace 审批与评测状态。结果是查询时的只读观察，不表示整个配置已完全一致或流量已生效。工作区修订变化或重新登录后清除旧查询结果。Save 的草稿同步与此只读刷新独立；页面在线时可续跑待执行任务，后台 NeMo 会话仅保留在服务进程内存中；当前任务由页面续跑，不保证关闭页面后继续执行未完成步骤。

## 部署诊断

配置缺失、数据库与 NeMo/F5 失败会返回错误码、组件、配置变量名和 Reference，并写入对应 JSON 日志。排查步骤见源码中的 [V3 部署诊断](../../docs/uat/2026-10-28-v3-deployment-diagnostics.md)，离线包内为 deployment-diagnostics.md。旧 /v2-mock 地址继续作为 Mock 别名；真实版请更新为 /v3。
