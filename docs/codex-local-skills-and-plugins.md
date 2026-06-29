# Codex 本机 Skills 与插件迁移说明

更新时间：2026-06-18

本文记录当前机器上已经安装或缓存的 Codex skills 与插件，方便更换机器后让 Codex 直接阅读本文并恢复相同能力。

## 一、快速恢复步骤

在新机器上建议按这个顺序恢复：

1. 安装并登录 Codex。
2. 让 Codex 阅读本文。
3. 先安装用户额外安装的 skill：

```powershell
npx skills add https://github.com/Leonxlnx/taste-skill --skill "taste-skill"
```

如果上面的命令不可用，可以让 Codex 使用系统自带的 `skill-installer` 执行：

```powershell
python C:\Users\<你的用户名>\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo Leonxlnx/taste-skill --path skills/taste-skill
```

4. 重启 Codex，让新安装的 skill 被加载。
5. 检查插件是否可用，必要时在聊天中显式引用插件：

```text
[@superpowers](plugin://superpowers@openai-curated-remote)
[@build-web-apps](plugin://build-web-apps@openai-curated-remote)
[@figma](plugin://figma@openai-curated-remote)
```

## 二、用户额外安装的 Skill

### taste-skill

本机路径：

```text
C:\Users\zs\.codex\skills\taste-skill\SKILL.md
```

来源：

```text
https://github.com/Leonxlnx/taste-skill
```

安装来源路径：

```text
skills/taste-skill
```

入口名称：

```text
design-taste-frontend
```

作用：

- 给前端页面设计增加“反模板化”审美约束。
- 适用于落地页、作品集、品牌页、营销页、已有页面视觉重设计。
- 要求先判断页面类型、受众、品牌语气和参考风格，再选择合适的布局、动效、密度和设计系统。
- 避免常见 AI 默认套路，例如紫色渐变、三张等宽功能卡片、无意义标签、假截图、过大标题、泛滥玻璃拟态。

适合使用的场景：

- 新建高质量官网或落地页。
- 重设计一个已有前端页面。
- 作品集、品牌展示页、活动页。
- 需要提升页面视觉质感，但又不希望看起来像模板。

不太适合的场景：

- 数据表格密集的后台管理系统。
- 复杂多步骤业务产品 UI。
- 只需要修复一个小 bug 或改一个按钮的轻量任务。

推荐触发方式：

```text
使用 taste-skill，为这个产品做一个高质量落地页。要求先给出 Design Read，再实现页面，不要使用 AI 紫色渐变、三列等宽功能卡片和假截图。
```

已有项目重设计：

```text
使用 taste-skill，先审计当前页面的视觉问题，再在现有技术栈内重设计。保留业务结构，重点改善层级、间距、配色、字体和首屏视觉。
```

## 三、Codex 系统预装 Skills

这些 skills 位于：

```text
C:\Users\zs\.codex\skills\.system
```

通常由 Codex 自带，不需要手动迁移。新机器上如果安装的是新版 Codex，一般会自动存在。

### imagegen

作用：

- 生成或编辑位图图片。
- 适合照片、插画、纹理、精灵图、透明背景抠图、视觉 mockup。

用法示例：

```text
使用 imagegen 生成一张适合作为 SaaS 官网首屏背景的图片，风格克制、可信、有安全感。
```

### openai-docs

作用：

- 查询 OpenAI 产品、API、模型、Codex 使用方式的官方文档。
- 适合需要最新 OpenAI 官方信息、引用来源、模型选择建议的任务。

用法示例：

```text
使用 openai-docs，查询当前 OpenAI API 中结构化输出的官方用法，并给出示例。
```

### plugin-creator

作用：

- 创建 Codex 插件目录和 `.codex-plugin/plugin.json`。
- 适合开发自定义 Codex 插件。

用法示例：

```text
使用 plugin-creator，帮我创建一个本地 Codex 插件骨架。
```

### skill-creator

作用：

- 创建、修改、优化 Codex skill。
- 适合把重复工作流沉淀成可复用 skill。

用法示例：

```text
使用 skill-creator，帮我把这个项目的发布流程整理成一个 Codex skill。
```

