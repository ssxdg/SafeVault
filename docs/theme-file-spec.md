# 主题文件规范

密码保险箱支持导入本机自定义主题。主题文件必须是标准 JSON 文件，导入后仅保存在当前电脑的应用数据目录，不会跟账号密码备份文件一起导入或导出。

> 注意：标准 JSON 不支持注释。下面先给一份带中文注释的 JSONC 说明，便于理解每个变量修改的位置；真正导入时请使用文末或 `docs/examples/theme-forest-night.json` 里的无注释 JSON。

## 带注释示例（说明用，不能直接导入）

```jsonc
{
  // 主题规范版本，目前固定为 1。
  "schemaVersion": 1,

  // 主题唯一标识：3-32 位，只能使用小写字母、数字和连字符，且不能使用 secure / compact / warm / custom。
  "id": "forest-night",

  // 显示在标题栏主题下拉框中的名称，长度 1-24 个字符。
  "name": "森林夜航",

  "variables": {
    // 应用主背景：主内容区、记事本编辑区等大面积底色。
    "--app-bg": "#07130F",

    // 基础面板背景：卡片、底栏、弹窗主体、表格主体等。
    "--surface": "#10211A",

    // 次级面板背景：表头、标签页未选中态、分组弱背景。
    "--surface-muted": "#0B1A14",

    // 抬高层背景：需要比基础面板更突出的浮层或高亮面。
    "--surface-raised": "#173126",

    // 左侧栏背景。
    "--sidebar-bg": "#06100C",

    // 左侧栏标签悬停背景。
    "--sidebar-hover": "#112A20",

    // 左侧栏当前选中标签背景。
    "--sidebar-active": "#173A2B",

    // 左侧栏普通文字颜色。
    "--sidebar-text": "#A9BFAF",

    // 左侧栏选中或悬停文字颜色。
    "--sidebar-text-active": "#F0FFF6",

    // 左侧栏边框、分割线颜色。
    "--sidebar-border": "#1F3A2D",

    // 顶部标题栏背景。
    "--titlebar-bg": "#030B08",

    // 顶部标题栏标题、按钮文字颜色。
    "--titlebar-text": "#E9FFF0",

    // 主文字颜色：卡片标题、表格内容、输入内容等。
    "--text": "#E9FFF0",

    // 次级文字颜色：字段标签、分区标题、备注弱文本等。
    "--text-muted": "#91AA9B",

    // 通用边框颜色：卡片、输入框、弹窗、表格边线等。
    "--border": "#244536",

    // 主强调色：主按钮、链接、选中状态、焦点边框。
    "--accent": "#5DBB86",

    // 强强调色：按钮悬停、链接悬停等。
    "--accent-strong": "#8BD6A8",

    // 激活背景：悬停态、选中弱背景、表格行悬停等。
    "--active-bg": "#193F2D",

    // 普通图标颜色：复制、编辑、关闭等未悬停状态。
    "--icon-color": "#8EB29B",

    // 图标悬停背景。
    "--icon-hover-bg": "#1C4933",

    // 图标悬停颜色。
    "--icon-hover-color": "#8FE0AF",

    // 危险操作颜色：删除、关闭悬停等。
    "--danger": "#E06C75",

    // 危险操作弱背景：删除按钮悬停、错误图标背景等。
    "--danger-bg": "#3A171C",

    // 成功状态颜色：状态栏成功消息、成功弹窗图标等。
    "--success": "#78C69A",

    // 警告状态颜色：未保存提示、警告弹窗图标等。
    "--warning": "#D5A65A",

    // 输入框背景：搜索框、弹窗输入框、重命名输入框等。
    "--input-bg": "#091711",

    // 输入框占位文字颜色。
    "--input-placeholder": "#637D6C",

    // 小阴影：卡片、按钮、列表表格的轻微投影。
    "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.28)",

    // 中阴影：卡片悬停、弹窗、菜单等更明显的投影。
    "--shadow-md": "0 14px 34px rgba(0, 0, 0, 0.28)",

    // 聚焦光环：输入框聚焦时的外发光。
    "--focus-ring": "rgba(93, 187, 134, 0.24)",

    // 弹窗遮罩：添加、编辑、确认弹窗背后的遮罩层。
    "--modal-overlay": "rgba(1, 8, 5, 0.66)",

    // 等宽字体：冷光主题里的账号、链接等技术型字段会使用。
    "--mono-font": "\"Cascadia Code\", \"Consolas\", monospace"
  }
}
```

## 可直接导入的完整 JSON 示例

```json
{
  "schemaVersion": 1,
  "id": "forest-night",
  "name": "森林夜航",
  "variables": {
    "--app-bg": "#07130F",
    "--surface": "#10211A",
    "--surface-muted": "#0B1A14",
    "--surface-raised": "#173126",
    "--sidebar-bg": "#06100C",
    "--sidebar-hover": "#112A20",
    "--sidebar-active": "#173A2B",
    "--sidebar-text": "#A9BFAF",
    "--sidebar-text-active": "#F0FFF6",
    "--sidebar-border": "#1F3A2D",
    "--titlebar-bg": "#030B08",
    "--titlebar-text": "#E9FFF0",
    "--text": "#E9FFF0",
    "--text-muted": "#91AA9B",
    "--border": "#244536",
    "--accent": "#5DBB86",
    "--accent-strong": "#8BD6A8",
    "--active-bg": "#193F2D",
    "--icon-color": "#8EB29B",
    "--icon-hover-bg": "#1C4933",
    "--icon-hover-color": "#8FE0AF",
    "--danger": "#E06C75",
    "--danger-bg": "#3A171C",
    "--success": "#78C69A",
    "--warning": "#D5A65A",
    "--input-bg": "#091711",
    "--input-placeholder": "#637D6C",
    "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.28)",
    "--shadow-md": "0 14px 34px rgba(0, 0, 0, 0.28)",
    "--focus-ring": "rgba(93, 187, 134, 0.24)",
    "--modal-overlay": "rgba(1, 8, 5, 0.66)",
    "--mono-font": "\"Cascadia Code\", \"Consolas\", monospace"
  }
}
```

## 校验规则

- `schemaVersion` 必须是 `1`。
- `id` 必须匹配 `^[a-z][a-z0-9-]{2,31}$`，且不能是 `secure`、`compact`、`warm`、`custom`。
- `name` 长度必须为 1-24 个字符。
- `variables` 必须包含上方所有变量。
- 变量值必须是字符串，且不能包含 `<`、`>`、`{`、`}`、`;`、`url(`、`@import`、`expression(`。
- 导入同一个 `id` 的主题会覆盖旧版本，并自动切换到新导入的主题。
