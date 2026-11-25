# UAT 升级到 v0.2.32

镜像 `ghcr.io/idddd/tali-ui-demo:0.2.32`，Chart `oci://ghcr.io/idddd/charts/tali-ui-demo`，版本 `0.2.32`。默认 V3 演示只需 NeMo URL、业务 Token、完整 DB URL，保留三角色切换，无需 SSO 或账号映射。Mock 继续独立运行。独立评测是可选连接，见[配置示例](../values.evaluation.example.yaml)。

## 现有 values.yaml 最小改动

将版本合并到内网部署使用的 values 文件，并保留现有镜像仓库、Istio 和资源设置。新部署可在 V3 配置页填写 NeMo 和 F5 的连接值。

```yaml
image:
  tag: "0.2.32"
```

本版 Chart 默认使用正式版镜像标签，示例 values 继承 Chart 的镜像仓库。使用内网镜像仓库时，先上传同版本镜像，再在实际部署 values 中填写 `image.repository`，并按仓库要求配置 `imagePullSecrets`。

使用本版 Chart 时，另外两项默认读取同 namespace 既有 Secret `tali`：

| 信息 | 默认 Secret key | 值 |
| --- | --- | --- |
| NeMo Token | `tali-guard-bootstrap-user-ini` | 原始业务 API Token，无 Bearer 前缀；精确以 ini 结尾 |
| 数据库 URL | `tali-guard-postgresql-init` | 完整 PostgreSQL/MariaDB URL，含正确账号密码，不是初始化 SQL、JSON 或裸密码 |

如果已有值正确，Secret 不需要新增或重建。名称不同时才覆盖 `nemoTokenSecret` / `nemoTokenKey`、`databaseSecret` / `databaseUrlKey`。Token、DB URL 不写入 values 或镜像。完整 DB URL 中的密码优先于旧独立密码配置。

默认值已包含 `demoRoles: true`、`workspaceId: uat`；默认 V3 自行进入 live 模式，不要求额外配置 `dataMode`、`v2Live`、`crudOnly`、`publicOrigin`、`guardAuthOrigin`、`accountsConfigMap` 或本地固定身份。保留原 workspaceId 和 NeMo URL 可延续原工作区；两者改变会切换工作区。

如果 Istio/Ingress 将请求主机改写成内部 Service 名，V3 Demo 可识别浏览器标记的同源请求。需要显式固定来源时，在部署 values 的 `marketplace.publicOrigin` 填浏览器实际访问的 Marketplace origin，省略路径和尾斜杠。页面与 `/api` 使用同一个对外地址。

默认 V3 仅对配置的 NeMo API 跳过证书校验，不影响 Evaluate、F5 和数据库。需要开启 NeMo 验证时配置 `marketplace.nemoTls: verify`，或在 V3 配置页选择 Verify certificate；默认跳过无需新增配置。CA、DB TLS、F5 可继续沿用已有部署值，也可以在同页修复。不要因升级而更改现有数据库 TLS 策略。

正式 UI 通过同域网关调用 `/api/nmgr/*`。保持 `/api` 路径及子路径原样转发；Swagger 为 `/api/docs`，其本地 JS/CSS 使用 `/api/docs/*`，契约为 `/api/openapi.json`，列表为 `/api/endpoints`。同域调用无需配置 CORS。使用独立前端时，在严格模式的 V3 高级配置中填写前端 origin，再使用用户 Bearer Token 调用 `/api/nmgr/v1/*`。

从之前版本升级，原有 NeMo 流程无新增必填连接项；镜像和 Chart 同步到 0.2.32。使用自维护模板且需要通过 values 控制 NeMo TLS 时，增加以下可选映射：

```yaml
- name: MARKETPLACE_NEMO_TLS
  value: {{ .Values.marketplace.nemoTls | default "skip" | quote }}
```

未注入此 env 时默认 V3 仍使用 skip。已保存的同页备用设置优先于部署值，修改部署配置后需按需清除旧手动覆盖。

## 旧内网 Chart 必须同步模板

若使用本次发布的 Chart，模板已包含全部改动。若内网仍维护 `charts/manifest/tali-ui/<version>/templates/deployment.yaml`，**只改 image.tag 和 values 不够**。优先合并本版完整 `deploy/helm/tali-ui-demo/templates/deployment.yaml` 及默认 values，至少同步：

1. 注入三项连接信息（已有同名 env 替换，避免重复）：

