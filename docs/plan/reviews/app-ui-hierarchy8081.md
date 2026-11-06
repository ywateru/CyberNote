# 80/81 UI 组合独立复核

状态：**SOURCE-READY，独立源码/精准 DOM/原生模型 gate 全部通过，无未关闭 blocking**。最终组合产品源码 `ad3a069f8b28f88533d91a7ee3269c992f6f30f9`（候选证据 head `96c2565c`），122 项输入 sourceFingerprint `0818145c2f31dc49b58cba93ba30711747e82c405cdb6bc0923b14bc92457ab9`，独立执行前后相同。原生/模型的 6 项已验证冻结输入与最终 commit 逐字相同，按准确 SHA 复用已通过结果；controller20 也按未变源码 SHA 映射。旧组合 `74108461` / ffa7… 是修复前的真实失败基准，保留在各 attempt 身份中。

## Finding 状态

| 编号 | 问题 | 状态与证据 |
| --- | --- | --- |
| F81-1 | 81 首次 inventory 失败，无 snapshot 时备份区被 `data&&usage` 隐藏，失去导入恢复入口 | `0662a336` 修复，最终 `ad3a069f` **FIXED-VERIFIED**：无 snapshot 错误态双备份可用、取消无虚假成功、重试恢复总览，沿用 accessBlocked/录音/忙保护 |
| F80-1 | 普通 native update in-flight 时排队 overlay，旧请求随后 search_composition/stale_search 拒绝，desired overlay 被搁置 | `d72fef22` 修复，最终 `74108461` **FIXED-VERIFIED**；controller20 含 deferred 两错误、恢复及不自旋反例 |
| F80-2 | 修 F80-1 新增 searchRecords 保留过宽，旧搜索可跨导航/正文/授权上下文恢复 query | 最终 `74108461` **FIXED-VERIFIED**：显式 searchScope、边界清理、旧 scope 仅确认 transport sequence，不采用 value/intent；20 项 controller 包含跨边界及 invalidate 并发 |
| F80-3 | 预览保存按钮 busy disabled 导致焦点落 BODY；随后 Escape 不能关闭，Tab 可能逃到背景 | `ad3a069f` **FIXED-VERIFIED**：document capture 仅 live/连接/可见预览消费 Escape/Tab，卸载移除；最终仍复现真实 BODY 焦点，成功后直接 Escape、错误后 Tab/ShiftTab/Escape、取消后直接 Escape 均通过 |

F80-3 修复前证据：`docs/verification/ui-hierarchy8081-independent/dom-attempt03/escape-after-export.json`、`escape-after-export-failure.png`、`escape-after-export-failure.html.txt`。旧产品 section.onKeyDown 无法收到 BODY 上的按键。最终流程保留原成功→直接 Escape 顺序，未提前 Tab/主动聚焦掩盖问题；最终 escape-after-export.json 记录 BODY 焦点且 previewCount=0、documentUnchanged=true。

## 已完成的精确检查

- 81 `4a996cfc` helper 与真实后端首 filesystem path 行、后 appended duplicate metadata 行顺序一致；按首个 relativePath 计实际 size，保留所有 metadata 行，null 不计占用，未使用 declaredSize 替代实际值；类型总和不符会抑制误导条并显示警告。分类/全部明细、search/page、请求 ticket 与访问切换清理静态通过。
- 80 global preview 是 `.app` 直接子层，脱离 NodeView/编辑器，仍受 access-sync 直接子层保护。clearSensitive/coverSynchronization 同步 hidden/移除 src，媒体 source disposal 同步关闭。稳定 opener 读取当前 App 笔记、授权及文档引用；原字节保存沿用79鉴权与共享 pending。
- App 的 contentOverlay 汇总 imagePreview 与数据管理，只进入 native projection，不进入 mobile picker 的 nativeScope。Rust contentOverlay serde default=false，guest→Rust→ObjC 链一致。
- 官方 drag fixture 与本机 Cargo `tauri-2.12.5/src/window/scripts/drag.js` 逐字相同，SHA256 `2d47d2e302512024af4ded95b89f8b1f5c8d83530d287c252052112901a59888`；三个 fallback header 不再绑定重复 React 双击 handler，desktop drag attr 为 deep，手机无 drag attr。

