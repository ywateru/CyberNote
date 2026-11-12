# CyberNote 界面密度与搜索边框验证

2026-11-07。对应本轮界面字号、图标与间距同步调整，以及搜索框边框修复。最终 macOS 产物位于 `artifacts/appearance-density/`。

## 最终行为

设置 → 设置中提供两个独立的五档选项，即时生效并自动保存。

| 档位 | 界面文字基准 | 编辑器正文基准 | 顶栏高度 | 默认侧栏 / 列表宽度（宽窗口） |
| --- | ---: | ---: | ---: | ---: |
| 极小 | 12px | 12px | 45px | 181px / 260px |
| 小 | 13px | 14px | 49px | 196px / 282px |
| 中（默认） | 14px | 16px | 53px | 212px / 303px |
| 大 | 16px | 18px | 60px | 242px / 347px |
| 极大 | 18px | 20px | 68px | 272px / 390px |

界面密度以设计稿的 18px 基准做比例调整，覆盖侧栏图标、行高、标签、列表留白、顶部工具、搜索框及设置面板。边界线保持 1px，搜索聚焦边框为 2px。系统交通灯保持 macOS 标准尺寸，位置跟随顶栏高度居中。窄窗口在同一字号下采用较小的列宽；放不下的工具进入“其他工具”。

编辑器正文、标题、任务框和录音卡使用独立的编辑器比例。改变字号不改写笔记内容。栏宽保存为逻辑宽度，避免切换字号后再次缩放而逐次膨胀。

## 搜索边框根因与修复

旧实现同时存在两层边框：外层容器的 CALayer 灰边框，以及 NSSearchField 的系统焦点环。焦点环使用 `NSInsetRect(bounds, -10, -4)` 和另一套圆角参数，导致聚焦时出现两条不重合的胶囊轮廓。

现在由一个原生搜索容器统一绘制普通、悬停和聚焦轮廓，内层 field/cell 关闭系统焦点环。Web 预览同样由单一 `.search-box` 绘制边框，输入框不再叠加矩形 outline。普通、悬停和聚焦的外框位置、尺寸与圆角保持不变。

测试中另修复了两个实际问题：AppKit 尚未输入时不发送 begin-editing 通知，现改为读取真实 first responder 判断焦点；隐藏侧栏且界面很小时，列表顶部“显示选项”可能与侧栏切换按钮相撞，现按空间移入原生工具溢出菜单。溢出图标也跟随密度，浅深色外观同步原生栏。

## 验证结果

| 验证 | 覆盖与结果 |
| --- | --- |
| 页面视觉矩阵 | 80 组通过：五档 × 1000/1280/1560/1920px × 浅/深色 × DPR 1/2。1000px 使用 600px 高度。 |
| 同步比例 | 每组检查实际计算字体、图标、文件夹行高、内边距、顶栏高度、列宽及设置图标比例。 |
| 搜索状态 | 普通、悬停、空框聚焦、输入与清除；断言外框位置、宽高、圆角恒定，无内层 outline；搜索结果与清除恢复正确。 |
| 工具与设置 | 无横向溢出和工具重叠；所有工具在顶栏或溢出菜单可达；菜单边界、Escape 关闭与恢复焦点、设置面板和下拉控件边界通过。 |
| 独立与持久化 | 五档 UI/正文逐项验证互不影响，刷新保留；五档下侧栏和列表共 10 次拖动、保存与重新载入通过；大编辑器文字在 UI 缩放时保持不变。 |
| 实际编辑操作 | 从溢出菜单插入标签，并使用 Undo 恢复隔离文档，通过。 |
| 原生几何与搜索 | 40 组通过：五档 × 四种窗口宽度 × 浅/深色；真实 AppKit field editor 聚焦、输入、回调、失焦；1×/2× 位图输出。 |
| 其他原生布局 | 160 组通过：上述 40 组分别检查画廊浏览、画廊编辑、独立笔记和隐藏侧栏，无工具/标题/搜索相撞。交通灯居中及点击保留区域通过。 |
| macOS 实机 | 本次 release 构建中确认两组设置、五档原生菜单、极小/小切换、搜索输入/清除与焦点轮廓。验证后恢复原“界面小、编辑器中”偏好。 |
| 移动端 | 390px 设置面板完整，两个字号可切换；实际音频 NodeView 的触控、键盘、进度、展开/收起及内容隔离回归通过。 |
| 其他回归 | TypeScript、20 项原生栏状态/事件测试、26 项原生 UI 插件 Rust 测试、96 项文档 schema 用例及编辑器动作通过。 |
| 产物 | macOS release 构建通过；交付副本重新进行本机 ad-hoc 签名并通过 `codesign --verify --deep --strict`。 |

自动化浏览器使用新建隔离配置和合成笔记/录音；原生几何测试使用独立 NSWindow，不接触用户数据库。AppKit 离屏缓存的有文本截图会与真实窗口的系统清除按钮渲染有差别，因此清除按钮最终另以实际窗口确认；不将离屏位图视为所有系统状态的逐像素认证。1×/2×为位图/浏览器渲染覆盖，并非切换真实显示器缩放。发行包为本机签名包，没有 Developer ID 公证。

## 证据与复现

- 完整页面截图与 80 组测量：`artifacts/appearance-density/browser/browser-check.json`。
- 栏宽/溢出操作/移动端设置：`artifacts/appearance-density/interactions/browser-check.json`。
- 原生 40 组与其他布局 160 组：`artifacts/appearance-density/native/native-check.json`。
- 搜索状态对照：`artifacts/appearance-density/search-states.png`。
- 发布：`artifacts/appearance-density/CyberNote.app`、`CyberNote-macOS.zip`。

```sh
pnpm typecheck
pnpm test:native-toolbar
pnpm test:schema
pnpm test:editor
cargo test --manifest-path plugins/tauri-plugin-notes-ui/Cargo.toml
pnpm test:native-appearance
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs \
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
DENSITY_MATRIX=1 pnpm test:desktop-appearance artifacts/appearance-density/browser
```
