# Langfuse 依赖及 MySQL + Elasticsearch 替代方案调研

## 1. 结论

将项目中的 Langfuse 全部替换为 MySQL + Elasticsearch，并自行维护 LLM Evaluator，在技术上可行。

这个项目的迁移成本低于从一个完整 Langfuse 平台重新实现所有能力，原因是：

- 当前 Streamlit 主流程已经使用本地 JSON 保存 Trace，使用 SQLite 保存 Evaluation Workbench 数据。
- Trace、Backend 和 Store 已有接口抽象，UI 和评测逻辑不直接依赖 Langfuse 数据对象。
- 项目已经有自研的确定性 `CodeEvaluator` 和 `LlmJudge`。
- 当前从 Langfuse 查询到的 Evaluator 只用于页面选择，尚未接入 `EvalRunner` 的实际执行流程。

因此建议只建设本项目真正需要的评测和可观测能力，不以完整复刻 Langfuse 为目标。

这项改造不是简单更换数据库驱动。主要工作集中在 Trace 可靠写入、MySQL 与 Elasticsearch 一致性、Evaluator 版本管理、异步任务调度和数据治理。

## 2. 当前 Langfuse 依赖

项目依赖 `langfuse>=3.0,<4.0`，主要相关代码如下：

- `src/settings.py`：Langfuse 地址、密钥以及连接检查。
- `src/backends/base.py`：后端无关的 `Tracer`、`TraceBackend` 和 `TraceStore` 接口。
- `src/backends/langfuse_backend.py`：Langfuse SDK 实现。
- `src/langfuse_evaluators.py`：查询 Langfuse Evaluator 列表。
- `src/ui/runs.py`：New Evaluation 页面中的 Evaluator 选择。
- `src/ui/reports.py`：生成“Open trace in Langfuse”链接。
- `src/ui/settings_page.py`：显示 Langfuse 连接状态。

### 2.1 使用的 SDK 和 API

| 能力 | 当前调用 | 用途 | 替换难度 |
| --- | --- | --- | --- |
| 客户端初始化 | `get_client()`、`auth_check()` | 初始化和连接检查 | 低 |
| Trace/Span 创建 | `start_as_current_observation()` | 创建 Trace、Span、Generation | 中 |
| Trace 属性更新 | `update_current_trace()` | 写入名称、用户、标签和 Metadata | 低 |
| Observation 更新 | `observation.update()` | 写入输入输出、模型、Token、Cost 和状态 | 中 |
| Trace ID/提交 | `get_current_trace_id()`、`flush()` | 获取 ID 和提交批量事件 | 低 |
| Trace 查询 | `api.trace.get/list/delete` | Trace 列表、详情和删除 | 中 |
| Dataset | `create_dataset()`、`create_dataset_item()`、`get_dataset()` | Dataset 管理 | 低到中 |
| Score | `create_score()` | 将评分关联到 Trace | 中 |
| Trace URL | `get_trace_url()` | 跳转 Langfuse 控制台 | 低 |
| Evaluator 目录 | `GET /api/public/unstable/evaluators` | 查询可选择的 Evaluator | 低 |

Evaluator 列表依赖的是 Langfuse `unstable` API，这意味着接口兼容性本身没有稳定保证。

## 3. 当前运行时的真实依赖程度

当前 `app.py` 使用 `load_settings(probe=False)`，并在构造 Runner 时显式使用：

- `LocalJsonBackend`
- `LocalJsonStore`
- SQLite Workbench Repository

所以当前模块化 Streamlit UI 的 Evaluation 执行结果并不以 Langfuse 作为主要存储。Langfuse 目前主要提供以下可选能力：

1. 查询并展示 Langfuse Evaluator 列表。
2. 显示 Langfuse 配置或连接状态。
3. 提供外部 Trace 链接。
4. 为旧入口、CLI 或显式切换 Backend 的调用提供 Trace、Dataset 和 Score 存储。

### 3.1 Evaluator 选择尚未接入执行

New Evaluation 页面支持选择 Built-in 或 Langfuse Evaluator，但选择出的 Langfuse Evaluator ID 尚未传入 `EvalRunner`，也没有触发 Langfuse Evaluator 执行。

