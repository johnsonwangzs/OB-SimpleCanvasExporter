# v0.1.0 验收记录

日期：2026-09-12。环境：Windows、Obsidian 1.13.7、SimpleBadge 0.5.0。初始浏览器验收使用默认深色主题和 Microsoft Edge；发布前源码修正后的 Obsidian 回归使用开发 vault 当前的默认浅色主题。验证对象为 `example-canvas.canvas` 及隔离的补充样例。

## 发布前修正后的复验

- 官方 `eslint-plugin-obsidianmd` 推荐规则：源码及 Obsidian QA 入口均为 0 错误、0 警告。
- `pnpm check` 通过：16 项单元测试、TypeScript 检查、正式构建、版本与许可证及发布文件检查。新增测试覆盖取消原因、异步超时、迟到的 Promise 拒绝、定时器清理和所有 ASCII 控制字符的路径校验。
- 实际 Obsidian 浅色主题导出：25 张卡片、24 条原生连接、16 个 Badge，无导出警告。25 张卡片的可视高度与原生相同，滚动高度差为 0–1 CSS 像素。
- 补充样例继续通过导出；未保存快照、编号保存及取消后的渲染容器清理通过。
- 重新加载正式构建后，命令面板和网络提示对话框显示正常，实际生成 `example-canvas (4).html`，无导出警告。开发 vault 已恢复正式构建并清理本轮 QA 临时文件，原始 Canvas 的哈希保持不变。
- 最低 Obsidian 版本调整为已实测的 1.13.7，中英文 README 和导出对话框补充导出期间的网络行为说明。
- 本轮没有重新执行独立浏览器回归。下列浏览器交互和离线测试为初始实现的验收记录；本轮复验覆盖实际 Obsidian 渲染、布局度量及导出文件结构。

## 初始实现验收记录

- TypeScript 严格检查和正式构建。
- 10 项单元测试：数据完整性、负坐标与特殊高度、与原生路径一致的三类兼容曲线、自动连接边、曲线边界、无效数据、缺失端点、空画布、保存路径、HTML 转义。
- 在实际 Obsidian 中导出 25 张卡片、24 条连接、16 个 Badge。24 条连接全部使用原生路径，样例导出无警告；一次测量耗时 816 毫秒（不含写盘）。
- 正式构建通过命令面板生成 `example-canvas (2).html`，该文件再次通过浏览器回归。打开按钮成功调用 Windows 文件打开功能，系统显示打开方式选择器；本机 Edge 离线测试通过。Codex 内置浏览器拒绝本地文件 URL，因此未在该内置预览中展示。
- 浏览器逐节点核对尺寸和坐标，逐边核对 ID、起终点、箭头数量与原生 SVG 路径。
- 对比 25 张卡片的原生正文：字体、字号、行高、首段边距一致；正文宽度差小于 1 CSS 像素，滚动高度差不超过 2 CSS 像素。浏览器对细边框的取整可能带来约 1–2 像素的额外滚动。
- 在 100% 视图用真实鼠标操作验证平移、长卡片滚动到底、边界不带动画布、文字拖选；HTML 离线打开，没有远程请求或页面脚本错误。
- 禁用 JavaScript 后仍有全部静态卡片，可通过页面滚动查看。
- 补充样例覆盖双链别名、标题别名、代码里的双链、居中 HTML、八种 Badge 颜色、自定义 HEX 颜色、本地 PNG 内嵌、带颜色卡片、双向和无箭头连接、连接标签。
- 补充样例验证未知文件卡片和远程图片占位；正文脚本与事件属性被清理，代码块中的脚本文字正常显示。
- Obsidian 内部行为检查验证：临时 Canvas 未落盘的新文本与新坐标被快照读取；重复保存生成编号副本并保留旧文件；取消导出后临时渲染容器被清理。

所有正文及滚动验证均针对当前版本和当前主题，不代表任意主题或动态插件的像素级兼容。

## 复现

以下命令均在项目根目录执行，将 `/path/to/development-vault` 替换为实际开发 vault 路径。

单元测试和正式构建不依赖 Obsidian：

```sh
pnpm check
```

完整视觉回归需要打开开发 vault 中的 `example-canvas.canvas`，并启用 SimpleBadge。仅在测试 vault 中执行以下 QA 构建：

```sh
node esbuild.config.mjs --qa
pnpm deploy:dev "/path/to/development-vault"
```

在 Obsidian 插件设置中停用、启用 Simple Canvas Exporter。QA 构建会导出样例、采集原生正文与路径，并在 `sce-qa-assets` 创建临时测试资源和 Canvas；它会短暂打开测试标签页并恢复原 Canvas。等待测试完成后执行：

```sh
node scripts/collect-qa.mjs "/path/to/development-vault"
pnpm test:browser
```

浏览器测试使用本机 Edge，可通过环境变量 `EDGE_PATH` 指定浏览器可执行文件。产物保存在项目 `qa/`，包括 HTML、原生参考数据、浏览器度量和全图/正文/变体截图。

`qa/` 是本地生成目录，不提交到 Git。清理该目录后，需要重新采集上述 Obsidian QA 数据才能运行 `pnpm test:browser`。单元测试所用的原始 Canvas 固定保存在 `tests/fixtures/example.canvas`。

测试完成后重新执行 `pnpm build`、`pnpm deploy:dev "/path/to/development-vault"`，并重载插件。正式构建会移除 QA 模块，不会自动导出、采集参考数据或创建测试文件。仅删除确认由 QA 创建的 `sce-qa-assets` 内容及插件目录中的 `qa-*` 文件。

原始验收 Canvas 保持不变，其 SHA-256 为：

```text
0C50775982E848866C79C1B30CBB4C8EAE5EE5C9CC98CB225CA62BEA78DD0D1E
```
