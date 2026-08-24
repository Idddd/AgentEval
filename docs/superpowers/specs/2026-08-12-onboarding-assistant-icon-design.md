# Onboarding Assistant 图标统一设计

## 目标

让 `demo-onboarding-assistant` 在 Evaluation Catalog、Overview、Trace 和目标详情等页面始终使用同一个 `UserPlus` 身份图标，使用户可以快速判断不同页面中的记录属于同一个 Agent。

## 视觉规则

- 使用现有 Lucide `UserPlus` 线性图标，不新增或生成图片资产。
- 沿用共享 Agent 图标组件中 `user-plus` 对应的青色前景、浅青色背景和边框样式。
- 不同页面允许按现有布局使用不同尺寸，但图形、颜色和容器风格保持一致。
- 不再在 Catalog 的部分视图中使用通用 `Bot` 图标代替 Onboarding Assistant 的身份图标。

## 数据与组件

- 继续使用 fixture 中已有的 `icon: "user-plus"`，不增加新的图片字段或静态资产。
- Catalog 的 Lifecycle、Cards、List 和工作区抽屉从目标数据读取 `icon`，并通过共享 `AgentGardenIcon` 渲染。
- Overview、Trace、Target 页面继续使用相同的共享组件和 fixture 数据。
- 非 Agent 类型仍使用其现有类型图标；其他 Agent 的配置与表现不改变。

## 渲染范围

统一图标覆盖所有展示 Onboarding Assistant 身份的位置：

- Evaluation Catalog 的 Lifecycle、Cards 和 List 视图。
- Catalog 工作区抽屉标题。
- Evaluation Overview 的 Agent 筛选项和 Trace 列表。
- Trace 页面中的 Agent 标识。
- Evaluation Target 注册表与详情页面。

## 测试与验收

- Catalog 测试覆盖 Lifecycle、Cards、List 和抽屉中的 `UserPlus` 图标。
- 共享图标组件测试确认 `catalogIcon="user-plus"` 映射到 `UserPlus`。
- Overview、Trace 和 Target 页面继续从同一目标数据读取图标配置。
- 浏览器验证各入口的 Onboarding Assistant 图标一致，列表和抽屉布局没有溢出或变形。
- 完整 Control 前端测试与 TypeScript 类型检查通过。

## 非目标

- 不生成或引入彩色头像图片。
- 不改变其他 Agent 或非 Agent Target 的图标。
- 不接入真实 API、对象存储或数据库。
- 不改变 Evaluation 的流程和权限逻辑。
