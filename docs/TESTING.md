# 验收记录

## v0.5.0：导出 HTML 纯色背景

日期：2026-09-17。Windows、本机 Edge；离线浏览器自动化。本轮没有向开发 vault 部署或重新执行运行中 Obsidian 的导出验收。

- `pnpm release` 通过 ESLint（零错误 / 警告）、16 项单元测试、TypeScript 正式构建和 0.5.0 元数据检查，生成 `release/simple-canvas-exporter/`。
- 新增背景专项测试：真实 `exportCanvas` 组装器配合最小 Obsidian 生命周期替身生成空画布，验证每次导出的 UUID 不同、标题转义、临时容器清理，以及内嵌运行时的换色和刷新恢复。这不替代完整 Obsidian Markdown 渲染验收。
- 验证六个预设、原生颜色控件的 input / change 事件、关闭时提交预览、HEX 三位 / 六位 / 大小写 / 空格、非法值、Escape 丢弃草稿、失焦提交，以及恢复后输入焦点。原生系统选色器外部窗口未做跨系统手动验收。
- 验证同一文件刷新记忆、query / hash 不改变身份、同名导出和不同地址隔离、重新导出 ID 隔离、损坏记录回退。额外使用浏览器路由提供同源两份 HTML，验证共享存储时仍按文件隔离；该检查没有访问实际远端服务。
- 分别模拟存储 getter、读取、写入、删除异常，确认颜色仍可调整、搜索继续可用；删除失败明确提示且可以重试。
- 比较换色前后的卡片正文、样式、坐标、滚动、连接路径 / 颜色、画布 transform、搜索结果、Badge 条件、阅读副本 / 滚动 / 字号和工具栏颜色，保持一致。覆盖半透明卡片自然透色。
- 覆盖中英文、深浅主题、320 / 650 / 1360px、低高度浮层滚动、44px 触屏控件、Tab / Escape、背景与 Badge 浮层互斥、关闭浮层不误拖画布、打印原色及脚本禁用回退。Display-P3 原色在自定义后恢复原始 CSS 值，不被 HEX 转换覆盖。
- 基于既有默认主题 / Prism 真实导出中的冻结 StyleBank、25 张卡片和 24 条连线，替换为当前阅读器生成派生夹具；`logits` 仍命中 6 张，换色不改变正文和连线。这些派生夹具不表示本轮做过新的现场导出。
- 原有搜索、阅读面板、Badge 独立浏览器回归通过，包括已有真实冻结样例。所有离线夹具无脚本异常、无自动网络请求。

复现命令：

```sh
pnpm test:background
pnpm test:search
pnpm test:reader
pnpm test:badges
pnpm release
```

背景测试结果和截图位于 `qa/background/`。没有旧采集文件时，独立测试仍可运行；可在 `pnpm test:background` 后追加真实导出路径检查冻结内容。安装 0.5.0 后需要重新导出 HTML 才能获得新功能。

## v0.4.0：Badge 筛选与可选依赖兼容

日期：2026-09-17。Windows、Obsidian 1.13.7、Prism 3.8.0、Style Settings 1.0.9；SimpleBadge 0.6.0 分别启用和关闭，浏览器使用本机 Edge。

- `pnpm release` 通过官方 ESLint、16 项单元测试、TypeScript 正式构建及 0.4.0 版本检查，准备独立安装文件。
- 新增 `pnpm test:badges`，使用生产 `ensureBadges`、`freezeTree`、`StyleBank` 配合导出器自身 CSS 验证未加载 SimpleBadge 的导出流程；验证主题色与自定义色身份、三位/六位 HEX 归一化、同名异色、实体与 Unicode、大小写、首尾空白、重复 span 按卡片去重、稳定排序与全局计数。
- 排除代码、空 Badge、隐藏、ARIA 隐藏、透明、占位和非文本节点。包含折叠段落中的 Badge，点击筛选不展开；主动导航展开所需嵌套 details 并在原卡片及阅读副本定位，结果序号不被 toggle 事件清空。
- 验证任一/全部、关键词交集与命中次数、独立清除条件、零结果恢复亮度、几何与正文滚动不变。阅读副本不进入目录，排除阅读卡片时正文和滚动位置保留，面板关键词继续高亮。
- 70 类 Badge 测试覆盖 1440、736、320px，主栏最多两行，隐藏选择仍显示数量；完整目录名称搜索、Esc、键盘选择、44px 触屏按钮、深浅色、打印、缺少 Highlight API 和禁用 JavaScript 的静态降级均通过。浏览器离线，无自动远程请求或脚本异常。
- 实际关闭 SimpleBadge 后导出 `example-canvas (6).html`，确认启用列表中不含该插件，导出器使用内置兼容样式。随后恢复 SimpleBadge、重载最终正式构建，导出 `example-canvas (7).html`，无导出警告。两份实际 HTML 均通过 Badge 回归：5 类目录；`logits` + 绿色 `logits-based` 为 5 张/7 处；`sampling-based` 与 `distortion-free` 的任一为 3 张、全部为 1 张。
- 无 Badge 样例隐藏所有筛选入口，文字搜索、结果导航照常可用。不读取 SimpleBadge 配置，不更改其代码。
- 最终实际 `(7)` 文件通过原有搜索与阅读面板回归：25 张卡片、24 条原生连线、16 个 Badge；单独搜索 `logits` 为 6 张/8 处。500 卡片搜索本机测量为 238ms（含防抖，不代表通用性能保证）。未重新运行历史 Obsidian 原生样式逐项测量的 QA 构建。
- 开发库已启用正式 0.4.0 与 SimpleBadge；原始 Canvas SHA-256 保持 `CFC660BEA83A2CD3C12B481B4469E7CC41338F94189AD3EF6C4F057C7E457306`。

