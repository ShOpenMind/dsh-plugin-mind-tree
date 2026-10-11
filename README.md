# dsh-plugin-mind-tree · 思维树

遍历 DeepSeek Harness 的对话上下文，列出对话中的分支节点，并把它们渲染成思维树。

## 功能

- **思维树**：遍历当前会话的完整事件日志，把「轮次 → 消息 → 工具调用 → 结果」组织成**紧凑纵向大纲树**
  （适配窄侧栏、纵向滚动、不横向裁切）；默认只展开最新一轮，可「展开全部／折叠全部」，点三角逐级展开；
  **点轮次前的三角展开时自动定位到对话中对应位置**，每个有对话位置的行右侧还有 ↗ 跳转图标；
- **轮次统计**：每轮显示**消息条数与 token 消耗**（输入/输出/缓存读/缓存写/思考/合计/耗时在详情面板中细分）；
- **搜索过滤**：工具栏搜索框按文本过滤节点（保留祖先结构、命中行高亮），清空即恢复；
- **过程信息三档削减**（默认「精简」，工具栏可切换；导出跟随当前档位）：

  | 档位 | 保留内容 | 真实会话实测（2491 节点 / 15 轮） |
  |---|---|---|
  | **精简**（默认） | 轮次 + 你的真实发言 + 全部分支点 + 每轮「工具活动 ×N」聚合行 + 每轮答复 | **119 节点**，大纲 8 KB |
  | **标准** | 精简 + 实质性过程文本（≥60 字）与每条工具调用（不含工具输出） | 1259 节点，136 KB |
  | **完整** | 全部节点，与事件日志一一对应 | 2491 节点，286 KB |

  工具聚合行自带被折叠调用的清单（点它即展开）、可搜索、可定位到对应轮次；
  削减只作用于展示与导出，**宿主始终返回完整数据**，随时可切回「完整」。
- **导出 Markdown / Canvas**：把思维树导出为可归档文档（含分支标记、token 统计；大纲与 JSON 跟随当前档位）；
- **分支节点识别**：
  - 替换分支（消息被编辑/重试后旧内容脱离上下文，橙色虚线连接）
  - 生成重试（`llm/retry`）
  - 用户选择（`ask_user_question` 的选项）
  - 批准决策（`approval/asked` / `approval/decided`）
  - 派生子代理 / 工作流 / 团队（`subagent`、`subagent_fork`、`workflow`、`spawn_teammate`）
  - 目标变化（`goal/change`）、任务分解（`todo_write`）、计划模式（`plan/mode`）
  - 上下文压缩（`compaction/*`）、会话分叉（`turn/end` 的 `forked`）
- **会话血缘 / 会话森林**：跨会话展示派生（子代理）与分叉关系，点击子会话可直接打开或查看它的思维树；
- **节点详情**：查看事件 JSON、在对话中定位（滚动到对应轮次）、打开子会话；
- **实时刷新**：会话产生新事件时自动更新；
- **会话行菜单**：左侧会话列表任意一行的「…」菜单里选择「查看思维树」，直接切换到该会话并打开右侧栏；
- **首次加载自动展开**右侧栏并定位到思维树页签；
- **导出（三种格式，均支持「另存为」直接存进 Obsidian 库）**：
  1. **思维导图 Markdown**（默认）：文件内嵌 Mermaid `mindmap` 代码块，**用 Obsidian 打开即显示思维导图**（零插件）；
     只保留轮次、分支点、用户真实发言与子会话（自动去噪：注入提示、后台任务通知、重复的 todo/goal 只留最后一次）；
  2. **大纲 Markdown**：全量节点（YAML 属性 + 轮次标题 + 嵌套列表），适合 Markmap / Markmind 等能把大纲渲染成交互导图的插件；
  3. **Obsidian 画布 `.canvas`**：Obsidian 原生画布格式，导入后是**可拖拽、可编辑的真思维导图**（零插件）。

## 终端 / 无 GUI 用法（`mind_tree` 工具）

插件在宿主半区注册 **`mind_tree` 工具**，因此在**没有网页客户端的终端会话里也能用**（由 agent 调用）：

| 参数 | 说明 |
|---|---|
| `sessionId` | 目标会话；省略则使用当前会话 |
| `format` | `mindmap`（Mermaid 导图 Markdown，默认）/ `outline`（全量大纲）/ `canvas`（Obsidian 画布 JSON）/ `json` |
| `view` | `tree`（默认）/ `lineage` / `forest`；后两者仅支持 `outline`、`json` |
| `level` | 过程信息档位：`compact`（默认）/ `standard` / `full`；作用于 `outline` 与 `json` |
| `writeTo` | 绝对路径；提供后**写文件并只返回摘要**（推荐，避免大内容进入上下文） |

行为要点：

