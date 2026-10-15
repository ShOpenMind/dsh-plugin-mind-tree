# macOS 安装说明

> 作者:**ShOpenMind** · 仓库:<https://github.com/ShOpenMind/dsh-plugin-mind-tree> · MIT License
>
> 本插件是纯 JavaScript 实现(无原生依赖),**Windows / macOS / Linux 通用**;
> CI 在 `macos-latest` 与 `ubuntu-latest` × Node 22/24 上跑全部测试,已验证跨平台。

---

## 一、准备:装 Node.js 并启动 DeepSeek Harness

1. 安装 **Node.js 22+**:
   - 官网 <https://nodejs.org> 下载 **LTS** 的 macOS 安装包(`.pkg`):
     Apple 芯片(M1/M2/M3/M4…)选 **Apple Silicon**,老 Intel 机型选 **Intel**;
   - 或 `brew install node`。
   验证:打开「终端」输入 `node -v`,显示 `v22.x` 或更高即可。

2. 启动 DSH(Web UI):

   ```sh
   npx @deepseek-ai/dsh web
   ```

   首次会下载依赖(几分钟),完成后浏览器自动打开 <http://127.0.0.1:3080>。
   以后每次使用重复这一条命令;想关掉按 `Control + C`。

   > **如果你用的是 Mac 桌面版 App**(`/Applications/DeepSeek Harness.app`),
   > 跳过上面两步,直接打开 App 即可。本文后续的"重启"对桌面版意味着:
   > **完全退出 App(`Command + Q`)再重新打开**(而不是 Ctrl+C)。

---

## 二、安装插件(三种方式,任选)

### 方式 1:填一个地址,一步装好(推荐,不需要 git)

在 DSH 左侧「**插件**」→「**添加插件**」,粘贴下面的地址(**固定链接,始终指向最新版**):

```
https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/latest/download/dsh-plugin-mind-tree.tgz
```

点「安装」,然后在插件列表里把「思维树 / dsh-plugin-mind-tree」**启用**。

> **为什么必须是这个 `.tgz` 地址**(常见的两种填法都会失败):
>
> | 填法 | 报错 | 原因 |
> |---|---|---|
> | `…/dsh-plugin-mind-tree`(仓库地址) | `xcode-select: No developer tools were found` | 被当作 **git 仓库**拉取,全新 macOS 没有 git |
> | `…/archive/refs/heads/main.tar.gz`(源码压缩包) | **「无法从依赖变更中确定安装了哪一个包」** | 文件名是 `main.tar.gz`,与包名无关,插件管理器认不出装了什么 |
> | 上面这个 `.tgz` | ✅ | 标准 npm 包,**文件名就是包名**,且不需要 git |
>
> **升级**:重新粘贴同一地址安装一次(会拉到最新 release)再重启即可。

如果这个地址报"网络错误/超时",在 [Releases](https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases)
页下载 `.tgz` 文件,然后填**本地文件路径**安装(见方式 2)。

### 方式 2:本地目录(离线 / 从 zip 安装)

1. 把 `dsh-plugin-mind-tree` 文件夹解压到一个**固定位置**,例如:

   ```
   /Users/你的用户名/Documents/dsh-plugin-mind-tree
   ```

   ⚠️ 装好之后不要移动或删除它(插件指向这个目录)。
2. 插件页 →「添加插件」→ 填**该文件夹的绝对路径**:

   ```
   /Users/你的用户名/Documents/dsh-plugin-mind-tree
   ```

   > 小技巧:在「访达」里把文件夹拖进输入框,会自动变成完整路径。
   > ⚠️ 这里**不要**填 `dsh-plugin-mind-tree` 这种裸包名 —— 那个是去 npm 上找的,会提示「未找到相关插件」。

### 方式 3:命令行

`dsh plugin` 子命令会把参数转发给档案目录下的 pnpm,因此用 `add`:

```sh
# Release 里的标准 npm 包(推荐,不需要 git)
npx @deepseek-ai/dsh plugin --profile <档案名> add https://github.com/ShOpenMind/dsh-plugin-mind-tree/releases/latest/download/dsh-plugin-mind-tree.tgz
# 或本地目录
npx @deepseek-ai/dsh plugin --profile <档案名> add /Users/你的用户名/Documents/dsh-plugin-mind-tree
```

装完仍需在插件页**启用**(`add` 只装包)。

### 最后一步(必做):完整重启 DSH