```sh
pnpm release
pnpm test:search "D:/Notes/Develop/example-canvas (7).html"
pnpm test:reader "D:/Notes/Develop/example-canvas (7).html"
pnpm test:badges "D:/Notes/Develop/example-canvas (6).html" "D:/Notes/Develop/example-canvas (7).html"
```

省略路径可独立运行合成样例；追加的实际文件断言针对固定 example-canvas。Badge 测试产物保存在 `qa/badges/`，不提交 Git。

## v0.3.0：导出 HTML 阅读面板

日期：2026-09-17。Windows、Obsidian 1.13.7、Prism 3.8.0、Style Settings 1.0.9、SimpleBadge 0.6.0；独立浏览器测试使用本机 Edge。

- `pnpm check` 通过：官方 ESLint 0 错误/警告、16 项单元测试、TypeScript 正式构建和 0.3.0 版本元数据检查。
- 新增 `pnpm test:reader`：验证非空文本卡片入口、完整正文、单面板替换、独立滚动、重复打开、焦点恢复、Esc、字号上下限及页面内保留。
- 比较打开、滚动、字号调整和关闭前后的原卡片正文 HTML、尺寸、滚动高度及横纵滚动位置，保持相同。反复开关 8 次后画布中心和缩放无漂移；字号调整保留可见段落位置。
- 冻结像素字体测试验证普通正文、标题、Badge 与代码按比例缩放，颜色和字体族保留。宽代码和表格在局部容器横向滚动，长文本不撑宽面板；正文副本的 ID、片段链接、ARIA 和 SVG 引用正确重映射。
- 搜索正文副本不增加计数；手动阅读不改变当前搜索结果。结果导航能切换已打开的面板并定位第一处命中，输入、清空、零结果和“查看全部结果”保留阅读内容与位置。修改查询不替换正文节点或破坏原生文字选区；面板折叠内容的展开状态独立，Unicode 与跨行内标签匹配通过。
- 深浅主题及中英文界面覆盖 1360、900、899、650、320px；检查正文和工具栏无页面横向溢出、字号 14～22px 可用、窄屏背景画布退出交互并可恢复。触屏入口、关闭、键盘导航、打印隐藏副本、缺少 Highlight API 和禁用 JavaScript 的降级均通过。
- 复用默认主题及 Prism 的实际冻结正文后检查搜索和原卡片布局。正式构建在 Develop 开发库重载，插件列表显示 0.3.0；通过正常命令导出 `example-canvas (5).html`，无导出警告。实际文件也通过搜索与阅读面板回归：25 张卡片、24 条原生连线、16 个 Badge，`logits` 仍命中 6 张、8 处；检查了正文较长且含 Badge 的命中卡片，保存深色实际导出及浅色采集样本截图。
- `pnpm test:search` 的原有回归继续通过，包括 500 张卡片、约 100 万字符的搜索。本机最终运行约 198ms（含 120ms 防抖），仅为测试环境测量。
- 测试页面离线运行，无自动远程请求或页面脚本错误。没有执行临时 Obsidian QA 构建；使用正式构建的实际导出验证端到端流程，不将其记为所有原生样式逐项比对通过。
- 开发库原始 Canvas 的 SHA-256 前后相同：`CFC660BEA83A2CD3C12B481B4469E7CC41338F94189AD3EF6C4F057C7E457306`。开发库保留已启用的正式 0.3.0 构建。

复现独立回归（无需运行 Obsidian）：