### skill-installer

作用：

- 从 GitHub 或 OpenAI curated skills 安装 Codex skill。
- 适合换机后恢复第三方 skill。

用法示例：

```text
使用 skill-installer，从 https://github.com/Leonxlnx/taste-skill 安装 skills/taste-skill。
```

## 四、已缓存的 Codex 插件

当前机器缓存目录：

```text
C:\Users\zs\.codex\plugins\cache
```

注意：插件缓存不等同于可直接复制迁移。换机后更推荐通过 Codex 插件系统重新安装或触发对应插件。

### Superpowers

插件标识：

```text
superpowers@openai-curated-remote
```

当前缓存版本：

```text
5.1.3
```

作用：

- 提供软件开发工作流方法论。
- 覆盖需求澄清、头脑风暴、计划编写、TDD、系统化调试、并行子代理、代码审查、开发分支收尾等流程。

主要 skills：

- `brainstorming`：功能设计前澄清目标和方案。
- `writing-plans`：把需求拆成可执行计划。
- `executing-plans`：按已有计划执行实现。
- `test-driven-development`：用测试驱动实现 bugfix 或功能。
- `systematic-debugging`：遇到 bug 或异常时系统排查。
- `subagent-driven-development`：把独立子任务交给子代理并行处理。
- `dispatching-parallel-agents`：多任务并行调度。
- `requesting-code-review`：实现完成后请求代码审查。
- `receiving-code-review`：处理审查意见。
- `verification-before-completion`：完成前强制运行验证命令。
- `finishing-a-development-branch`：合并、PR、保留或丢弃开发分支。
- `using-git-worktrees`：为复杂开发创建隔离 worktree。
- `writing-skills`：编写或维护 skills。

推荐触发方式：

```text
[@superpowers](plugin://superpowers@openai-curated-remote) 我准备实现一个复杂功能，请先进行 brainstorming，然后写计划再执行。
```

适合场景：

- 复杂功能实现。
- 高风险 bugfix。
- 需要严格验证和代码审查的开发任务。
- 多步骤重构。

### Build Web Apps

插件标识：

```text
build-web-apps@openai-curated-remote
```

当前缓存版本：

```text
0.1.2
```

作用：

- 构建前端应用、落地页、交互式页面和视觉驱动 UI。
- 结合图片生成、浏览器验证、前端调试、React 最佳实践、shadcn、Stripe、Supabase/Postgres 指南。

主要 skills：

- `frontend-app-builder`：从零构建高质量前端应用或页面。
- `frontend-testing-debugging`：用浏览器或 Playwright 验证前端页面。
- `react-best-practices`：React/Next.js 性能和结构建议。
- `shadcn-best-practices`：shadcn/ui 组件使用和调试。
- `stripe-best-practices`：Stripe 支付和订阅集成建议。
- `supabase-best-practices`：Supabase/Postgres 查询和 schema 优化。

推荐触发方式：

```text
[@build-web-apps](plugin://build-web-apps@openai-curated-remote) 帮我构建一个 React 前端页面，并用浏览器验证响应式效果。
```

适合场景：

- 新建 Web 应用。
- 前端页面视觉改版。
- 浏览器交互测试。
- React、shadcn、Stripe、Supabase 相关开发。

### Figma

插件标识：

```text
figma@openai-curated-remote
```

当前缓存版本：

```text
2.0.9
```

作用：

- 连接 Figma 进行设计到代码、代码到设计、设计系统、Code Connect、FigJam 图表、Slides 等工作流。

主要 skills：

- `figma-use`：在 Figma 文件中创建、编辑、同步设计。
- `figma-generate-design`：把网页或应用界面捕获/转换到 Figma。
- `figma-generate-diagram`：生成 FigJam 图表。
- `figma-create-new-file`：创建新的 Figma 文件。
- `figma-code-connect`：维护 Figma Code Connect 映射。
- `figma-generate-library`：根据代码或需求构建设计系统。
- `figma-use-figjam`：FigJam 场景补充规则。
- `figma-use-slides`：Figma Slides 场景补充规则。

推荐触发方式：

