# dsh-plugin-mind-tree · 思维树

遍历 DeepSeek Harness 的对话上下文，列出对话中的分支节点，并把它们渲染成思维树。

> 作者：**ShOpenMind** · 仓库：<https://github.com/ShOpenMind/dsh-plugin-mind-tree> · MIT License

## 功能

- **思维树**：遍历当前会话的完整事件日志，把「轮次 → 消息 → 工具调用 → 结果」组织成**紧凑纵向大纲树**
  （适配窄侧栏、纵向滚动、不横向裁切）；默认只展开最新一轮，可「展开全部／折叠全部」，点三角逐级展开；
  **点轮次前的三角展开时自动定位到对话中对应位置**，每个有对话位置的行右侧还有 ↗ 跳转图标；
- **轮次统计**：每轮显示**消息条数与 token 消耗**（输入/输出/缓存读/缓存写/思考/合计/耗时在详情面板中细分）；
- **搜索过滤**：工具栏搜索框按文本过滤节点（保留祖先结构、命中行高亮），清空即恢复；
- **配色可自定义**：工具栏「配色 ▾」提供三套预设（**柔和**（默认）/ 鲜明 / 灰蓝）+ **「自定义颜色」分区**：
  24 类元素可逐项调色（19 类节点气泡 + 主干/子会话/被替换/派生 4 类连接线 + 分支徽章），
  选择保存在本机（`localStorage`），随时可「恢复默认」；
  默认色调经**对比度优化**（白字对比不足 4.5:1 时自动改用深色字），比原版更耐看而不刺眼；
- **气泡字号适中偏大**（主文字 13px / 摘要 12px，行高 34px），贴合 DSH 设计语言，窄侧栏里也清晰可读；
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

### 方式一(推荐):粘贴一行地址,30 秒装好,**不需要 git**

在 DeepSeek Harness 的**插件页 → 添加插件**里粘贴下面的地址(**固定链接,始终指向最新版**):

```
https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/latest/download/dsh-plugin-mind-tree.tgz
```

1. 插件页 → 点「**添加插件**」→ 粘贴上面的地址;
2. 点「**安装**」(约半分钟);
3. 在插件列表里把「**思维树 / dsh-plugin-mind-tree**」**启用**;
4. **完整重启 DSH**:
   - **桌面版 App**:按 `Command + Q`(或 Ctrl+Q)完全退出,再重新打开;
   - **`npx @deepseek-ai/dsh web`**:终端按 `Control + C`,再执行一次 `npx @deepseek-ai/dsh web`;
   - ⚠️ 只刷新网页不够 —— 插件宿主半区只有重启才加载。

> **为什么必须是这个 `.tgz` 地址**(两种常见填法都会失败):
> - 以 `.git` 结尾的 GitHub 地址 → 被当作 git 仓库拉取,而**全新 macOS 没有 git**,
>   报 `xcode-select: note: No developer tools were found`;
> - `…/archive/refs/heads/main.tar.gz` 这类 **archive 压缩包** → 文件名是 `main.tar.gz`,
>   与包名无关,插件管理器无法判断"装了哪个包",
>   报 **「无法从依赖变更中确定安装了哪一个包」**;
> - `.tgz` 是**标准 npm 包**(文件名即包名,内含 `package.json`),能被插件管理器正确识别,
>   也**完全不需要 git**;配合 `releases/latest/…` 永久指向最新版。
>
> **升级**:重新粘贴同一地址安装一次(拿到最新 release)再重启即可。

**网络不通时**:在 [Releases](https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases) 页下载 `.tgz` 到本地,填**本地文件路径**安装。

### 方式二:离线安装(zip / 本地目录,不依赖任何网络)

