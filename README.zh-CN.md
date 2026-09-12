# Simple Canvas Exporter

[English](README.md) | **简体中文**

将当前 Obsidian Canvas 导出为单文件 HTML。卡片保持坐标与尺寸，正文可以选择、复制和独立滚动；浏览器可以离线打开，无需安装 Obsidian 或 SimpleBadge。

## 使用

1. 打开一张 Canvas。
2. 按 `Ctrl+P`，搜索 `Simple Canvas Exporter`。
3. 执行 **Export current Canvas to HTML**。Obsidian 使用中文时，命令为 **将当前 Canvas 导出为 HTML**。
4. 确认 vault 内的输出路径，点击导出。默认保存到 Canvas 旁边；同名文件自动变为 `name (2).html`，不会覆盖。
5. 点击 **Open in browser / 在浏览器中打开**，或直接用浏览器打开生成的 HTML。

Windows 尚未设置 HTML 默认打开程序时，会出现“选择应用”窗口，选择 Edge、Chrome 等浏览器即可。

导出读取当前视图，包括尚未写入磁盘的改动。默认导出整张 Canvas，包含屏幕外的卡片，正文滚动位置从顶部开始。

HTML 初始适应全图。点击 **100%** 查看原始 CSS 像素大小；拖动空白区域平移，在卡片内滚动阅读，`Ctrl+滚轮` 缩放。卡片不会随浏览器宽度重排或被正文撑高。

## v0.1.0 支持范围

| 内容 | 行为 |
| --- | --- |
| 文字卡片 | 保留位置、大小、顺序、边框、颜色和圆角 |
| Markdown | 通过 Obsidian 渲染段落、标题、粗体、列表、引用、代码块、表格等，再保存静态样式 |
| 基本 HTML | 支持居中、文本标签等常用正文排版 |
| 双链 | 保留实际显示文字、别名和颜色，不跳转到源笔记；代码里的 `[[...]]` 保持原样 |
| SimpleBadge | 保存现有 Badge 的文字、颜色、背景、边框和字号，包括八种颜色与自定义颜色 |
| 连接 | 优先保留当前 Canvas 的原生 SVG 路径；支持箭头方向、双向箭头、无箭头、颜色、文字标签 |
| 本地图片 | 将正文中的 PNG、JPEG、WebP、GIF 内嵌到 HTML；单张上限 16 MiB，总资源预算 48 MiB |
| 主题 | 固定导出时的明暗主题及正文计算样式 |

首版面向桌面 Obsidian。文件卡片、网页卡片、分组暂时保留位置并显示占位内容；嵌入笔记、PDF、远程图片等给出占位和导出说明。动态插件组件、复杂 SVG、依赖伪元素的主题装饰不保证完整还原，导出文件不运行笔记里的脚本或 Obsidian 插件。

原生 Canvas 路径通过集中隔离的内部接口读取；接口不可用时使用经过样例校准的兼容曲线，并在结果中提示。连接标签使用通用标签样式。字体不会打包，换到未安装原字体的电脑时可能发生换行差异。不同浏览器的细边框及滚动范围存在像素取整差异。

## 隐私与网络访问

插件读取当前 Canvas 和 vault 中引用的图片，将 HTML 保存到 vault 内。插件不会上传导出内容、采集遥测、要求账户或访问 vault 之外的文件；打开导出文件时调用系统为 HTML 配置的默认应用。

导出期间，Obsidian 的 Markdown 渲染器和已启用插件可能请求卡片引用的远程资源，例如在线图片。请求可能发生在不支持的资源被替换为占位文字之前，因此导出过程不具备网络隔离能力。如需确保卡片引用的远程内容不被请求，请离线导出。

生成的 HTML 内含样式、阅读器脚本和支持的本地图片，会阻止自动加载远程资源，可离线阅读。外部超链接仍可点击，只有主动点击时才打开目标地址。

## 安装

手动安装时，将 `main.js`、`manifest.json`、`styles.css` 放到 `.obsidian/plugins/simple-canvas-exporter/`，然后在 Obsidian 社区插件设置中启用 **Simple Canvas Exporter**。使用自定义配置目录时，请相应替换 `.obsidian`。本项目生成的 ZIP 包内含插件目录。

要求桌面版 Obsidian **1.13.7 或更新版本**；实际验收环境为 Windows、Obsidian 1.13.7、SimpleBadge 0.5.0 与 Microsoft Edge。其他桌面平台、后续版本和第三方主题仍需实测。

## 开发

使用 Node.js **22.16 或更新版本**与 pnpm。在项目目录执行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm deploy:dev "/path/to/development-vault"
```

`pnpm dev` 持续构建。部署只复制插件的三个运行文件；修改后在开发 vault 中将插件停用再启用即可加载。请将 `/path/to/development-vault` 替换为实际路径；部署命令必须显式指定 vault，也可以直接执行 `node scripts/deploy.mjs "/path/to/development-vault"`。

`pnpm check` 执行 Obsidian 官方 ESLint 规则检查（不允许警告）、单元测试、TypeScript 正式构建及发布元数据检查。`pnpm release` 通过上述检查后，将运行文件和许可证复制到 `release/simple-canvas-exporter/`。QA 入口位于 `tests/`，正式构建不会包含测试代码。

目录按用途组织：`src/` 保存插件源码，`tests/` 保存测试及固定样例，`scripts/` 保存开发脚本，`docs/` 保存补充文档，`assets/` 保存 README 图片。依赖、包缓存、生成的 `main.js`、`qa/` 测试产物和 `release/` 发布包均不提交到 Git。清理 `qa/` 后，可按[验收文档](docs/TESTING.md)重新生成所需数据。

代码职责：`canvas.ts` 校验与几何计算，`runtime.ts` 当前视图及原生路径适配，`render.ts` 正文渲染，`styles.ts` 样式快照和静态清理，`assets.ts` 图片内嵌，`export.ts` 组装与保存，`viewer.ts` 浏览器阅读交互。

详细验收结果与复现流程见 [TESTING.md](docs/TESTING.md)，原始设计见 [DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)。GitHub 上传及社区提交流程见英文[发布指南](docs/RELEASING.md)。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
