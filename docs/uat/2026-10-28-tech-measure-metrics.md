# Tech Measure 指标优化验收

## 当前版本：按用户反馈仅调整颜色和样式

已移除早期版本新增的 View Runners、Protection Center 文本按钮、Data 按钮与展开表格、变化百分比、Normal/Elevated 标签、配额百分比/进度条、Runner 描述、时间与 Mock 注释、延迟说明及零错误说明。恢复原有卡片布局、指标文案与数值；保留原设计的吞吐量 → Protection Center、Runner → Runner 页两个入口，仅用箭头、悬停与焦点样式提示可点击。

趋势图仍由数值样本绘制，收敛为原设计的紧凑折线，无额外坐标标签和操作流程。颜色和图标继续区分指标。浏览器确认原有两条跳转、390px 无横向溢出。当前 Measure 回归 39 项、类型检查、Mock 构建通过。截图：`.artifacts/measure-evidence/tech-metrics-design-only.png`。

## 早期版本记录（已由以上收敛覆盖）

入口：`/v2/guardrails?role=tech#Profile/measure/`。

- Runner 整卡可点击，新增明确的 View Runners 入口、服务器图标和配额进度条。配额文案、进度和读屏描述统一来自 326 / 500。
- Throughput、VRAM、RAM、GPU、CPU 由 11 个每分钟 Mock 数值绘制 Nivo SVG 折线，保留原有最新值。支持时间/单位刻度、鼠标和键盘数值提示、展开完整数据表。Protection Center 保留独立跳转，图表交互不触发导航。
- 吞吐量蓝、VRAM 紫、RAM 青；百分比状态采用绿/橙/红及勾选/警示图标。Mock 展示阈值：低于 70% 正常，70% 至低于 90% 偏高，90% 起高负载。这里只是演示状态，未配置真实告警。GB 指标仅展示相对首个采样的绝对变化，不推测内存容量。
- Latency 的 P99/P75/P50 使用不同颜色与长度，Errors 的零错误状态采用绿色。

验证：全量 1118 项通过、9 项跳过；最终专项 7 项通过；类型检查、Mock 构建及 diff 检查通过。浏览器确认 Runner 和 Protection 路由、数据表、鼠标/键盘提示、首末采样提示边界及 390px 布局。独立审查发现的提示框裁切和 Runner 配额读屏遗漏已修复。

截图：`.artifacts/measure-evidence/tech-metrics-final.png`，窄屏：`tech-metrics-mobile.png`。