- **`npx @deepseek-ai/dsh web`**:回终端按 `Control + C`,再执行一次 `npx @deepseek-ai/dsh web`;
- **桌面版 App**:完全退出(`Command + Q`,不是点关闭按钮),再重新打开 App。

> 为什么:插件的**宿主半区**只有重启后才加载,只刷新网页不够。

---

## 三、开始使用

- 打开任意一场对话 → 右侧栏出现「**思维树**」页签(通常会自动打开);
  - 没看到?点右侧栏的「**+**」或开始页选「思维树」;或在左侧会话列表某行点「**…**」→「**查看思维树**」。
- 顶部三个视图:**思维树 / 会话血缘 / 会话森林**;
- 右上角三档信息量:
  - **精简**(默认):轮次、你的发言、分支点、每轮工具活动合计、每轮答复;
  - **标准**:加上实质性过程文本与每条工具调用(不含工具输出);
  - **完整**:全部节点,与事件日志一一对应;
- 点轮次前的 **▸** 展开该轮,并自动把左侧对话**定位**到对应位置;每行右侧的 **↗** 也能定位;
- 每个轮次显示**消息条数与 token 消耗**(输入/输出/缓存/思考/耗时在详情面板细分);
- 搜索框可过滤节点;**导出 ▾** 提供四种格式:
  - 思维导图 Markdown(用 Obsidian 打开**直接就是一张思维导图**);
  - 大纲 Markdown(跟随当前信息量档位);
  - Obsidian 画布 `.canvas`(可拖拽编辑);
  - JSON。

> 用 Chrome / Edge 导出会弹出「另存为」,可直接存进 Obsidian 库;
> 用 **Safari** 会回退成浏览器下载(功能一样,只是少一个选路径的对话框)。

## 四、在 Obsidian 里看导图

把导出的 `.md` 或 `.canvas` **拖进 Obsidian 窗口**(或复制进库文件夹):

- `…-导图.md` → 打开就是一张 Mermaid 思维导图;
- `….canvas` → 可直接拖拽、缩放的真画布。

## 五、出问题怎么办

| 现象 | 处理 |
|---|---|
| 报 `xcode-select` / `No developer tools were found` | 你填的是 `.git` 结尾的仓库地址(需要 git)。换用第二节**方式 1 的 `.tgz` 地址**。 |
| **「无法从依赖变更中确定安装了哪一个包」** | 你填的是 GitHub **archive 压缩包**(`…/main.tar.gz`),文件名与包名无关。换用方式 1 的 `.tgz` 地址。 |
| 提示「未找到相关插件」 | 你填的是裸包名 `dsh-plugin-mind-tree`。本插件**尚未发布到 npm**,请填 `.tgz` 地址或文件夹绝对路径。 |
| `.tgz` 地址报网络错误 / 超时 | 在 Releases 页下载 `.tgz` 后用**本地文件路径**安装(方式 2 同理)。 |
| **「下载的安装包校验失败」** | pnpm 下载到的字节数与预期不符(下载被截断,或本机缓存有半截文件)。① 先点「**重试**」;② 仍失败就把插件列表里的旧「思维树」**移除**再装;③ 或改用带版本号的地址 `…/releases/download/vX.Y.Z/dsh-plugin-mind-tree-X.Y.Z.tgz`;④ 或直接用方式 2 的 zip(不依赖网络)。 |
| 右侧栏没有「思维树」 | 插件没启用,或 DSH 没**完全退出重启**(桌面 ⌘Q;npx Ctrl+C)。 |
| 页签空白 / 一直「连接中」 | 宿主半区没重启。 |
| 顶部出现黄色「兼容性提示」横幅 | 你的 DSH 版本与本插件测试版本不同。把横幅文字截图反馈即可。 |
| 终端提示 `command not found: node` | Node.js 没装好,重做第一节。 |
| 点了安装没反应 | 路径含空格/中文粘贴出错;改用「拖拽文件夹」的方式填路径。 |

## 六、卸载

1. 插件页里停用 / 移除该插件;
2. 删除 `dsh-plugin-mind-tree` 文件夹(若用本地方式安装)。

---

## 附:包内目录

| 路径 | 作用 |
|---|---|
| `lib/` | **插件本体**(`client.js` 为预构建界面包,**无需编译**) |
| `package.json`、`cordis.patch.yml` | 插件清单与挂载点 |
| `src/`、`tools/` | 源码与测试(已附带,便于阅读与二次开发) |
| `examples/` | 三份**演示导出**(合成对话,非真实数据):可先用 Obsidian 打开感受效果 |
| `README.md` | 面向开发者的完整文档 |