- 不写文件时返回内容，**超过 4 万字符自动截断**并提示改用 `writeTo`；
- 输出与 GUI 的「导出」菜单**共用同一套生成器**（`lib/format.js`），格式完全一致；
- 本插件**不提供 CLI 子命令**：DSH 的 `dsh` 启动器没有插件级子命令扩展点，终端入口即此工具
  （例如：`dsh -p "把当前会话的思维导图导出到 D:/vault/x.md"`）。

## 兼容性

- `peerDependencies`：`@deepseek-ai/dsh: ">=0.2.0-rc.2 <0.3.0"`（声明为 optional peer，不会阻塞安装）；
  运行时不匹配时安装/激活会被 DSH 拦截（可用版本豁免强制放行，风险自负）。
- **能力探测**：启动时探测 `sessionQuery` 依赖的方法、`tools`、`fs`；缺失或工具注册失败时
  **不再静默** —— 写入宿主日志，并在 GUI 顶部显示兼容性横幅，同时出现在客户端探针的
  `hostWarnings` 字段里。
- 插件使用 DSH 的**官方但内部**接口（会话查询服务、Typert 远程协议、右侧栏 keyed slot、
  ToolRuntime 注册）；跨版本升级请先跑仓库内的 `tools/integration-test.mjs`（真实 cordis +
  真实 ToolRuntime）与 `tools/host-test.mjs`。
- **宿主半区代码变更需要完整重启应用**才会生效（重新安装插件只更新磁盘文件；F5 只刷新网页客户端）。

## 安装

在 DeepSeek Harness 中通过插件管理器安装本包（或本地路径）：

```sh
dsh plugin install /absolute/path/to/dsh-plugin-mind-tree
```

安装后右侧栏会出现「思维树」标签页（默认会自动打开；也可从右侧栏的开始页进入，或用会话行菜单打开）。
**前置条件**：GUI 视图需要档案包含 `@deepseek-ai/dsh-web-app`（桌面版/`dsh web` 默认包含）；
纯终端档案下只有 `mind_tree` 工具可用。

## 开发

```sh
pnpm install           # 安装依赖(含测试用的 react / happy-dom / mermaid)
pnpm run build         # 构建 lib/client.js(esbuild)
pnpm test              # 运行全部测试套件
pnpm run test:host     # 只跑某套:host / reduce / client / mount / render / mermaid / integration
```

宿主半区（`lib/index.js`、`lib/format.js`、`lib/reduce.js`、`lib/remote.js`、`lib/typert.host.js`）无需构建；
客户端半区源码在 `src/client.js`，构建产物为 `lib/client.js`（**改动客户端必须重新 build 并提交产物**）。

### 目录

| 路径 | 说明 |
|---|---|
| `lib/index.js` | 宿主分析引擎 + `mind_tree` 工具注册 + 能力探测 |
| `lib/format.js` | 共享导出格式化层（Mermaid 导图 / 大纲 / Obsidian 画布 / JSON） |
| `lib/reduce.js` | 过程信息削减层（精简 / 标准 / 完整三档，纯函数） |
| `lib/remote.js` / `lib/typert.host.js` | Typert 远程契约与清单 |
| `src/client.js` | 网页客户端源码（右侧栏标签页、SVG 渲染、导出菜单） |
| `tools/*.mjs` | 构建、测试与本地诊断脚本 |
| `.github/workflows/test.yml` | CI：安装 → 构建 → 产物一致性 → 全部测试 → 打包自检 |

### 测试说明

- `host-test`：合成 + 畸形事件下的宿主鲁棒性、token 聚合、替换语义（含"整段重写"保护）、工具契约；
- `reduce-test`：三档削减策略、骨架保留、边重建、边界情形；
- `client-test`：完整挂载后的交互（渲染/跳转/搜索/导出/错误路径/三档切换、真实 Mermaid 解析校验）；
- `integration-test`：**真实 cordis + 真实 ToolRuntime**（验证工具注册契约，跨版本升级的第一道防线）。
  需要 DSH 解包目录，默认取 `../asar-src/dsh/node_modules`，可用 `DSH_DSH_NODE_MODULES` 覆盖；缺失时自动跳过。
- `verify` / `export-real` / `level-report`：针对**真实会话日志**的本地诊断，会话目录默认
  `~/.dsh/sessions`，可用 `DSH_SESSIONS_DIR` 覆盖，输出目录用 `DSH_MIND_TREE_OUT` 覆盖。

## 架构

- 宿主半区通过 `ctx.sessionQuery` 只读访问会话日志与血统（`readSession`、`traceSession`、
  `readEvent`、`filterSessions`、`readTitle*`），并把分析结果以 Typert 远程服务
  `mindTree` 暴露给客户端（`forest` / `lineage` / `tree` / `detail` / `follow`）；
- 客户端半区在右侧栏注册「思维树」标签页，用 SVG 渲染树（折叠/搜索/导出/三档信息量）。

本插件只读会话数据：不写入会话、不发起模型调用、不上传任何数据。