## 独立执行结果与边界

| 执行 | 结果 | 完整 wall |
| --- | --- | --- |
| 精准 controller | 自然 exit 0，20 passed | 0.202691s |
| 生产 Objective-C 隔离 harness compile | 自然 exit 0，无诊断 | 1.058441s |
| 生产 Objective-C 隔离 AppKit run | 自然 exit 0 | 0.606882s |
| 新增 Rust overlay 模型测试 | 自然 exit 0，1 passed / 25 filtered | 31.374019s |
| DOM attempt01 | 自然 exit 1，21 项先通过；验证驱动写 `.html` 经既有 symlink 被 Vite 监控而触发 reload，waitForIdle context destroyed | 7.211561s |
| DOM attempt02 | 自然 exit 1，21 项先通过；保存后 Escape 断言失败 | 7.517833s |
| DOM attempt03 | 自然 exit 1，21 项先通过；增加现场诊断确认 F80-3 | 4.252125s |
| 最终精准组合 DOM + macOS 官方 drag | **自然 exit 0，38 passed，pageErrors=0**，源码前后相同 | **5.309649s**（内部 5.150321s） |

attempt01 未追认为通过；attempt02/03 已排除 watcher reload。之后 runner 把实时输出写临时目录并使用 `.html.txt`，完成后才保全 docs。每轮 sourceFingerprint 前后均同一 ffa7…，不同驱动版本分别保存 run-focused-dom-attempt01/02/03.mjs；真实失败没有覆盖或移除。

21 项已通过的精准 DOM 检查包括：三个 header 的官方 macOS double-down 不 toggle、stationary double-up 各 toggle 一次、后续 React dblclick 不重复，移动取消，button/search/editor 五类零 toggle；实际图片按钮打开保护全局层、正文无保存按钮、真实字节/MIME/natural 尺寸、52px chrome 模拟几何、保存取消零写与成功原字节。在最终补丁上完整 38 项已自然通过：另外验证成功后直接 Escape、错误后 Tab/ShiftTab 环回与 Escape、取消后直接 Escape；无 snapshot 统计失败仍有两个可用备份入口、备份取消不误报、重试恢复；database/logs/image/other/all/overview 公共导航驱动真实面板且不重新读取 snapshot，全部文件可搜索真实数据库行。失败 attempts 不追认为通过。

原生 harness 直接链接生产 ObjC bind/update/root，验证真实 NSWindow zoom frame 变化/恢复、控件 hitTest、真实 AppKit field editor marked text、overlay 工具隐藏/恢复、过期 revision 及 search 值保留。单击 drag 覆写为计数避免实际输入。浏览器 macOS drag 是官方 JS 事件链与生产 React DOM，window IPC/文件 inventory 仍为 synthetic，52px native top 仅 CSS 模拟；它们不代替真实 AppKit，也不证明完整 WKWebView 像素一致。

## 持久证据与操作范围

独立证据根 `docs/verification/ui-hierarchy8081-independent/`：

- native/：完整命令、环境、stdout/stderr、source-before/after、result、保全映射；大 binary 在 artifacts/ui-hierarchy8081/verification-extract/native/，不入 docs。
- frozen-static-identity.json：准确 App/controller/runner/官方 drag blob SHA。
- controller-final*：20 项完整结果与命令。
- dom-attempt01/02/03/、focused-dom-attempt01/02/03*、对应 runner：失败现场、截图、HTML 文本、source identity、真实退出记录。
- dom-final/：最终 38 项完整结果、source-before/after、3 组截图/HTML文本/快照及成功 Escape 诊断；preservation-map 逐文件校验临时输出→持久位置。
- focused-dom-command.json / stdout / stderr 与 run-focused-dom.mjs：最终准确命令、自然退出、完整 wall、runner SHA；final-source-identity.json 映射最终冻结源码及复用 native/model 输入。

未 stage/commit；验证驱动未操作候选 index/dist（runtime 使用独立临时 Vite cache）；未启动已安装应用、原版备忘录、真实麦克风或 Android 设备，原 Android 约13秒未保存录音现场未触碰。AppKit/Cargo/runtime 自然结束，主项目 target 缓存与候选共享测试环境均已交还。