1. 下载 [zip 源码包](https://github.com/ShOpenMind/dsh-plugin-mind-tree/archive/refs/heads/main.zip)
   (或 [Release 页](https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases)的 `…-mac.zip`)并解压,
   得到 `dsh-plugin-mind-tree` 文件夹,放到一个固定位置(装好后**不要移动/删除**);
2. 插件页 → 添加插件 → 填**该文件夹的绝对路径**(macOS 例:`/Users/你的用户名/Documents/dsh-plugin-mind-tree`;在「访达」里把文件夹拖进输入框即可自动填全);
3. 安装 → 启用 → 完整重启 DSH(同方式一第 4 步)。

### 方式三:命令行

`dsh plugin` 子命令把参数转发给档案目录下的 pnpm,因此用 `add`:

```sh
# Release 里的标准 npm 包(推荐,不需要 git)
dsh plugin --profile <档案名> add https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/latest/download/dsh-plugin-mind-tree.tgz
# 或本地目录
dsh plugin --profile <档案名> add /absolute/path/to/dsh-plugin-mind-tree
```

装好后仍需在插件页**启用**(`plugin add` 只装包,启用由插件页或档案的 `dsh.profile.bundles` 负责)。

### 方式四(跨平台运行 DSH):任意系统(Windows / macOS / Linux)只需 Node 22+

```sh
npx @deepseek-ai/dsh web     # 浏览器打开 http://127.0.0.1:3080
```

### 安装常见问题

| 现象 | 原因与处理 |
|---|---|
| 填仓库地址报 `xcode-select` / `No developer tools` | 地址是 `.git` 结尾,系统没有 git。改用方式一的 `.tgz` 地址(不需要 git)。 |
| **「无法从依赖变更中确定安装了哪一个包」** | 你填的是 GitHub **archive 压缩包**(如 `…/main.tar.gz`),文件名与包名无关。改用方式一的 `.tgz` 地址。 |
| 填 `dsh-plugin-mind-tree` 提示「未找到相关插件」 | 本插件**尚未发布到 npm**,裸包名查不到。请填方式一的 `.tgz` 地址(方式二也可)。 |
| **「下载的安装包校验失败」** | pnpm 下载到的字节数与预期不符 —— 通常是**下载被截断/中断**(大陆网络访问 GitHub 常见),或本机 pnpm 缓存里有半截文件。处理顺序:① 点「**重试**」(多数情况一下就过);② 仍失败则**先移除**插件列表里的旧「思维树」条目再装;③ 改用**带版本号**的地址(见下);④ 走方式二本地安装(不依赖网络)。 |
| `.tgz` 地址报网络错误 / 超时 | 在 Releases 页下载 `.tgz` 后用本地文件路径安装(方式二同理)。 |
| 装完没有「思维树」页签 | 插件没**启用**,或没**完整重启**(桌面 ⌘Q;npx Ctrl+C)。 |
| 页签打开空白 / 一直连接中 | 宿主半区没重启;重启后仍失败可查看页内兼容性提示。 |

> **升级时的小陷阱**:`…/releases/latest/download/…` 是**可变地址**(新版本发布后同一地址内容会变),
> 而 pnpm 会把首次下载的**完整性哈希**记在本机锁文件里 —— 直接对同一可变地址重装,可能正好触发上面的
> 「下载的安装包校验失败」。所以**升级请用带版本号的不可变地址**:
>
> ```
> https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/download/vX.Y.Z/dsh-plugin-mind-tree-X.Y.Z.tgz
> ```
>
> (或先在插件页移除旧条目,再用固定地址安装。)

安装后右侧栏会出现「思维树」标签页(默认会自动打开;也可从右侧栏的开始页进入,或用会话行菜单打开)。
**前置条件**:GUI 视图需要档案包含 `@deepseek-ai/dsh-web-app`(桌面版/`dsh web` 默认包含);
纯终端档案下只有 `mind_tree` 工具可用。macOS 的完整图文步骤另见 [INSTALL-Mac.md](INSTALL-Mac.md)。

### Install (English)

Easiest way — **no git required** (paste the npm tarball URL, *not* the `.git` repo URL):

```
https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/latest/download/dsh-plugin-mind-tree.tgz
```

1. In DeepSeek Harness: **Plugins → Add plugin**, paste the URL above;
2. Click **Install**, then **enable**「思维树 / dsh-plugin-mind-tree」in the plugin list;
3. **Fully restart DSH** — Desktop app: `Command + Q` then reopen; `npx @deepseek-ai/dsh web`: `Control + C` and run it again. Refreshing the page is not enough.

Troubleshooting:

| Symptom | Fix |
|---|---|
| `xcode-select: No developer tools were found` | You pasted a `.git` URL (needs git). Use the `.tgz` URL above. |
| **"无法从依赖变更中确定安装了哪一个包"** (cannot tell which package was installed) | You pasted a GitHub **archive** URL (`…/main.tar.gz`) whose filename carries no package name. Use the `.tgz` URL above. |
| Network error on the URL | Download the `.tgz` from the [Releases](https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases) page and install from the local file path. |
| "Plugin not found" for `dsh-plugin-mind-tree` | It is not published to npm yet; use the `.tgz` URL instead. |
| No「思维树」tab after install | Not enabled, or DSH wasn't fully restarted. |

Prerequisite for the GUI tab: your profile must include `@deepseek-ai/dsh-web-app` (default in Desktop / `dsh web`); terminal-only profiles can still use the `mind_tree` tool.

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

## 发布新版本（维护者）

> 安装文档用的是**固定链接** `…/releases/latest/download/dsh-plugin-mind-tree.tgz`，
> 因此每次发版**必须同时上传一个不带版本号的 `dsh-plugin-mind-tree.tgz`**，否则该链接会 404。

```sh
# 1. 改版本号 + 构建 + 测试
#    (package.json version;Client 改动必须先 pnpm run build 并提交 lib/client.js)
pnpm run build && pnpm test
git add -A && git commit -m "release: vX.Y.Z" && git push

# 2. 打包标准 npm 包,并复制一份不带版本号的副本
pnpm pack                                   # → dsh-plugin-mind-tree-X.Y.Z.tgz
cp dsh-plugin-mind-tree-X.Y.Z.tgz dsh-plugin-mind-tree.tgz

# 3. 打标签 + 建 Release,同时上传两个资源
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z dsh-plugin-mind-tree-X.Y.Z.tgz dsh-plugin-mind-tree.tgz \
  --title "vX.Y.Z" --notes "…更新说明…"
```

macOS 离线包（可选，供不便联网的场景）：`git archive` 导出源码目录后打包为
`dsh-plugin-mind-tree-vX.Y.Z-mac.zip` 一并上传。

### 发布到 npm（让安装变成"填一个包名"）

发布后安装只需填 `dsh-plugin-mind-tree`，不再依赖 GitHub 直连（可走 npm 镜像，快且稳）。
本仓库的运行环境自带 pnpm（含 `login` / `publish`），无需额外安装 npm：

```sh
# 0) 一次性:注册 https://www.npmjs.com/signup 并完成邮箱验证,然后登录
node <runtime>/dependencies/pnpm/bin/pnpm.mjs login

# 1) 预演:确认打进去的内容(lib + cordis.patch.yml + README + LICENSE)
node <runtime>/dependencies/pnpm/bin/pnpm.mjs publish --dry-run --no-git-checks

# 2) 正式发布(未加 scope 的包默认 public)
node <runtime>/dependencies/pnpm/bin/pnpm.mjs publish --no-git-checks --access public

# 3) 验证
node <runtime>/dependencies/pnpm/bin/pnpm.mjs view dsh-plugin-mind-tree version
```

注意：

- **版本号不可复用**（同版本重复发布会报 `EPUBLISHCONFLICT`），发新版先改 `package.json` 的 `version`；
- 若提示需要 2FA，可在 npm 账号设置里开启 2FA 后带 `--otp <6 位验证码>`，
  或改用 **Granular Access Token**（权限 Read and write + 允许绕过 2FA）写入 `~/.npmrc`:
  `//registry.npmjs.org/:_authToken=<token>`；
- `repository` / `files` / `peerDependencies` 已配置妥当，npm 页面会自动展示仓库与依赖信息。

## 第三方依赖与许可

- **运行时依赖**:[zod](https://github.com/colinhacks/zod)(MIT)。为避免宿主要求加载,其代码随客户端构建产物 `lib/client.js` 内联分发(约 900 KB),其许可证随附于 zod 项目;
- `@deepseek-ai/*` 系列包作为外部依赖由 DeepSeek Harness 宿主提供,不在本仓库内分发;
- **开发依赖**(仅构建/测试使用):esbuild(MIT)、react / react-dom(MIT)、happy-dom(MIT)、mermaid(MIT)。
