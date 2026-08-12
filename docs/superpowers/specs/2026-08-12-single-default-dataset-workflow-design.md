# 单一默认 Dataset Workflow 设计

## 目标

Evaluation Catalog 的 Onboarding Assistant 只使用一个 `Demo Default Dataset`。该 Dataset 为 Published 状态，可直接进入 Evaluation，同时 Test coverage 始终展示完整 Dataset 与 Guardrail 配置信息，不再沿用旧 workflow 的完成后隐藏和历史 coverage 过滤逻辑。

## Mock 数据迁移

- 删除 `demo-published-dataset` Dataset fixture。
- 删除 `demo-published-dataset-r1` Dataset revision fixture。
- 将 `demo-default-dataset-r1` 的状态从 `DRAFT` 改为 `PUBLISHED`，保留 6 个现有测试用例。
- 更新 `Demo Default Dataset` 的说明，使其明确表示这是唯一默认的 Published Dataset。
- 将 Onboarding Assistant 的 Live monitoring run 从 `demo-published-dataset` / `demo-published-dataset-r1` 改为 `demo-default-dataset` / `demo-default-dataset-r1`。
- 保留现有 Onboarding Overview、Trace 和结果数据；不删除主要示例记录。

## Test Coverage UI

- Dataset 卡片选择器始终接收当前 Target 的全部 Dataset，不再根据历史 Run 是否包含 Guardrail coverage 过滤。
- Onboarding Assistant 初始只显示 `Demo Default Dataset` 和 `New Dataset`。
- 用户后续创建的新 Dataset 在切换选择后仍保留在卡片列表中。
- `GuardrailTemplatePicker` 在 Test coverage 区域渲染时始终显示，不受 Published 状态、已选 Pack 数量或 `Details` 开关影响。
- `Details` 只控制 Dataset 详细内容与 Combined coverage 等扩展信息，不控制核心 Dataset 或 Guardrail 配置的可见性。

## Workflow 行为

- `Demo Default Dataset` 初始为 Published，因此不需要额外选择或发布另一个示例 Dataset。
- `Next`、Evaluation setup、运行 Evaluation、结果审核和权限行为保持不变。
- 默认 Guardrail Pack 选择仍由 `guardrailTemplateIdsForTarget` 初始化。
- Dataset 切换只更新 `activeDatasetId`，不清空 Guardrail Pack 选择。
- 不引入 Dataset 级 Guardrail 配置持久化；本次仍使用现有 workspace 级 mock 状态。

## 测试与验收

- Fixture 验证确认不存在 `demo-published-dataset` 引用，所有 Run 的 Dataset 和 revision 引用有效。
- Catalog 测试确认 Onboarding Assistant 初始只有 `Demo Default Dataset`，且它为 Published。
- Catalog 测试确认 Test coverage 在非 Details 模式下仍显示 Guardrail Test Packs。
- Catalog 测试创建第二个 Dataset、来回切换后确认两个 Dataset 卡片始终存在。
- Overview 与 Trace 测试继续显示 Onboarding Assistant 的既有 Live monitoring 示例。
- 浏览器验证 Catalog 中只有默认 Published Dataset、Guardrail 配置完整可见，并能继续进入 Evaluation。
- 完整 workspace 测试与 TypeScript 类型检查通过。

## 非目标

- 不接入真实 API、数据库或对象存储。
- 不为每个 Dataset 保存独立 Guardrail Pack 配置。
- 不修改 Evaluator、Sampling、权限或结果审核逻辑。
- 不删除 Overview 和 Trace 中的 Onboarding Assistant 示例。
