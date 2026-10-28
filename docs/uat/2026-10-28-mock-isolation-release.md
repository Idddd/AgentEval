# 当前 UI 离线包与 Mock 故障隔离

镜像标签：`marketplace-v2:uat-20261028-mock-isolation`，Linux amd64。包含当前工作区 UI（含按设计收敛后的 Measure 样式），完整 Nitro API 与运行依赖；运行时无需下载依赖。镜像、Helm、配置示例、诊断文档和验收证据一同交付。

## 可用性规则

- `/v2/guardrails` 和兼容 `/v2-mock/guardrails` 使用独立浏览器数据，不依赖真实 API、数据库、NeMo 或 F5。
- `/v3/guardrails` 保持真实模式；配置/连接失败显示错误，包含 code、component、settings 和 Reference。服务端日志与 X-Request-ID 对应同一编号，不打印凭据与上游响应。
- Docker 和 OCP UI 探针使用 `/api/health`；真实配置与数据库诊断仍为 `/api/nmgr/ready`。真实诊断失败不影响共享 UI 的服务路由，必须独立监控真实集成状态。
- 真实集成 Secret/ConfigMap 缺失不会拦住 UI 启动。所选凭据来源通过运行时标记保留，缺失来源会报错，不使用旧 Token、另一个账号或 URL 内旧密码代替；认证和 TLS 校验不变。

## 验证方式

`scripts/uat/check-ui-availability.mjs` 使用本地缓存的 Helm 容器渲染 7 组配置，确认所有 UI 探针独立、集成引用可选、部分 F5 配置未丢弃。无需连接集群。

`verify-ui-isolation.mjs IMAGE REPORT.json` 使用临时的 loopback 端口和只读、无 capabilities 的容器，注入合成故障。每组确认 `/api/health` 与 UI/JS 资源可访问，真实接口返回对应 503，错误编号可在容器日志中找到；结束清理测试容器。验证不创建真实业务资源，也不调用真实后端。

当前故障矩阵：NeMo URL 缺失、Origin 格式错误、数据库缺失/格式错误、账号映射文件缺失、Token/密码 Secret 缺失、凭据来源冲突、显式密码模式残留旧 Token、显式 Token 模式残留旧密码、F5 Secret 缺失/仅配置 URL、数据库独立密码 Secret 缺失、CA 文件缺失、数据库端口不可达、NeMo 端口不可达。具体镜像 ID 和每组错误码以 `isolation-test-results.json` 为准。

前端回归另外覆盖真实请求网络失败、配置失败、数据库失败和 F5 失败后切回 Mock：保存的数据不变，Measure/Runner 仍可操作且不再请求真实 API。

本次验证结果：7 组 Helm 渲染检查通过；最终镜像 16 类故障注入全部通过；全量回归 1126 项通过、9 项跳过，补充凭据边界后的最终专项 59 项通过；类型检查通过。独立审查发现并修复了显式密码模式仍优先使用旧 Token 的情况。浏览器在故障容器中验证了真实错误页与手动返回 Mock 后的 Tech Measure/Runner。

## 包校验与使用

1. 对照外部 `.zip.sha256` 验证归档，解压后运行 `sha256sum -c SHA256SUMS`。
2. `podman load -i marketplace-v2.tar`，镜像标签和来源见 `manifest.json`。
3. 配置/部署按 `README.md` 和 `values.uat.yaml`，使用真实诊断和业务流程确认后端可用。
4. 可选复测：`node verify-ui-isolation.mjs marketplace-v2:uat-20261028-mock-isolation isolation-results.json`（需 Docker；使用合成配置）。

边界：已验证的配置/网络故障不会使 Mock 因真实依赖错误下线；镜像拉取失败、容器资源耗尽、UI 资源丢失、Ingress/集群整体故障或用户自定义非可选挂载不属于真实 API 的隔离范围。未在目标 OCP 或真实 NeMo/F5 实例上做本次上线验收。
