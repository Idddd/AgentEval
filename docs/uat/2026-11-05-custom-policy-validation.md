# NeMo Custom Policy 同步校验

## 原因与修改

V3 复用了 F5/V2 的 GenAI 配置表单，将 NeMo custom 类型显示为 LLM prompt。用户按提示输入自然语言，后端在生成 NeMo Policy definition 时无法解析为 JSON，返回 422。

- V3 NeMo 使用 Custom Policy (JSON) 和 NeMo Policy JSON 标签；输入、详情和 Swagger 的格式说明保持一致。
- 前后端共享基础结构检查；完整规则和 detector 仍由 NeMo 校验。输入错误保留文本并阻止同步，未绕过可执行定义校验。
- JSON 中规则 stages 决定方向。草稿允许空 tests，评测要求验收测试。
- F5 保留 GenAI 提示词；V2 维持原有表单。

## 验证

- Control 全量测试：1,270 通过，9 跳过；随后详情标签修正的针对性回归：66 通过。
- TypeScript、生产构建通过。
- Swagger HTTP 校验：33 responses、44 schemas、48 operations 通过。
- 本地真实 NeMo：自然语言返回 422，Marketplace revision 与 binding 未改变；随后提交实际 Policy JSON，sync-policy-read 状态 done，远端回读规则一致，revision 1。
- 真实测试资源：`uat-custom-json-1793873911223`；远端 Policy：`mp-50c739ee84e3-uat-custom-json-1793873911223-v1`。保留为未发布 UAT 草稿，没有发布或接入应用流量。

本轮验证不代表自然语言自动转换为可执行 NeMo Policy；当前流程要求 Tech 提供定义，或选择关键词/正则类型。
