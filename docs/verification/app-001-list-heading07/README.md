# Mac list heading07 — final author source-ready evidence

基线 HEAD `48b651df7644d27dd0b699273f0a09e79f97723d`；依据 `docs/plan/tasks/app-001-list-heading07.md` 与 `docs/ui/macos.md` 07契约及root最后批准的15.25/top9.5收敛。这里只修改产品 `plugins/tauri-plugin-notes-ui/macos/toolbar.m`、`src/style.css`，没有数据/导航/菜单/协议/依赖/编辑器变更。作者结论为限定范围source-ready，待不同作者独审、准确包与原版同条件运行；不授予完整像素PASS。

## 当前产品与范围

最终 `product.patch` SHA256 `0d8fc16f581cc21d6da4ef24e14cef72186cf28655bd1020c4faca021f36c87e`。起始15px补丁保留为 `product-initial15.patch`，SHA256 `80cb26a99a35ccda14b0d2e726efc3c8dece7708b173862b4e0e478bb2aff177`。

| 产品文件 | SHA256 |
| --- | --- |
| toolbar.m | `be75271f92f9e3d58476962d1a06d7c4a4285c68d5bafa1c9e2d25151a2825c0` |
| style.css | `eeff3cc31a139fe48543ed9f7daf013c470fee5d703968acdb61d5c583f7262d` |
| 未改 App.tsx | `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4` |

原生title/count仅threeColumn共同用y11/27，高18/15与font13/11不变。原zeroSearchGeometry仍单独控制textX−1；galleryBrowse/galleryExpanded/independentNote继续9/28。已有横向布局、group、overflow、sidebar隐藏/恢复及对象身份不改。

CSS只命中 `.desktop.native-toolbar:not(.gallery-browse):not(.gallery-edit):not(.separate) .notes-scroll:not(.gallery) > .note-entry:first-child > .date-section`。最终候选font15.25、line20、height40、padding-top9.5、border-bottom-width.5；保留左右16、bottom13、weight700及其余声明。后续组仍top19/h49。没有平移notes-scroll或修改笔记行，也没有固定color覆盖主题ink。

## 执行结果

- `strict-objc.json`：完整toolbar+format，ARC/blocks、min12、Wall/Wextra/Werror，exit0。
- `controller13.json`：现有13项原生控制器受控transport检查pass。
- `frontend-build.json`与最后CSS收敛后的`frontend-build-final.json`：pnpm build均exit0，保留现有chunk-size提示；没有平台构建。最终toolbar未再修改，因此不重复其严格ObjC/controller/layout检查。
- `product-whitespace.json`：指定两产品文件diff检查pass。
- `layout02/`：完整生产controller、真实AppKit控件，26个有限状态；普通、zero、隐藏/恢复、228/208/160、nonfull、跨四模式和missing-search。比较baseline/candidate的全部输出，只有目标三栏两个label的y可变，x/宽高/字体/其他group/button/search/overflow/可见性逐项相同。每次apply后重复layout并检查root/title/count/search/background/groups/buttons/contents对象身份；实际NSApp.windows始终0。没有构造真实NSWindow、输入、field editor或原生像素验收。
- `webkit04/`：真实本机WKWebView，非持久websiteDataStore、完整生产CSS及生产列表DOM结构；14个有限场景，含native可见/隐藏/compact/恢复、非native、mobile类、宽Android类、两gallery、separate、置顶首组、首项无日期和真正zero。可排除场景before/after指标完全相同；目标首组实际排版满足候选；后组和row自身样式/高度相同，流起点随首组39→40顺延1CSSpx。测试viewport固定1394×500，场景改变app class/width，不能当作手机viewport/设备验收。没有React运行时或真实交互。
- `webkit05/`：最终15.25/top9.5按root批准契约，只再渲染一次candidate，复用已冻结04 baseline及相同完整CSS基线、DOM和14-case脚本，原路径/hash记录于`reused-baseline.json`；14场景同样pass。最终对应helper/JS/check脚本副本、PNG、完整metrics、window diagnostics和量图均保留。

WK页面没有远程资源。默认受限执行01/02失败，系统服务访问获准后03/04成功；绝未用Chrome冒充WK。helper自身不构造/order/activate窗口，WK初始化产生一个框架内部`TUINSWindow`：window-diagnostic明确记录visible/key/main全false、appActive=false、webViewAttachedToWindow=false。不能声称进程内完全没有NSWindow。

## 同文实际WebKit像素

