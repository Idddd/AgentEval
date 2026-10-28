# UAT：已有 OCP Secret + NeMo token

适用于 v0.2.22：只部署 Marketplace，复用已有 NeMo、PostgreSQL/MariaDB。本版包含后台 token 认证和 Mock 故障隔离。旧镜像与旧 Deployment 模板不会因仅添加 values 自动获得这些功能。

## 1. 内网 values.yaml

在配置仓库 `charts/overlays/uat/tali-ui/values.yaml` 的现有内容中合并：

```yaml
replicaCount: 1
image:
  repository: 你的内网镜像仓库/tali-ui
  tag: "0.2.22"
marketplace:
  dataMode: live
  v2Live: true
  crudOnly: false
  workspaceId: uat
  publicOrigin: https://你的Marketplace域名
  guardApiUrl: https://你的NeMo域名/api/v1
  nemoSecret: ""
  nemoTokenSecret: tali
  nemoTokenKey: tali-guard-bootstrap-user-ini
  databaseSecret: tali
  databaseUrlKey: tali-guard-postgresql-init
  databasePasswordKey: ""
  databaseTls: true
  accountsConfigMap: marketplace-accounts
  caConfigMap: ""
```

`guardApiUrl` 就是新增 NeMo URL 的位置，必须为 Controller API 地址并以 `/api/v1` 结尾。设置为 Pod 能访问的实际地址，不用本机 localhost。UI 域名应与现有 Istio VirtualService 的 Host 一致；继续使用 Istio 时不必额外开启 OpenShift Route。镜像仓库、标签和 ImageStream 按原 GitOps 流程配置。

`databaseTls` 必须匹配数据库实际配置；未启用 TLS 才设 false。私有 CA 使用 `caConfigMap` 挂载 `ca.crt`，不关闭证书验证。数据库 Secret 键值必须为完整 PostgreSQL URL，包含正确应用账号密码；若密码不在 URL 内，将 `databasePasswordKey` 改成真实密码键名。不能根据键名推断它是连接串。

## 2. 内网 Chart Deployment 必须消费这些值

若使用本项目 `deploy/helm/tali-ui-demo`，模板已实现这些映射。若仍使用内网旧 Chart（`charts/manifest/tali-ui/<version>/templates/deployment.yaml`），仅添加 values 不会自动生效，需要在 Marketplace 容器的 `env` 列表合并以下内容。已有同名变量应替换，不要重复添加：

```yaml
- name: GUARD_API_URL
  value: {{ .Values.marketplace.guardApiUrl | quote }}
- name: GUARD_API_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.nemoTokenSecret | quote }}
      key: {{ .Values.marketplace.nemoTokenKey | quote }}
      optional: true
- name: MARKETPLACE_NEMO_AUTH_MODE
  value: "token"
- name: MARKETPLACE_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.databaseSecret | quote }}
      key: {{ .Values.marketplace.databaseUrlKey | quote }}
      optional: true
```

这是 URL/token/数据库连接的增量片段，不是完整 Deployment。其余 `MARKETPLACE_DATA_MODE`、`MARKETPLACE_PUBLIC_ORIGIN`、TLS/CA、accounts ConfigMap、探针和安全上下文应同步本项目完整 Chart。覆盖层需确实把该 values 文件传给 Helm；使用原 `kustomization.yaml` 的渲染方式检查最终 Deployment。不要假定内网 Chart 支持 `extraEnv`。

### v0.2.22 故障隔离必须同步的模板改动

只更新镜像或 values 不够。优先合并完整的 [deployment.yaml](../helm/tali-ui-demo/templates/deployment.yaml)，关键增量如下：

| 位置 | 新值 / 行为 |
| --- | --- |
| startupProbe、readinessProbe、livenessProbe | 全部使用 `/api/health`；真实诊断 `/api/nmgr/ready` 单独监控 |
| NeMo/F5/数据库 `secretKeyRef` | `optional: true`，避免缺失集成 Secret 阻止整个 UI 启动 |
| accounts、CA 的 `volumes[].configMap` | `optional: true`，所选文件缺失由真实 API 报错 |
| Token 模式 env | `MARKETPLACE_NEMO_AUTH_MODE=token`；密码模式设 `password`，只选一种 |
| 启用 F5 的 env | `MARKETPLACE_F5_ENABLED=true`，URL/Secret 配置一半时仍明确报错 |
| 选择独立数据库密码键的 env | `MARKETPLACE_DATABASE_PASSWORD_REQUIRED=true`；未选择独立密码键时不设置 |

这些标记是模板自动生成的环境变量，无需新增 Secret 键或 Kubernetes RBAC 权限。缺少选定的凭据时拒绝真实操作，不会退用旧 Token、另一个账号或 URL 内旧密码。真实配置完整性检查保留在 API；旧模板中因缺失真实 URL/数据库/F5 而执行的 Helm `fail` 条件也需要同步新模板，避免阻止 Mock 部署。保留应用副本数与安全上下文约束。

探针示例（对现有三个 probe 分别合并）：

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: http
```

不要将 `/api/nmgr/ready` 继续用作共享 UI 的 readiness。UI Ready 仅表示 UI 可服务，不能替代真实接口与业务流程验收。

Secret `tali` 必须与 Marketplace Pod 同 namespace；Namespace 名称另填。不要将 Secret 值写进 values 或镜像，也不用给 Pod 读取 Kubernetes Secret API 的额外权限。

## 3. 认证范围

`tali-guard-bootstrap-user-ini` 精确以 `ini` 结尾。值应为原始业务 API token（无 Bearer 前缀），需具备 NeMo policies、guardrails 读写权限。token 只用于后台业务调用，不用于浏览器登录或授予 Marketplace 角色。

当前 Marketplace UI 的独立用户身份接入仍是 UAT 页面验收前置条件。`marketplace-accounts` 只映射身份到角色，不能替代登录。OCP 不启用 `MARKETPLACE_V2_LOCAL_ACCESS`，该模式仅供回环本地测试。

## 4. 验证与更新

在目标项目按既有 GitOps 流程渲染/同步；检查最终 Deployment 的 Secret name/key、NeMo URL、镜像版本及挂载。不要输出解码后的 Secret。

```sh
oc -n <namespace> rollout status deployment/<实际Deployment名称>
# 环境变量注入的 Secret 轮换后执行：
oc -n <namespace> rollout restart deployment/<实际Deployment名称>
```

`/api/health` 检查进程；`/api/nmgr/ready` 检查配置和数据库，不证明 NeMo token 可用。实际 NeMo 权限、模型和 Runner 需在目标环境完成查询、创建、评测验收。token 失效后更新 Secret 并重启，不会自动改用其他账号。

上线后不要随意改 `workspaceId` 或 NeMo URL：二者共同确定工作区，改变 URL 会切换到另一个工作区。今后删档改 MariaDB 可更换连接串和对应密码/TLS配置，无需切换驱动代码。
