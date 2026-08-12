# Onboarding Assistant 彩色头像统一设计

## 目标

为 `demo-onboarding-assistant` 提供一张明显、有颜色、可快速识别的专属头像，替换其当前使用的简单 `UserPlus` 线性图标。用户在 Evaluation Catalog、Overview、Trace 和目标详情等页面看到该头像时，应能立即判断这些记录属于同一个 Agent。

## 视觉设计

- 生成一张 256×256 的彩色机器人助手头像。
- 采用青色与蓝紫色为主色，使用高对比度、友好且专业的机器人形象。
- 头像不包含文字、品牌标识、水印或复杂背景。
- 构图保持主体居中并留出安全边距，确保缩小到表格和列表尺寸后仍然清晰。
- 页面以圆角方形容器展示图片，并沿用当前 Onboarding Assistant 的青色强调色。

## 资产与数据模型

- 最终图片作为项目本地静态资产保存，不依赖外部 URL 或运行时 API。
- `demo-onboarding-assistant` 的 fixture 使用该图片路径作为头像来源。
- 现有 `icon: "user-plus"` 保留为图片加载失败时的回退标识；其他 Agent 的 fixture 和图标不改变。

## 渲染范围

统一头像覆盖所有展示 Onboarding Assistant 身份的位置：

- Evaluation Catalog 的 Lifecycle、Cards 和 List 视图。
- Catalog 工作区抽屉标题。
- Evaluation Overview 的 Agent 筛选项和 Trace 列表。
- Trace 页面中的 Agent 标识。
- Evaluation Target 注册表与详情页面。

各位置允许使用不同尺寸，但必须引用同一个图片资产、使用一致的圆角与色彩，不再在部分位置显示通用 Bot 或 UserPlus 图标。

## 组件行为

- 扩展共享的 Agent 身份图标组件，使其可以优先渲染本地头像图片。
- 图片不存在或加载失败时，自动回退到现有 `catalogIcon` 对应的 Lucide 图标。
- 非 Onboarding Assistant 的现有图标路径与视觉效果保持不变。
- Catalog 中原先仅按 Target 类型显示通用图标的入口，改为传入目标自己的头像信息。

## 测试与验收

- 组件测试覆盖图片优先渲染和加载失败回退。
- Catalog 测试覆盖 Lifecycle、Cards、List 和抽屉中的统一头像。
- Overview、Trace 和 Target 页面继续通过共享组件读取同一头像数据。
- 浏览器验证头像在常用列表尺寸和抽屉标题尺寸下清晰可见，且没有布局溢出或变形。
- 完整 Control 前端测试与 TypeScript 类型检查通过。

## 非目标

- 不为其他 Agent 生成新的图片头像。
- 不引入图片上传、裁剪或后台管理功能。
- 不接入真实 API、对象存储或数据库。
- 不改变 Evaluation 的流程和权限逻辑。
