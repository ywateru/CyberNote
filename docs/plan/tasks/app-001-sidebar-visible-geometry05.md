---
id: app-001-sidebar-visible-geometry05
scope: mac-visible-sidebar-toolbar-placement-and-background
status: verified-functional-and-limited-geometry
depends-on: [app-001-sidebar-restore-01, app-001-sidebar-menu-label-01]
---

## 目标和依据

继续用户桌面侧栏同原版要求。恢复功能已在当前Mac04实际验证，下一窄差异是可见侧栏两个按钮靠左/共同玻璃/切换黄色。权威契约 `docs/ui/macos.md` 可见侧栏顶部按钮校准05；原始证据 `verification/mac-same-columns-runtime05/`，native_ui_research独立测量328附近/412附近随侧栏右界移动（详细bbox以analysis为准）。不能把墨迹当内部frame。

## 授权实施范围

仅 `plugins/tauri-plugin-notes-ui/macos/toolbar.m` 可见sidebar组布局、该组玻璃背景显示、toggleSidebar系统labelColor。可见44pt/item，right-anchor并遵守交通灯保留空间；隐藏继续现有36pt玻璃/同位置/标题避让，三种主布局均直接可恢复、独立窗无按钮。窄侧栏新建允许溢出，切换不得溢出。保持原生产placeGroup等分/动作标签/菜单启用与路由、绑定revision、搜索对象及field editor，不增IPC、状态副本或DB字段。不改App/CSS/其他工具组、图标字体大小、侧栏行/数据。

可以给sidebar使用稳定透明宿主与稳定背景子视图，或等效不重建既有控件的最小方案；要说明macOS26玻璃与旧系统fallback、glassStyle更新、命中/AX与尺寸继承边界。不得单纯隐藏承载按钮的玻璃而把按钮一并隐藏；不得删控件后重建以通过截图。

## 交付验证

不同作者独审前，固定源hash/patch及原始失败。真实生产layout在三种主布局、700/1088/1394宽、sidebar160/208/228/273、fullSize有无和显示→隐藏→恢复连续链检查：可见候选靠右、合法交通灯空间、overflow与标题/返回/工具组无重叠；隐藏恢复与旧源一致，独立窗/其他工具组无意外变化。复用既有recording端口，旧检查的“全部36”和“正常三栏原样”断言因本任务有意更改不得照搬为产品失败，也不改写旧日志。

实际AppKit宿主检查可证明背景显示/按钮身份与color继承，但标明是否真实窗口。严格ObjC语法与现有原生toolbar控制器检查，受影响构建。无GUI/ADB/平台build/共享target/cache/下载升级/清理，>=2GiB。不stage/commit。作者与独审分离后root冻结准确HEAD、Mac离线出包、独立产物核对，再实际可见/隐藏/菜单恢复/拖窄和正常重启。JPEG不授予全窗口像素PASS。

## 固定候选与独审

toolbar SHA256 `0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5` 已由不同作者SOURCE-READY，报告 `../reviews/app-001-sidebar-visible-geometry05.md`。独立390生产layout/120连续链、真实AppKit旧/新glass/受控fallback三套各390态、strict ObjC/controller13/隔离前端build均通过。侧栏背景显式frame同步修复已纳入；旧无窗口glass命中返回effect与fixture失败保留，不当原包点击失败。实际AppKit仍使用fake NSObject窗口端口、0 NSWindow，AX仅控件label、field editor=nil，不能代替真实窗口点击/玻璃合成/IME/像素。

已知threeColumn700/side273/fullSize有无的visible/restored四态，旧标题与view重叠6pt，新旧字段相同，作为范围外限制保留。隐藏布局逐字段保持、可见候选靠右；仍待准确新Mac包对照208/228和隐藏恢复，未关闭整窗像素目标。

## 准确包实际结果05

093986d准确sealed exe333b356a…经不同作者933项产物核验后，root CUA实际top隐藏/恢复、菜单两种文字/隐藏恢复、228→208→228和正常退出新进程再隐藏恢复成功。有限正文257码点同；隐藏状态不持久化，冷启回visible，不能宣称隐藏状态冷恢复。运行docs/verification/mac-sidebar-visible05-runtime-01；独立局部分析mac-sidebar-visible05-analysis-01表明按边界移动、去共同玻璃与去黄已实现，但光学/隐藏宽度/灰度仍有差异，转任务optical06；整窗像素仍open。
