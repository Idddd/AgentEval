# V3 三项连接配置与共享备用配置（v0.2.23）

本文对应 `v0.2.23`，镜像 `ghcr.io/idddd/tali-ui-demo:0.2.23`。旧版 `0.2.22` 不包含此功能。内网升级应同时同步新 Chart 模板，见 `deploy/v2/UAT-token-config.md`。

## 最小连接配置

V3 演示集成需要三项连接信息：NeMo API URL、NeMo Token、数据库完整连接 URL。Chart 默认开启演示角色切换，不需要额外账号角色映射、SSO 或 `publicOrigin`。`workspaceId` 默认 `uat`；V3 自行使用 live 模式，V2 Mock 继续独立运行。

在现有 values 中合并：

```yaml
marketplace:
  guardApiUrl: https://你的NeMo域名/api/v1
```

另外两项默认从当前 namespace 的既有 Secret `tali` 读取：

| 信息 | Secret key | 内容 |
| --- | --- | --- |
| NeMo Token | `tali-guard-bootstrap-user-ini` | 原始业务 API Token，不含 `Bearer ` 前缀 |
| 数据库 URL | `tali-guard-postgresql-init` | 完整 PostgreSQL 或 MariaDB URL，含账号和密码 |

Secret 名称或 key 不同时才覆盖 `nemoTokenSecret` / `nemoTokenKey`、`databaseSecret` / `databaseUrlKey`。凭据不写入 values。默认 V3 固定使用业务 Token，不需要 NeMo 用户名/密码或 `guardAuthOrigin`。完整 DB URL 内的密码优先于旧的独立密码配置。TLS、自签 CA 按内网实际需求选配，也可直接在当前 V3 配置页面填写备用设置。

以上是连接要求，镜像、Route、资源等现有部署配置仍沿用现值。缺少或错误的真实连接只让 V3 返回带组件、错误码、配置项和请求 ID 的错误，`/api/health` 和 V2 Mock 不依赖这些连接。

## 手动备用配置

V3 登录/连接失败页面提供三个默认掩码输入框；已配置的值只显示“Configured”和掩码占位符，不回传原文。已连通后可从 Connection settings 调整。眼睛按钮仅显示本次输入，不读取已有 Secret 或已保存的值。

保存前验证 NeMo 身份和数据库连接，成功后加密、原子写入服务端。失败不覆盖上次成功配置。留空保留当前值；更换 NeMo URL 时必须同时重新输入 Token，防止将旧凭据发送到新地址。保存值优先于部署值，但不修改 Kubernetes Secret 或 values。Use deployment settings 删除手动覆盖并恢复部署配置。

此配置由整个演示实例共用，其他浏览器下次连接会使用同一份配置。浏览器不持久化连接凭据；接口、界面和应用日志不输出保存的明文。配置切换后旧页面的操作请求会被拒绝，需重新连接。

### 当前页面的可选高级设置

默认 V3 访问 `/v3/guardrails`，配置错误时直接显示此表单；已连通时点击页头 Connection settings。所有连接项均在同一个页面，无需其他隐藏页面、额外登录页或手工 API 请求。

正常使用仅填写三个主字段。Advanced settings (optional) 提供特殊环境的备用配置：

| 可选项 | 默认行为 / 用途 |
| --- | --- |
| Workspace ID | 默认 `uat`，可修复不合法的部署值或选择另一个工作区 |
| Database TLS | 默认沿用部署/URL；可选使用 URL 设置或强制验证 TLS，支持 MariaDB |
| Trusted CA | 默认沿用部署信任；可选择内置根证书，或粘贴 PEM CA 证书包用于 NeMo、F5、数据库 TLS |
| F5 integration | 默认未配置则不启用；可在页面禁用不完整的 F5 部署配置，或填写 URL、Token、项目管理员 ID 启用 |

CA、URL、Token、工作区等输入均默认掩码，已保存原文不回传。选择自定义 CA 时仍验证证书和主机名，不提供关闭 TLS 校验的开关。启用或修改 F5 时保存前验证其只读 API；修改 F5 地址也必须重新输入 Token。高级配置验证失败仍保留旧配置。

默认 V3 不受旧版 `MARKETPLACE_CRUD_ONLY`、本地 actor、自动浏览器 demo Token、authoring URL、NeMo 密码模式选择器等开关阻断；这些旧版选项无需额外设置。显式严格身份模式继续保留其部署配置约束。

按本次演示要求，所有访问者都可配置连接和切换 User / Approver / Tech；此模式没有额外的 Marketplace 权限校验。如使用严格身份模式，显式设置 `marketplace.demoRoles: false`，手动备用配置将禁用，保存的演示配置也不会用于严格模式。

## 保存期限

默认使用 Pod 的 `emptyDir`，可跨浏览器关闭、会话结束以及同一 Pod 内容器重启保留。Pod 被替换时会丢失；需要在升级、重建后保留时，挂载既有 PVC：

```yaml
replicaCount: 1
marketplace:
  connectionStorage:
    existingClaim: marketplace-connection-settings
```

Chart 不自动创建 PVC。PVC 必须允许应用 UID/组写入。加密数据和密钥均位于挂载目录，应一起保留；不要只恢复其中一个文件。该功能面向单副本演示，不提供多 Pod 同时写入协调。默认 `emptyDir` 不增加 Mock 的外部存储依赖。

## 排查

- `/api/health`：UI 存活，不检查真实依赖。
- `/api/nmgr/ready`：当前 V3 配置和数据库就绪检查。
- V3 工作区读取：同时验证 NeMo 业务 Token 和数据库。
- 使用报错中的 request ID 对应容器结构化日志，检查其 component、code、settings。

手动保存错误不清空既有配置；如果存储文件损坏，可重新填写全部三项修复，或删除手动覆盖恢复部署配置。
