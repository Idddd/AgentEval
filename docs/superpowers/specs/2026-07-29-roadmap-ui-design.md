# UI 重设计：Roadmap 功能卡片式占位展示

> 日期：2026-07-29
> 状态：已获用户批准（设计确认），待实现
> 范围：仅 UI 展示层改动，无业务逻辑变更

## 背景与目标

现有 UI 把 6 个 roadmap 功能（对抗生成、LLM-as-Judge、Reflector、多轮对话、真实工具、Guard 独立部署）以侧边栏禁用按钮的形式一笔带过，信息量不足。目标：让每个功能以**卡片**形式展示「它是干什么的、将来怎么用」，控件全部禁用不可点，仅作占位预览。

## 已确认的决策

- **形式**：卡片式（简介 + 用法说明 + 灰掉的模拟控件）
- **位置**：嵌入各相关 Tab 底部，不用独立 Roadmap Tab，不留侧边栏
- 侧边栏原有 6 个禁用按钮**移除**（避免重复）

## 功能 → Tab 映射

| Tab | 卡片 |
|---|---|
| 📋 Dataset | ① Adversarial Dataset Generation ② Multi-turn Conversations |
| 🕐 Trace Timeline | ③ Real Tool Calls ④ Standalone Permission Guard |
| 📊 Scores | ⑤ LLM-as-Judge ⑥ Reflector Auto-optimization |

## 卡片统一结构

1. 标题 + `COMING SOON` 徽章（如 `🚧 LLM-as-Judge · COMING SOON`）
2. **What it does**：一两句话说明功能价值
3. **How it will work**：描述接入后系统的行为变化
4. **模拟控件**（全部 `disabled=True`）：未来的配置界面预览

### 各卡片内容

| 卡片 | What / How | 模拟控件 |
|---|---|---|
| Adversarial Dataset Generation | 自动生成 prompt injection / jailbreak / role escalation 攻击用例，检验 Guard 鲁棒性；接入后 Dataset 将多出 adversarial 场景类 | multiselect 攻击类型 + 数量 slider + 禁用按钮 "Generate adversarial cases" |
| Multi-turn Conversations | 支持多轮会话评估（如跨轮次的权限升级诱导）；接入后 dataset item 携带对话脚本而非单条 query | toggle "Enable multi-turn sessions" + 轮数 slider |
| Real Tool Calls | 把 mock 工具换成真实 API；接入后 tool_execution span 展示真实延迟与错误 | 每个工具一个 disabled endpoint URL 输入框 + toggle "Use real API" |
| Standalone Permission Guard | Guard 拆为独立服务集中管控；接入后 permission_guard span 变为远程调用（可跨 Agent 复用策略） | disabled "Guard endpoint URL" 输入框 + 禁用按钮 "Deploy guard service" |
| LLM-as-Judge | 用 LLM 对回复质量做主观评分，补 Code Evaluator 的盲区；接入后每条 trace 多出第三个 score `llm_judge_quality` | disabled judge 模型下拉 + rubric 文本框 + 禁用按钮 "Run LLM Judge" |
| Reflector Auto-optimization | 评估失败案例 → 自动归因 → 生成改进建议 → 重跑的闭环；接入后 Scores Tab 出现优化迭代记录 | 禁用按钮 "Analyze failures & suggest fixes" + 迭代次数 slider |

## 实现方案

- 新增 `src/ui_roadmap.py`：
  - `render_roadmap_card(title, what, how, controls_renderer)` 通用卡片函数（`st.container(border=True)` + 徽章 + 三段结构）
  - 6 个 `render_*_card()` 函数，各自定义文案与模拟控件
- `app.py` 改动：
  - 删除侧边栏 `ROADMAP_FEATURES` 禁用按钮组
  - 三个 Tab 底部调用对应卡片渲染函数
- 所有文案英文（遵循项目「除计划 MD 外全英文」约定）
- 无后端/业务代码改动

## 验证

- `tests/ui_smoke.py` 增加断言：初始渲染无异常、6 张卡片标题均可找到、模拟控件均为 disabled
- 重跑 `python tests/ui_smoke.py` 全流程（三个真实按钮仍正常工作）
- `streamlit run app.py` 人工查看三个 Tab 底部卡片