```text
[@figma](plugin://figma@openai-curated-remote) 根据这个 React 页面，在 Figma 中创建可编辑设计稿。
```

适合场景：

- 从 Figma 设计实现代码。
- 把已有页面推送到 Figma。
- 创建 FigJam 流程图、ER 图、时序图。
- 建立组件和代码之间的 Code Connect。

## 五、OpenAI Primary Runtime 插件

这些插件来自：

```text
C:\Users\zs\.codex\plugins\cache\openai-primary-runtime
```

它们更像 Codex 的内置生产力运行时，通常不需要手动安装。换机后如果不可用，可以让 Codex 搜索并启用对应插件。

### Documents

插件名：

```text
documents
```

当前缓存版本：

```text
26.614.11602
```

作用：

- 创建、编辑、检查、渲染、导出 Word/DOCX 文档。
- 适合报告、备忘录、正式文档、Google Docs 交付前准备。

用法示例：

```text
使用 Documents，基于这份提纲生成一份正式 Word 文档，并渲染检查版式。
```

### PDF

插件名：

```text
pdf
```

当前缓存版本：

```text
26.614.11602
```

作用：

- 读取、创建、检查、渲染、验证、抽取 PDF。
- 适合 PDF 报告、表格抽取、版式检查、合并/拆分/转换。

用法示例：

```text
使用 PDF，提取这个 PDF 中的表格和正文，并检查页面渲染是否正常。
```

### Presentations

插件名：

```text
presentations
```

当前缓存版本：

```text
26.614.11602
```

作用：

- 创建、编辑、渲染、验证和导出 PPTX 演示文稿。
- 适合汇报、路演、培训材料、研究总结、视觉演示稿。

用法示例：

```text
使用 Presentations，基于这份大纲生成一份 10 页 PPTX，并渲染检查版式。
```

### Spreadsheets

插件名：

```text
spreadsheets
```

当前缓存版本：

```text
26.614.11602
```

作用：

- 创建、编辑、分析、可视化、渲染和导出 XLSX/CSV/TSV。
- 适合财务表、数据清洗、模板生成、图表、公式和 Google Sheets 交付。

用法示例：

```text
使用 Spreadsheets，读取这个 CSV，清洗数据并生成带公式和图表的 XLSX。
```

## 六、换机后给 Codex 的推荐提示词

可以在新机器上直接把下面这段发给 Codex：

```text
请阅读 docs/codex-local-skills-and-plugins.md，并按文档恢复本机 Codex skills 与插件能力。

优先事项：
1. 安装 Leonxlnx/taste-skill 仓库中的 skills/taste-skill。
2. 确认 Superpowers、Build Web Apps、Figma 插件可用。
3. 确认 Documents、PDF、Presentations、Spreadsheets 运行时能力可用。
4. 安装完成后告诉我哪些能力已恢复，哪些需要我在 Codex 插件市场手动启用。
```

## 七、当前机器实际盘点结果

用户额外安装的 skills：

```text
C:\Users\zs\.codex\skills\taste-skill
```

Codex 系统 skills：

```text
C:\Users\zs\.codex\skills\.system\imagegen
C:\Users\zs\.codex\skills\.system\openai-docs
C:\Users\zs\.codex\skills\.system\plugin-creator
C:\Users\zs\.codex\skills\.system\skill-creator
C:\Users\zs\.codex\skills\.system\skill-installer
```

已缓存插件：

```text
C:\Users\zs\.codex\plugins\cache\openai-curated-remote\build-web-apps\0.1.2
C:\Users\zs\.codex\plugins\cache\openai-curated-remote\figma\2.0.9
C:\Users\zs\.codex\plugins\cache\openai-curated-remote\superpowers\5.1.3
C:\Users\zs\.codex\plugins\cache\openai-primary-runtime\documents\26.614.11602
C:\Users\zs\.codex\plugins\cache\openai-primary-runtime\pdf\26.614.11602
C:\Users\zs\.codex\plugins\cache\openai-primary-runtime\presentations\26.614.11602
C:\Users\zs\.codex\plugins\cache\openai-primary-runtime\spreadsheets\26.614.11602
```