因此这部分目前是“Evaluator 目录选择 UI”，不是实际评测引擎依赖。删除 Langfuse Evaluator 目录不会改变现有评测结果，但需要将 UI 改为读取自建 Evaluator Registry。

## 4. 已有的自研 Evaluator 基础

项目已经具备自建 Evaluator 的核心雏形：

- `src/code_evaluator.py`：确定性规则评测。
- `src/llm_judge.py`：自研 LLM-as-a-Judge。
- `src/eval_runner.py`：Agent 执行、代码评测、LLM Judge 和结果保存。
- `src/sqlite_workbench.py`：Run、Case Result、Judge Score、Usage、Cost 和 Report 的持久化。

现有 `LlmJudge` 已包含：

- 固定 Prompt 版本。
- correctness、relevance、completeness、safety 四个评分维度。
- 严格 JSON Schema 校验。
- 解析失败时的一次修复重试。
- 敏感字段脱敏。
- Token 和 Cost 统计。
- Evaluator 自身的 Trace/Observation。

后续重点不是重新编写 Judge，而是将它平台化：支持定义、版本、启停、分配、执行记录、重试和结果复现。

## 5. 推荐的数据职责划分

MySQL 应当作为业务事实源，Elasticsearch 应当作为 Trace 搜索和分析索引。不要让两套存储同时成为权威数据源。

| 存储 | 建议负责的数据 |
| --- | --- |
| MySQL | Project、Agent/Target、Dataset、Revision、Evaluation Run、Case Result、Evaluator 定义和版本、执行任务、Score、Report、权限、审计和成本 |
| Elasticsearch | Trace/Span 搜索、Trace Tree、全文检索、标签过滤、时间线和聚合分析 |
| 对象存储（可选） | 超大 Prompt、Response、附件和低频长期归档 |

### 5.1 MySQL 建议新增的数据模型

- `evaluator_definitions`：Evaluator 的稳定身份、类型和状态。
- `evaluator_versions`：不可变的 Prompt、模型、参数、输出 Schema 和版本说明。
- `evaluation_assignments`：Evaluator 与 Agent、Dataset、Run 或规则的关联。
- `evaluator_jobs`：待执行任务、调度时间、重试次数和幂等键。
- `evaluator_runs`：每次实际执行的输入摘要、输出、状态、耗时和错误。
- `scores`：结构化评分、理由及关联的 Trace/Span/Case。
- `trace_summaries`：用于业务关联和快速展示的 Trace 摘要。
- `outbox_events`：可靠同步 Elasticsearch 的事务事件。

现有 SQLite 中的 Agent、Revision、Dataset、Run、Case Result、Judge Score、Usage Cost 和 Report 表可以平移到 MySQL Repository。

### 5.2 Elasticsearch 文档设计

建议一个 Observation/Span 对应一个文档，并冗余必要的查询字段：

- `trace_id`
- `span_id`
- `parent_span_id`
- `evaluation_run_id`
- `case_id`
- `agent_id`
- `dataset_id`
- `project_id`/`tenant_id`
- `start_time`、`end_time`、`duration_ms`
- `name`、`type`、`level`、`status`
- `model`、`usage`、`cost`
- `tags` 和允许搜索的 Metadata
- 输入输出的受控索引或摘要

可再建立 `trace-summary` 索引，用于 Trace 首页列表和统计。

任意结构的 `input`、`output` 和 `metadata` 不应完全使用动态字段展开，否则容易导致 mapping explosion。可采用：

- 已知字段使用固定 Mapping。
- 非固定 Metadata 使用 `flattened`。
- 大文本只索引必要字段，原文存 `_source` 或对象存储。
- 使用 Index Template、Alias/Data Stream、Rollover 和 ILM。

## 6. 推荐的系统架构

```text
Agent / Eval Runner
        │
        ├── Trace events ──> Ingestion API / Queue
        │                          │
        │                          ├── Elasticsearch: Span/Trace 搜索
        │                          └── MySQL: Trace summary / outbox
        │
        └── Evaluation job ──> Evaluator Worker
                                      │
                                      ├── Code Evaluator
                                      ├── LLM Judge
                                      └── Future custom evaluators
                                              │
                                              └── MySQL: Result/Score/Cost/Version
```