```sh
pnpm check
pnpm test:search
pnpm test:reader
```

两项浏览器脚本均可追加实际导出文件路径；`test:search` 的实际产物断言针对固定 `example-canvas.canvas` 样例。测试 HTML、截图和 JSON 结果保存在 `qa/search/`、`qa/reader/`，不提交 Git。当前完整验证命令：

```sh
pnpm test:search "D:/Notes/Develop/example-canvas (5).html"
pnpm test:reader "D:/Notes/Develop/example-canvas (5).html"
```

## v0.2.0：导出 HTML 搜索

日期：2026-09-17。Windows、Obsidian 1.13.7、Prism 3.8.0、Style Settings 1.0.9、SimpleBadge 0.6.0；浏览器为本机 Edge。

- `pnpm check` 通过：0 lint 错误/警告、16 项单元测试、TypeScript 正式构建及 0.2.0 版本元数据检查。仅独立 HTML 阅读器的两个 Obsidian DOM 扩展偏好规则在配置中关闭，因为普通浏览器没有这些扩展；其余规则继续检查。
- 新增 `pnpm test:search`，独立生成离线 HTML，覆盖多卡片/多处计数、跨行内标签的短语、块级分隔、大小写及 Unicode 偏移、中文输入法、特殊字符、隐藏内容与占位排除、折叠内容展开后的索引刷新。
- 验证输入保持视口和各卡片滚动位置；下一张按几何顺序循环；长卡片底部与代码块横向命中可定位；淡化开关、连线/标签透明度叠加、清除、零结果、取消过期查询及打印恢复通过。
- 高亮前后正文 DOM、卡片几何和滚动高度相同；真实鼠标平移与 Ctrl+滚轮缩放通过，文字选区不因高亮被重建或丢失。
- 深浅两套样式、中英文工具栏、1360/650/320px 窗口通过布局检查与截图复核。模拟缺少 Highlight API 时卡片高亮/计数/导航可用；禁用 JavaScript 后静态卡片与原生页面滚动仍可用。导出文件测试中没有远程请求或页面脚本异常。
- 复用此前采集的默认主题和 Prism 正文/冻结样式，换入当前阅读器后通过布局不变检查。合成 500 张卡片、约 100 万字符的首次搜索含 120ms 防抖，测得约 182–183ms；该数字是本机测量，不代表所有设备或每字符都命中的极端查询。
- 正式构建在开发库重载，插件列表显示 0.2.0。通过实际命令面板生成 `example-canvas (3).html`，无导出警告；浏览器核实 25 张卡片、24 条原生连接和 16 个 Badge，搜索 `logits` 命中 6 张、8 处，导航、布局与有效连线描边正常。
- 本轮没有完成完整 Obsidian 自动 QA：首次 `--qa-edges` 入口在采集原生参照时因当前视图尚未加载某条连线而停止，尚未进入导出流程。之后将 Canvas 适应全图，恢复正式构建，通过正常导出命令及浏览器检查验证了真实产物；未将该结果记为原生参照逐项对比通过。
- 开发库源 Canvas 的 SHA-256 在本轮前后相同：`CFC660BEA83A2CD3C12B481B4469E7CC41338F94189AD3EF6C4F057C7E457306`。临时 QA 构建及其开发库日志已清理，保留正式 0.2.0 插件和编号导出文件。项目 `qa/search/` 留存截图、测试结果和自动 QA 前置条件错误记录。

搜索回归复现（不要求运行 Obsidian）：

```sh
pnpm test:search
```

还可在开发库正常导出 0.2.0 的 `example-canvas.canvas` 后，追加对实际样例文件的检查：

```sh
pnpm test:search "/path/to/example-canvas.html"
```

该可选参数针对当前固定样例的 `logits` 计数断言，不适合任意 Canvas。测试产物位于 `qa/search/`。早期版本验收记录如下。

日期：2026-09-12。环境：Windows、Obsidian 1.13.7、SimpleBadge 0.5.0。初始浏览器验收使用默认深色主题和 Microsoft Edge；发布前源码修正后的 Obsidian 回归使用开发 vault 当前的默认浅色主题。验证对象为 `example-canvas.canvas` 及隔离的补充样例。

## 发布前修正后的复验

