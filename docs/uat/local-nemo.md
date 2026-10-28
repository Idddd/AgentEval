# Marketplace 与现有 NeMo 接入

交付范围是 Marketplace UI 及其服务端接口、MariaDB 业务数据。内网复用已有 NeMo，F5 暂缓。下面的本地 NeMo 仅用于兼容测试，不随 UI 部署到 OCP。

## 本次验证

- Marketplace 工作分支：`integration/nmgr-v0217`（基线 v0.2.21）。
- 本地 NeMo：`tasklattice/tasklattice-guard` 提交 `9a1971b81b38e2848641289cf7ce51aab544be28`。
- UI：`http://127.0.0.1:18082/v3/guardrails`；Controller：`http://127.0.0.1:18083`；Runner：`http://127.0.0.1:18091`。
- MariaDB：11.4.13，127.0.0.1:13306；应用库 `marketplace_uat`，自动测试库 `marketplace_uat_test`。NeMo 使用它自己的 PostgreSQL。
- 已验证目录导入、真实策略创建/修改/删除、Profile 绑定/删除、幂等提交、冲突检查、重连持久化和不确定创建的对账。
- **默认入口已切至 V2，live 模式采用 MariaDB 与服务端三角色权限。** 已使用三个真实 NeMo 业务账号验证 Guardrail 评测/审批/发布，以及 Profile 草稿评测、冻结版本评测和 release。模拟角色切换和模拟指标仅保留在明确的 mock 演示模式中。自然语言意图不会被当作可执行规则。
- DeepSeek 已通过真实调用和 NeMo 控制面候选校验并保存绑定。上游限制 DeepSeek 仅用于控制面；默认越狱/内容安全防护仍需已有服务提供兼容检测模型，不能把 HTTP 健康检查当作防护就绪。

## 本地运行

在本工作区根目录执行：

```powershell
node scripts/uat/init-local.mjs
docker compose -p agenteval-uat-db --env-file .artifacts/uat-mariadb/.env -f deploy/compose.mariadb-test.yml up -d --wait
docker compose -p agenteval-uat-nemo --env-file .artifacts/uat-nemo/.env -f deploy/compose.nemo-local.yml up -d --wait
node scripts/uat/connect-nemo.mjs
node scripts/uat/connect-v2.mjs
./scripts/uat/start-marketplace.ps1 -Build
node scripts/uat/smoke-v2.mjs
```

本机已构建所需 NeMo 镜像。镜像来自固定提交的干净 Git 导出；Windows 导出的 OpenAPI 文件需要转为 LF 再执行上游构建。此次生成后的 OpenAPI JSON 与原始文件语义 SHA256 完全一致，未跳过 API 检查。原源码目录已快进到最新，旧的重复源码工作树已移除。

新数据库卷会运行 `deploy/mariadb-init/001-marketplace.sql` 创建应用库。已有测试卷升级时，使用本地数据库管理员执行该 SQL 一次；不要删除数据卷。当前本机已完成此步骤。

密码、签名密钥、NeMo PAT 和数据库连接串位于 `.artifacts/uat-nemo` / `.artifacts/uat-mariadb`，已被 Git 和镜像构建排除。连接脚本创建 30 天业务账号令牌，重复运行会复用仍有效的令牌。停止本地容器不要加 `-v`，以保留数据。

本地 Compose 使用 Docker 内网明文 gRPC，所有对宿主机的端口仅绑定 127.0.0.1。它不适用于直接搬到内网生产环境；UI 接入已有服务即可。

## DeepSeek 配置

私密文件：`.artifacts/uat-nemo/deepseek.env`；安全示例：`deploy/deepseek.env.example`。

```powershell
node scripts/uat/configure-deepseek.mjs
```

脚本通过本地 NeMo 管理员账号注册/更新 Provider，执行真实模型调用，验证并保存 `control_plane` 绑定。不会修改检测 Rail 的模型配置，错误不会被当作成功。它仅用于本地联调，内网已有 NeMo 的模型配置由该服务维护方管理。

官方预填地址和模型名依据 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/)；内网需改成实际网关地址和模型名。上游限制见 [NeMo 模型配置说明](https://github.com/tasklattice/tasklattice-guard/blob/9a1971b81b38e2848641289cf7ce51aab544be28/docs/model-configuration.md)。

## UI-only OCP 配置

使用现有 `deploy/helm/tali-ui-demo`，参考 `deploy/values.uat.example.yaml`。完整交付与离线安装说明见 [V2 内网交付](../../deploy/v2/README.md)。配置镜像、UI 域名、已有 NeMo 的 `/api/v1` 地址、数据库 Secret 和账号角色映射，无需重新编译镜像。数据库 Secret 的键为 `MARKETPLACE_DATABASE_URL`，值格式为 `mariadb://用户名:URL编码密码@主机:3306/库名`。应用账号需要在专用库中建表和读写权限。

固定单副本以简化 UAT；服务端每次向 NeMo 校验当前账号权限，业务写入需 `user` 角色及对应 write grant。内网使用各自 NeMo PAT 从连接界面登录，不配置本机专用的 `MARKETPLACE_DEMO_TOKEN`。该自动连接令牌会拒绝非回环环境。

TLS 使用可信证书。MariaDB 支持 `MARKETPLACE_DB_TLS=true` 和可选 `MARKETPLACE_DB_CA_FILE`；私有 CA 文件需由部署方挂载。NeMo 私有 CA 可通过 Node 的 `NODE_EXTRA_CA_CERTS` 配合只读挂载提供。F5 不会被自动替换成模拟后端。

内网 NeMo 的实际版本与地址尚未核验，OCP 尚未部署；用户的交付目标是离线镜像和可修改的运行时配置。发布到 NeMo 不等于现有 Endpoint/Router 已接入该版本，流量路由由现有 NeMo 服务维护方配置。