```yaml
- name: GUARD_API_URL
  value: {{ .Values.marketplace.guardApiUrl | quote }}
- name: GUARD_API_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.nemoTokenSecret | default "tali" | quote }}
      key: {{ .Values.marketplace.nemoTokenKey | default "tali-guard-bootstrap-user-ini" | quote }}
      optional: true
- name: MARKETPLACE_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.marketplace.databaseSecret | default "tali" | quote }}
      key: {{ .Values.marketplace.databaseUrlKey | default "tali-guard-postgresql-init" | quote }}
      optional: true
```

2. 添加共享备用配置目录 env 和可写挂载。以下为无 PVC 的最小例子，分别合并到容器的 `env`、`volumeMounts` 和 Pod 的 `volumes`：

```yaml
# containers[].env
- name: MARKETPLACE_V3_DEMO
  value: "true"
- name: MARKETPLACE_CONNECTION_DIR
  value: /var/lib/marketplace/connection
- name: MARKETPLACE_CONNECTION_PERSISTENT
  value: "false"
# containers[].volumeMounts
- name: connection-settings
  mountPath: /var/lib/marketplace/connection
# spec.template.spec.volumes
- name: connection-settings
  emptyDir: {}
```

这几个 env 由新 Chart 自动生成，不是额外必填的用户连接参数；目录保存加密配置与密钥，不存浏览器 Cookie。保留原 `/tmp` 可写挂载、只读根文件系统及 OCP restricted SCC 的动态 UID 策略。

3. startup/readiness/liveness 探针全部使用 `/api/health`。`/api/nmgr/ready` 仅作为真实配置/DB 诊断，不用于共享 UI Service 的 readiness。
4. NeMo/F5/数据库 Secret 引用，以及可选 accounts/CA ConfigMap 引用使用 `optional: true`。删除旧模板中强制要求真实连接值或账号映射的 Helm `fail` 条件，使缺失配置能进入 V3 配置页且不阻止 Mock 启动。

无需新增 Kubernetes RBAC，也无需让应用调用 Secret API。现有 Istio/域名规则不变，不额外启用 OpenShift Route。

## 保存配置跨 Pod 重建（可选）

默认 emptyDir 可跨浏览器会话及同 Pod 容器重启保留；Pod 替换会清空手动备用配置。需要升级、重建后保留时，在新 Chart 中指定既有 PVC：

```yaml
marketplace:
  connectionStorage:
    existingClaim: marketplace-connection-settings
```

Chart 不自动创建 PVC。旧自维护模板则将上述 volume 替换为 persistentVolumeClaim，并将 `MARKETPLACE_CONNECTION_PERSISTENT` 设为 `true`。卷权限必须允许实际 Pod UID 读取、写入目录及加密文件；数据文件和密钥必须一起保留。单副本沿用默认 `replicaCount: 1`，不支持多个 Pod 并发修改此配置。

## 同页备用配置与验收

直接打开 `/v3/guardrails`。NeMo URL、Token 或 Database URL 缺失时自动进入 `/v3/guardrails#connection`。已配置后不显示 Connection settings 按钮，需在地址栏手动输入 `/v3/guardrails#connection`；连接故障仅显示错误和重试。主配置页提供 NeMo、F5 和数据库分组；F5 可选择 Enabled，再填写 URL、Token 和可选项目管理员 ID，并分别测试 URL/Token。输入留空保留原值；保存前检查依赖，失败不覆盖旧配置；更改 NeMo/F5 URL 必须同时重新输入该服务 Token。高级项包含 Workspace ID、DB TLS 和可信 CA。所有访问者共用服务端加密保存值。Use deployment settings 删除手动覆盖，重新使用 Secret/YAML；后续轮换部署 Secret 时可用此入口取消已保存的旧覆盖。

默认演示模式允许所有访问者切换角色和修改连接，不做额外 Marketplace 用户权限。只有显式选择 `marketplace.demoRoles: false` 才进入严格身份模式，该模式要求独立用户认证/账号映射，并禁用及忽略手动演示配置。

按现有 GitOps 流程同步后执行：

```sh
oc -n <namespace> rollout status deployment/<实际Deployment名称>
```

检查 `/api/health`、V2 Mock、V3 连接和一次真实读取。V3 错误包含组件、错误码、配置项和 Reference；使用 Reference 查询容器结构化日志。UI 健康不代表模型、Runner 或真实评测已就绪。环境变量方式轮换 Secret 后按原流程重启 Pod；不要输出解码后的 Secret。