- 官方 `eslint-plugin-obsidianmd` 推荐规则：源码及 Obsidian QA 入口均为 0 错误、0 警告。
- `pnpm check` 通过：16 项单元测试、TypeScript 检查、正式构建、版本与许可证及发布文件检查。新增测试覆盖取消原因、异步超时、迟到的 Promise 拒绝、定时器清理和所有 ASCII 控制字符的路径校验。
- 实际 Obsidian 浅色主题导出：25 张卡片、24 条原生连接、16 个 Badge，无导出警告。25 张卡片的可视高度与原生相同，滚动高度差为 0–1 CSS 像素。
- 补充样例继续通过导出；未保存快照、编号保存及取消后的渲染容器清理通过。
- 重新加载正式构建后，命令面板和网络提示对话框显示正常，实际生成 `example-canvas (4).html`，无导出警告。开发 vault 已恢复正式构建并清理本轮 QA 临时文件，原始 Canvas 的哈希保持不变。
- 最低 Obsidian 版本调整为已实测的 1.13.7，中英文 README 和导出对话框补充导出期间的网络行为说明。
- 本轮没有重新执行独立浏览器回归。下列浏览器交互和离线测试为初始实现的验收记录；本轮复验覆盖实际 Obsidian 渲染、布局度量及导出文件结构。

## v0.1.1：Prism 连线修复回归

环境：Obsidian 1.13.7、Prism 3.8.0、Style Settings 1.0.9、SimpleBadge 0.5.0。

- 原因是导出器将连接线的 `path` 单独复制到临时 SVG，丢失 Prism 选择器依赖的父级 `g`，导致计算后的 `stroke` 为 `none`。修复后同步读取仍在原生视图中的 SVG 样式；对于 Obsidian 分离的屏幕外连接，复制完整父组后再读取样式，并继承原生 Canvas 的缩放变量以保留线宽。
- Prism 样例的 24 条连接全部保留原生路径，包含 19 条在文档中的连接和 5 条被分离的连接。逐项比对线条与箭头的颜色、线宽、透明度、虚线和端点样式，均与原生参考值一致。
- 独立的原生 Canvas 覆盖默认色、六种预设色、自定义 HEX 色、双向箭头和无箭头，共 8 条连接，全部通过样式及路径检查。
- 将用户提供的原始导出与修复后的 Prism 导出按实际 CSS 声明归一化比较，25 张卡片的内容、尺寸和冻结样式没有变化，16 个 Badge 保留。
- 默认浅色主题的完整 QA 同样通过：24 条示例连接、8 条彩色连接、快照、取消及编号保存检查正常；25 张卡片的可视高度差为 0，滚动高度差为 0–1 CSS 像素。正式构建、官方 lint 和 16 项单元测试通过。
- 最终正式构建在 Prism 下通过命令面板生成 `example-canvas (2).html`：24 条原生路径均有有效描边，屏幕内外线宽一致；25 张卡片归一化后的内容及样式与原始导出完全相同。开发 vault 已重载正式构建并清理 QA 临时文件，原始 Canvas 和原始 HTML 均未改动。
- Prism 的正文布局单独记录：原有导出在部分长卡片上存在滚动高度差，本次仅修复连线，没有修改该行为。`--qa-edges` 明确跳过默认主题的正文高度阈值，保留测量结果；`--qa` 仍执行原有正文高度断言。
- 本轮检查在实际 Obsidian 中采集计算样式，并解析导出的 HTML/CSS 核对结果；没有重新执行独立浏览器交互或离线回归。

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

测试主题连线兼容性时，可将构建命令替换为 `node esbuild.config.mjs --qa-edges`。该模式仍执行全部连线、Badge、取消、快照及保存检查，同时记录正文布局差值，但不套用默认主题的正文高度阈值。`behavior.json` 中的 `nativeLayoutChecked` 表明是否执行了该阈值检查。连线参考和附加彩色样例保存在 `edge-paint.json`、`colored-edge-paint.json` 和 `colored-edges.html`；浏览器测试也会检查线条是否具有有效的描边。

浏览器测试使用本机 Edge，可通过环境变量 `EDGE_PATH` 指定浏览器可执行文件。产物保存在项目 `qa/`，包括 HTML、原生参考数据、浏览器度量和全图/正文/变体截图。

`qa/` 是本地生成目录，不提交到 Git。清理该目录后，需要重新采集上述 Obsidian QA 数据才能运行 `pnpm test:browser`。单元测试所用的原始 Canvas 固定保存在 `tests/fixtures/example.canvas`。

测试完成后重新执行 `pnpm build`、`pnpm deploy:dev "/path/to/development-vault"`，并重载插件。正式构建会移除 QA 模块，不会自动导出、采集参考数据或创建测试文件。仅删除确认由 QA 创建的 `sce-qa-assets` 内容及插件目录中的 `qa-*` 文件。

原始验收 Canvas 保持不变，其 SHA-256 为：

```text
0C50775982E848866C79C1B30CBB4C8EAE5EE5C9CC98CB225CA62BEA78DD0D1E
```
