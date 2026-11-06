# 双端同步当前交付状态

更新：2026-11-06。用于中断恢复；[正式规格](../architecture/sync.md)、[窗口协议](../architecture/sync-coordinator.md)和任务文件仍是行为契约。完整同步目标持续active，单层pass不等于交付。

|层|当前状态|准确源码/审查|工作树|
|---|---|---|---|
|84真实Store核心|独审pass，合入feff050d；主线121项118pass/3ignored|修复7da43718；独审447e1360；旧drawing失败保留|旧84树/分支已正常清理，缓存保留|
|85认证网络/身份|独审pass，合入0ab39d70；组合依赖3754d60b；主线19项自然0|修复c88982a6；独审59fc3f32；原并发退出101保留|旧85树/分支已清理，缓存迁至/private/tmp/apple-notes-sync85-target|
|86同步设置UI|合入d8ff3336，主线完整受影响组pass|修复9ed9a078；独审4c85204b|旧UI树/分支已清理|
|86前端quiet协调|两P2独审复审pass，合入85b9e0eb；根34+41+notes9/build/production自然0|产品0c84e589；独审092ea058；根证据b563eb64＋原始log bfda3f79|旧前端树/分支已清理；原blocked与反例完整保留|
|86Rust adapter/Session|独审c11dcc56 blocked，原作者修复中；未合入|fb6a265f/作者1b4c5d87全套通过仍漏Session内媒体IO；64MiB preflight4708ms/flush13637ms持锁，原证据保留|/private/tmp/apple-notes-sync86-adapter，codex/sync86-adapter，作者sync86_adapter_develop|
|86两实际App DOM|基础设施3352b913冻结，真实最终验收待修复后端build09与独审|探索06的36项业务断言通过，最终exit1为只读WAL证据打开；修复后尚未正式重跑，不能记完整pass|/private/tmp/apple-notes-sync86-dom，codex/sync86-dom，作者sync86_dom_develop|
|87隔离Android环境|独审285970a1 pass且已合入，ENVIRONMENT-READY ONLY|工具62ca1cf0，17 guards；第三次18.751秒ready；未安装新APK|资源/private/tmp/apple-notes-sync87-environment-01保留；emulator-5584 stopped；环境工作树已清理|
|87新Android原生|初版HOST-TOOLS独审复审通过合入fc696e96；根8+10+21自然0；剩余工具开发，安装等待准确新同步APK|修复920eb6b1/作者064e4820；独审396a7fa4对应5d48e524；原P2日志保全；ADB/boot/install均0|/private/tmp/apple-notes-sync87-native，codex/sync87-native，作者仅host补exact export/真实peer/重启编排|
|87实际路由与换址UI|UI独审34项通过，单独接收05ee05ee；主线56+56/build/production自然0；LAN21项作者通过；实际wss被TLS provider panic阻断|UI66958c1d/runner7323d818/作者4e3a3f37；独审7ce136da对应a8687e87；真实路线仍需新binary验收|路线runner与native产品未合入；/private/tmp/apple-notes-sync87-routes保留待后续|
|87准确包/完整目标|pending|Mac27/Android17拟号未构建；临时build驱动仅准备，未执行|根协调最终主线测试和准确包|

根负责规格、派发、合入和主线完整整合；开发和独审由不同agent负责。恢复时只给明确当前任务/工作树，不能唤醒旧debug70任务。所有shell显式workdir，禁止其他agent写main；原失败保全，修复后只恢复受影响边界。

## 证据与资源

84原lean111项exit101及drawing失败保留；后续作者112、独审121、根121各准确标示。组合依赖与84/85主线结果见[证据](../verification/sync8485-main-integration/README.md)。前端原34项未覆盖两P2的事实保留，修复后[独审](reviews/app-sync86-frontend-recheck.md)和[根整合](../verification/sync86-frontend/main-integration/README.md)已完成，不外推Rust/App/原生。

87环境前两次缺super/fatal reboot失败wrapper exit2保留；同新data仅修controlled encryption-key link后第三次自然0、18.751秒ready，随后owned emulator自然0停止。独审P3收窄：资源目录总量增加；base userdata allocated_bytes前后均105316352，不归因该文件。环境ready不证明APK/provider/sync。

86组合媒体预算按0f95545a规格：网络最多3文件/256MiB＋本地capture串行1文件/256MiB，合计≤4文件/512MiB，单blob≤256MiB；网络完成文件严格校验/fsync后同文件系统rename直接发布，不复制第二份。后端新完整回归初次142pass/2fail/3ignored、网络lib8pass/1fail原件在作者树待保全；不能追认为pass。

主线src-tauri/target、node_modules、SDK及84/85复用target保留。后端作者2026-11-06最后Tauri check自然0、14.47秒后已释放main target；如后续再次借用须明确所有权，不并发build污染准确输入。

## 数据与设备保全

用户原Android约13秒未保存录音现场完全不碰：禁止安装/启动/停止/重启/读取/导出/备份原应用或旧AVD（含emulator-5580）。所有ADB/CDP显式新serial并核新AVD/PID/WebView，禁止kill-server。真实mic不用，录音仅合成媒体；Apple Notes不做删除实验。用户已有直接执行授权沿用，不重复询权限。

当前用户可安装包仍为[快速首页82/83](../verification/mobile-home8283/README.md) Mac26/Android16；直接画廊、黄色＋一键输入已交付，不重做。它们不包含当前新增同步。新包生成、核包和设备安装分别记账，不能提前宣称完成。

最新阻断：独审fb6a265f/c11dcc56确认两条媒体IO长持Session；原作者按短snapshot gate、锁外IO、最终凭据重验修复，复用不可变File凭据与独立路径hard-link契约分别见2df2ecda/b8b87db2。真实双进程独审22项（不是早先口头24）通过，锁探针自然101为负向失败。实际wss升级101后Rust在CryptoProvider选择处panic，22ms错误被误报timeout；原作者同时修TLS初始化与channel错误分类，不能延长timeout掩盖。

DOM03/04/05原清理失败、错误primary假设保全；清理问题已定位为关闭回调promise未结算，观察实际terminal事件后smoke02自然0。探索06三Rust自然0、三页面无pageErrors，最终失败为SQLite只读证据打开；3352b913改为全部children退出且WAL缺失/0之后immutable只读、前后DB hash相同。07因backend源码漂移在启动前拒绝，原log保留；仍等准确build09正式重跑。native输入P2已经原作者修复、独立18项实际子进程反例及8+10+21复审通过，主线host整合也通过，原blocked/泄露原件保留；精确导出与peer/lifecycle扩充及实际设备仍待单独完成。所有host准备和修复均ADB0。
