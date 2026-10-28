# NMGR Figma 交互审查结果

审查日期：2026-10-27。来源：[NMGR Copy / Wireframes](https://www.figma.com/design/5w4lI8fA0ScEjyPaVI9Y8S/NMGR--Copy-?node-id=0-1)。

这是交互原型审查，不是视觉 UI 审查。结论：业务主线清楚，误报审核与生产策略变更的职责边界明确；当前 Figma 原型的关键提交、取消和返回连线尚未闭环。

## 已模拟的流程

| 场景 | 结果 |
| --- | --- |
| CUU Measure → Agent 告警 → Policy 事件列表 | 可通过现有点击连线到达 |
| CUU Policy Close → Agent 告警 Close → Measure | 可逐层返回 |
| CUU Report False Positive | 页面有按钮，未配置点击动作 |
| CUA Measure → Agent 告警 → Policy | 第一段可走通；第二段未在当前告警画板配置，独立 alertDetails 画板配置了对应跳转 |
| TEC 误报列表 → 详情 → Review & Decision → 审核 | 可通过现有连线到达 |
| TEC Submit review → 审核完成 | 有完成画板，提交按钮自身目前只有悬停变体 |
| TEC Close、Cancel、Back to reports、Next report | 有入口文案，未发现对应点击动作 |
| TEC Request policy adjustment | 有入口文案，未发现对应点击动作 |

依据是节点与原型事件配置的逐步推演，没有执行真实后台操作。缺少原型连线不等于未来实现没有该功能。

## 值得保留的设计

- 从 Agent 汇总逐层钻取到策略及事件，关闭时逐层返回。
- 误报审核仅记录事件结论，不停用 Guardrail、不改变生产策略、不重放请求。
- 策略调整是独立请求，后续经过 evaluation → approval → deployment。
- 请求/响应证据、报告诉求、事件时刻的版本、审核理由、审核人和审计时间线共同支撑结论。

## 后续建议，尚未批准实施

1. 明确误报提报的输入、提交成功、报告编号和重复提报处理。
2. 补全 Confirm false positive 与 Not a false positive 两种结论的完成态。
3. 明确 Pending review → In review → Reviewed 的触发点、处理人和并行处理情况。
4. 展示报告人查询审核结果的路径。
5. 演示关闭/取消时保留筛选、页码、选中行，以及已编辑理由的取消行为。
6. 统一同一事件的原始响应：FPR-2026-00418 在详情/审核页显示脱敏请求回显，在完成页显示转人工队列响应。Transformed 的“内容改写/转人工”含义也需明确。

## 本次样式适配边界

用户要求保留本审查，再把 Figma 的设计导入当前 /v2-mock，按当前 UI 风格适配，功能要求完全一致。本审查的改进建议仅存档，不作为本次新增功能需求。以现有画板中已表达的页面、字段、动作和状态为范围，使用已有 mock 工作台样式和组件；不修改 /v2 真实版、生产配置或原始 Figma 文件。