建议继续保留现有 `Tracer`、`TraceBackend`、`TraceStore` 和 Workbench Repository 抽象，分别实现 MySQL/Elasticsearch 后端。这样 UI、Agent Adapter 和 Evaluator 不需要感知具体存储。

Trace 采集层可以继续遵循 OpenTelemetry 的 Trace/Span 语义，避免形成只适用于当前 UI 的私有协议。

## 7. MySQL 和 Elasticsearch 一致性

不建议在页面请求或 Evaluation Runner 中直接双写 MySQL 和 Elasticsearch。任何一端临时失败都会形成难以修复的不一致。

推荐 Transactional Outbox：

1. Evaluation 或 Trace 摘要与 Outbox Event 在同一个 MySQL 事务中写入。
2. 后台 Worker 持续消费 Outbox。
3. 使用 Elasticsearch Bulk API 批量写入。
4. 通过事件 ID 和文档 ID 保证幂等。
5. 写入成功后标记事件已消费。
6. 保留从 MySQL 或原始事件重建 ES 索引的能力。

如果 Trace 吞吐量较高，也可以让采集端先写消息队列，再分别写 ES 和 MySQL 摘要；但 Evaluation 业务状态仍应以 MySQL 为准。

## 8. 自研 Evaluator 平台设计

### 8.1 统一输入协议

Evaluator 应接收标准化上下文，而不是直接读取某个页面或数据库对象：

- Case input。
- Expected/reference output。
- Agent response。
- Trace、Span 和 Tool Evidence。
- Dataset/Case Metadata。
- Evaluation Run 和 Agent Revision 信息。

### 8.2 统一输出协议

- Typed scores：numeric、boolean、categorical 或 text。
- 总结和评分理由。
- pass/fail/status。
- Evaluator ID 和不可变版本 ID。
- Prompt Version。
- Model、Provider 和模型参数。
- Token、Cost 和 Latency。
- Error、Retry 和原始输出引用。

### 8.3 版本和复现

Evaluator Version 必须不可变。以下任意变化都应产生新版本：

- System/User Prompt。
- 模型或 Provider。
- Temperature 等模型参数。
- 输出 JSON Schema。
- 评分维度和权重。
- 输入字段映射。
- Judge 代码逻辑。

Evaluation Run 应锁定具体版本，而不是只保存 Evaluator 名称。否则历史 Report 无法解释，也无法进行可信的版本对比。

### 8.4 执行可靠性

Evaluator Worker 至少需要：

- 幂等键，避免重复计分和重复费用。
- Timeout、Retry 和 Dead-letter 状态。
- 并发限制和 Provider Rate Limit。
- 单 Case 失败隔离。
- 原始响应保留与 Schema 校验。
- 可取消和可重新执行。
- 完整的模型 Usage/Cost 记录。

## 9. 安全与数据治理

Trace 输入输出可能包含密钥、个人信息或业务敏感内容。现有 `LlmJudge` 的脱敏主要保护发送给 Judge 的内容，不能覆盖所有 Trace 写入路径。

自建后应增加统一治理：

- 在 Trace Ingestion 层统一脱敏，而不是依赖每个调用方。
- 为 Metadata 建立允许索引的字段白名单。
- 控制 Prompt/Response 的访问权限。
- Tenant/Project 级数据隔离。
- 数据保留和删除策略。
- Evaluator 配置和 Prompt 修改审计。
- ES Snapshot 与 MySQL 备份恢复演练。

## 10. 与 Langfuse 的能力差异

Langfuse 自托管不是一个简单数据库服务。其完整架构包含 PostgreSQL、ClickHouse、Redis/Valkey 和对象存储；ClickHouse 主要负责高吞吐的 Trace、Observation 和 Score 分析。

改为 MySQL + Elasticsearch 后，需要自行承担：

- Trace 批量写入、缓冲和失败重试。
- Evaluator Worker、调度、超时、并发和幂等。
- Evaluator/Prompt 版本管理。
- Evaluation Rule、过滤、抽样和变量映射。
- Score Schema 和聚合查询。
- ES Mapping、索引滚动、保留和 Reindex。
- 多租户、RBAC、审计和数据治理。
- Dashboard、成本统计和报表查询接口。