`webkit03/`与`webkit04/`的baseline/candidate PNG逐字节相同，均2788×1000、DPR2。`webkit-ink-measurements.json`以同一未缩放ROI、120/160/200中性墨迹阈值比较截图与已保存原版17 JPEG；`webkit-first-group-contact.png`为1:1局部。

| 阈值160 | “今天”半开bbox | 宽×高 | 首组分隔线主行 |
| --- | --- | --- | --- |
| 基线完整CSS真实WK | `[489,122,549,151)` | 60×29 | 180/181 |
| 15px候选真实WK | `[489,130,545,157)` | 56×27 | 183 |
| 已保存原版17 JPEG | `[489,130,546,158)` | 57×28 | 183 |

基线精确复现保存的06克隆日期墨迹；15px候选改善上缘8px和分隔线，但还差1px宽/高。阈值200时候选宽57，高仍27。不能以此报像素完全一致，也不能从requested字体栈鉴定原版实际字形字体。

## root补充的两个有界候选

`font-candidates01/`仅在fixture末尾覆盖font-size15.25、15.5，各渲染一次，不改产品。两者line20/h40/top9/bottom13/.5border保留，首组bottom92CSSpx、divider183。`measurements.json`记录各阈值bbox、墨迹数量、medianRGB、meanLuminance与来源hash；`contact.png`保留4行1:1局部。

| 字号 | 120 bbox / 宽高 | 160 bbox / 宽高 | 200 bbox / 宽高 | 墨迹中位灰120/160/200 |
| --- | --- | --- | --- | --- |
| 原版17 | `[489,130,545,158)` 56×28 | `[489,130,546,158)` 57×28 | 同左57×28 | 41/41/42 |
| 15 | `[489,130,545,157)` 56×27 | 同左56×27 | `[489,130,546,157)` 57×27 | 38/38/38 |
| 15.25 fixture | `[489,129,546,157)` 57×28 | 同左57×28 | `[489,129,547,157)` 58×28 | 38/38/38 |
| 15.5 fixture | `[489,129,547,157)` 58×28 | 同左58×28 | `[489,129,548,157)` 59×28 | 38/38/38 |

15.25在160阈值字框尺寸更近，但上缘比原版高1px；15.5偏宽。没有单一字号同时对齐上缘、尺寸、灰度。root据此明确更新task/UI契约为15.25/top9.5；没有继续字号扫描或色值微调。旧15、15.25/15.5fixture、所有原始失败均保留。

## 最终收敛量图

`webkit05/measurements.json`、`contact.png`和`final-raster-analysis.json`对应最后一次真实WK候选。160阈值最终bbox为`[489,130,546,158)`、57×28，与原版17同bbox；首组divider同183。实际Range为top62.5CSSpx（原15.25/top9 fixture为62），block top52/bottom92保持。

墨迹仍不同：阈值160最终549像素、原版610，中位灰38/41；阈值120最终57×28、原版56×28，阈值200最终58×28、原版57×28。故相同160字框并不是完整光栅或颜色一致。保留主题ink以免固定浅色灰损坏Dark，颜色、字形抗锯齿、正式包与整窗验收继续open。

## 完整保留的失败

1. `production-layout.json`、`layout01/`和`check-layout-failed01.py`：首次把隐藏保留视图的历史frame纳入恢复全等检查，baseline的narrow160同样失败。实际隐藏→恢复后不可见group/button保留曾布局frame。baseline/candidate同态逐字段比较原已全部通过；第二轮仅对“恢复”的不可见frame归一化，仍比较可见frame/隐藏标志，产品没有为fixture改动。
2. `webkit01/`及`.failed01`脚本：默认执行baseline/candidate45s有界超时。`webkit02/`及`check-webkit-failed02.py`去掉离屏RAF并记录生命周期后，两者均webcontent-terminated，stderr保留无法创建launchservicesd扩展。获准访问本机渲染服务后，完全离线的03/04成功。
3. `webkit-ink.json`和`analyze-webkit-failed01.py`：分析首次假设15px候选字高应完全等于原版，失败。最终测量如实记录27 vs28，没有修改图像或产品迎合断言。

`inputs-open.json`保存开始输入及tracked文件身份；`baseline-toolbar.m`、`baseline-style.css`为完整基线。`source-audit.json`核对开始tracked文件，产品只两指定路径；root同步更新的task/UI契约单列，`inputs-final.json`记录最终批准契约和固定研究输入。`output-manifest.json`覆盖本目录除自身的全部文件，按路径排序聚合。所有失败保留。本轮未GUI/ADB/安装/平台build/共享target-cache/下载升级/清理/stage/commit。准确包与原版同条件运行、独立作者复核及剩余像素差继续由root组织，当前不关闭像素验收。
