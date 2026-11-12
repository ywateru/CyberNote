# 工作区整理与提交

2026-11-12，用户追加要求将工作区未提交工作整理检查并一并提交。本次保留所有既有产品修改、历史失败和研究成果，没有重写历史包或覆盖原始证据。独立静态审阅见[审阅记录](../../plan/reviews/app-sync108-workspace-audit.md)。

## 已整理提交

| 提交 | 内容 |
| --- | --- |
| `26384ebe` | 忽略新插件Android build/.gradle/.tauri、应用.tauri输出和根tmp；本地文件保留 |
| `d5db0718` | 产品源码与工具整体快照，294文件；保留媒体插件、原生入口、编辑模块、设置、字体及许可、构建身份和定向检查 |
| `0c328921` | 现代化设计、任务、独立审阅及验证记录，217文件 |
| `fbdb6d3b` | 有正式文档索引的历史设计图、线框及展示页，29文件 |
| `099460a1` | 音频转写研究与Speech API实验，78文件；反汇编摘录保留原工具空白 |
| `70dad4f4` | 本轮同步分析、任务和测试清单；尚未声明实际三端测试完成 |

完成上述六个提交后主工作区 `git status --short` 无输出。仓库 `git remote -v` 无输出，因此没有执行远端推送；提交保存在本地main。后续同步修复与测试工具另行提交。

## 当前源码检查

- `pnpm typecheck`：exit0。
- `pnpm build`：exit0，1967模块；保留既有JS chunk大小提示。
- `pnpm test:schema`：exit0，96文档用例。
- `pnpm test:editor`：exit0，真实schema/state/history、表格与撤销边界。
- `pnpm test:native-toolbar`：exit0。
- `pnpm test:build-info`：exit0。
- `pnpm version:check`：exit0。
- 附件画廊：24桌面、5原生投影、4手机检查通过；这是浏览器及投影边界，非原生设备验收。
- 菜单资源生命周期、表格控件和视频恢复定向浏览器检查：exit0。
- `scripts/sync-network-test` 的 `cargo test --locked --offline`：23测试通过，覆盖生产同步网络模块；不替代当前双原生App和Android三端验收。
- `scripts/check-startup.mjs` 本次运行在初始化阶段长时间未返回，已派独立诊断；不能引用历史artifacts结果宣称本次通过。
- `sync-settings` 桌面与手机组的首次本轮运行均在“同步设置独立滚动分类/唯一dialog”断言失败，各3项前置检查通过。已定位 `runtime.reset()` 只等待debug/idle，未等待启动动画解除root的inert/aria-hidden；无reset的同条件观察为inside=true/dialogs=1。原失败保留于各自fresh目录，修复后必须另目录正式复测。

此次检查不是全部功能验收。静态发现的媒体HTTP请求头超时、Mac外部附件临时副本预算和主线程准备风险已记入独立审阅，未通过本轮整理提交被追认为已修复。正式日志保留于 `/private/tmp/sync108-workspace-checks` 和 `/private/tmp/sync108-network-tests.log`；后续诊断和复验单独追加。

## 本轮定向复验

主工作区随后整合启动隔离、原生测试驱动和工具修复。启动模块作者完整 Rust 回归为227通过、4项既有ignored；独立复核另执行启动9项通过。原生启动脚本修正了清理信号记录与最终通过计算，5项工具故障用例通过；Node原生驱动协议与进程生命周期11项通过。这些工具测试不冒充真实同步业务结果。

2026-11-12 主工作区 fresh 浏览器复验：启动页17桌面＋4移动检查通过；同步设置桌面与移动组各56通过。使用真实 React/App、Chrome157和独立JS IPC fixture，不证明Rust网络或原生设备。证据摘要、源指纹、原始路径与SHA见 [browser/results.json](browser/results.json)。原失败仍保留。

启动脚本原先在拦截模块加载时等待 `document.fonts.ready`，形成相互等待；现以有界字体状态、绘制帧和CDP截图检查。reset原先未等待启动层移除，现等待真实inert/aria-hidden解除。设置桌面的后续失败是旧测试统一要求44px按钮：现有全局界面规则明确桌面下限28px、手机44px，测试据实际 `.preferences-mobile` 分支检查，窄桌面进入手机布局仍要求44px。只修测试契约与失败诊断，没有调整产品按钮布局。

双桌面和三端的实际业务结果分别记入本目录的执行报告；不得用以上浏览器/协议结果替代。

## 最终收尾

双桌面最终run07为35项通过（含B→A反向原文件），三端最终run05为4场景通过，原始失败及run04等中间通过轮次均保留。最终共享native helper包含关闭后尾帧fatal检查；Android独占锁支持owner token与幂等close；浏览器启动结果在清理完成后计算。主工作区Node故障/协议17项通过，最终产品指纹与两类真实运行匹配，实际执行工具版本分别记录，见[integration-check.json](integration-check.json)。

源码、工具、文档和证据均按独立实现/修复/验证提交整合到main，未合入代理父级的临时巨大快照或Gradle输出。测试APK、桌面binary、原JSON与日志在ignored `artifacts/sync108/`保全，数据库/私钥不提交。ADB映射与driver lock已清理、owned Gradle/Kotlin正常停机，桌面测试PID全部退出；手机独立测试包与合成数据保留。无Git远程地址，因此未推送。