对于中小规模、搜索导向的内部评测平台，MySQL + Elasticsearch 足够。对于高吞吐 Trace 和大规模长期 OLAP 聚合，Elasticsearch 未必比 ClickHouse 更经济，应根据写入量、保留周期和查询模式压测后决定。

## 11. 建议迁移路径

### 阶段 0：建立边界和基准

- 固化 `Tracer`、`TraceStore`、`TraceBackend` 和 Repository 契约测试。
- 统计 Trace 写入量、平均 Span 数、Payload 大小和保留周期。
- 明确需要保留的 Langfuse 数据和功能范围。

### 阶段 1：SQLite 迁移到 MySQL

- 实现 MySQL Workbench Repository。
- 保持现有 Domain Model 和 UI 不变。
- 迁移 Agent、Dataset、Run、Result、Judge、Usage 和 Report。

### 阶段 2：建设 Elasticsearch Trace Store

- 实现 Elasticsearch `TraceStore` 和 `Tracer`。
- 先进行 Shadow Index 或双读校验。
- 对 Trace 列表、详情、Span Tree、标签过滤和删除建立契约测试。

### 阶段 3：Evaluator 平台化

- 将现有 `LlmJudge` 注册为第一个版本化 Evaluator。
- 增加 Evaluator Registry、Version、Assignment、Job 和 Worker。
- New Evaluation 页面改为读取自建 Evaluator Registry。

### 阶段 4：数据迁移和校验

- 按需迁移 Langfuse 中的 Dataset、Trace、Observation 和 Score。
- 校验 Trace 数量、Span 树关系、Score 和 Usage/Cost。
- 保留迁移前快照和可回滚读路径。

### 阶段 5：移除 Langfuse

- 移除 Langfuse SDK、环境变量和状态页逻辑。
- 移除外部 Trace URL。
- 停止 Langfuse Docker 服务前完成备份和验收。

## 12. 主要风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| MySQL/ES 双写不一致 | Trace 列表与 Report 数据不匹配 | 使用 Outbox 和可重建索引 |
| ES Mapping 爆炸 | 索引不可用或内存压力 | 固定 Mapping + `flattened` + 白名单 |
| Evaluator 未锁版本 | 历史结果不可复现 | Run 保存不可变 Version ID |
| 重试导致重复 LLM 调用 | 重复费用和重复 Score | 幂等键和执行状态机 |
| Trace 泄露敏感数据 | 安全和合规风险 | Ingestion 层集中脱敏 |
| 重建过多 Langfuse 功能 | 维护成本失控 | 只实现当前产品需要的子集 |
| ES 不适合重型 OLAP | 聚合成本和延迟上升 | 用真实数据压测，必要时保留 ClickHouse |

## 13. 最终建议

采用 MySQL + Elasticsearch 并自建 LLM Evaluator 是合理方案，但建议将目标定义为“建设 Eval Studio 所需的最小评测平台”，而不是“重新实现 Langfuse”。

推荐优先级为：

1. MySQL 成为 Evaluation 和 Evaluator 的唯一业务事实源。
2. Elasticsearch 只负责 Trace 检索、树形详情和分析索引。
3. 使用 Transactional Outbox 解决存储一致性。
4. 复用现有 `LlmJudge`，首先完成 Evaluator 的版本化和异步执行。
5. 完成数据量压测后，再决定 ES 是否足以承担长期聚合分析。

## 14. 参考资料

- [Langfuse Observability Data Model](https://langfuse.com/docs/observability/data-model)
- [Langfuse Scores Data Model](https://langfuse.com/docs/evaluation/scores/data-model)
- [Langfuse Experiments via SDK](https://langfuse.com/docs/evaluation/experiments/experiments-via-sdk)
- [Langfuse LLM-as-a-Judge](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- [Langfuse Code Evaluators](https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators)
- [Langfuse Evaluator API Changelog](https://langfuse.com/changelog/2026-04-15-llm-as-a-judge-api)
- [Langfuse Public API](https://langfuse.com/docs/api-and-data-platform/features/public-api)
- [Langfuse ClickHouse Infrastructure](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse)

