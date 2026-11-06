# 双端同步当前交付状态

更新：2026-11-06。本文件用于中断恢复；[正式规格](../architecture/sync.md)、[窗口协议](../architecture/sync-coordinator.md)和各任务文件仍是行为契约。完整同步目标持续active，不因单层pass结束。

|层|当前状态|准确源码/审查|工作树|
|---|---|---|---|
|84真实Store核心|独审pass，合入feff050d并主线121项自然0|修复7da43718；作者72936017；独审447e1360，118pass/3ignored；原locked drawing失败保留|旧84工作树正常移除后证据均在主线|
|85认证网络/身份|独审pass，已合入主线0ab39d70；组合lock3754d60b，主线19项自然0；生产入口待86|c88982a6修复，作者7d206973，独审59fc3f32；真实19项通过，原并发退出101保留|旧85工作树/分支已正常移除，缓存迁至/private/tmp/apple-notes-sync85-target|
|86同步设置UI|已合入＋主线整合pass|9ed9a078，独审4c85204b，主线合并d8ff3336；48＋48＋52与build/production通过|旧UI工作树/分支已正常移除，全部证据在主线|
|86前端quiet协调|独审复审pass，合入85b9e0eb，主线34+41+notes9/build/production自然0|修复0c84e589；独审092ea058关闭两P2，原blocked/反例保留|合并后的前端工作树与分支正常清理，证据在主线|
|86Rust adapter/Session/真实transport|in-progress|基线组合主线3754d60b之后；文件与前端不重叠|/private/tmp/apple-notes-sync86-adapter，codex/sync86-adapter|
|87独立环境准备|独审285970a1 pass，已合入主线，ENVIRONMENT-READY ONLY|工具62ca1cf0；17 guards；第三次18.751秒ready；尚未安装同步APK|新资源/private/tmp/apple-notes-sync87-environment-01保留、emulator-5584 stopped，工作树清理|
|87真实双端/路由/新Android/准确包|pending|两个独立生产Rust进程＋App DOM＋全新隔离Android，不用fixture代替|未创建|

84原完整lean111项exit101及drawing失败均保留。归档fixture/编译时路径和locked raw验证分别修复后，作者112项109pass/3ignored，独审121项118pass/3ignored，主线组合复验121项118pass/3ignored；不得用当前pass改写旧结果。组合依赖与两模块主线完整结果见[证据](../verification/sync8485-main-integration/README.md)。

根负责规格/派发/合并及主线完整整合；代码开发和独立审查由不同agent完成。恢复时新agent使用明确当前任务和工作树，不能恢复旧debug70任务；所有shell显式workdir，禁止写主线。原失败保留，修复后只复验受影响边界。

## 数据与设备保全

用户原Android约13秒未保存录音现场完全不碰：禁止安装/启动/停止/重启/读取/导出/备份原应用或旧AVD（含emulator-5580）。真实Android验证只可全新独立AVD/data目录，所有ADB/CDP指定新serial，不kill-server。不使用真实麦克风；录音测试用合成媒体。原Apple Notes不执行删除实验。用户既有执行授权沿用，不重复询问权限。

## 当前用户可安装包

Android快速首页83和统一设置82已交付，包见[mobile-home8283](../verification/mobile-home8283/README.md)：Mac26/Android构建16。直接画廊、黄色＋一键输入已实现，不重做。**这些包不包含当前新增同步**。同步后续准确编号拟Mac27/Android构建17，实际未构建前不冒称已包含，不覆盖旧包。

本轮资源：84/85旧树均clean后正常移除，两个已merge分支删除，独立runner symlinks已核对指向本仓库相对源，不依赖旧树。缓存/private/tmp/apple-notes-sync84-target与/private/tmp/apple-notes-sync85-target保留供86复用，不删共享SDK/node_modules/main target。

86实际两App DOM的生产连接与媒体/IME/取消验收见[整合任务](tasks/app-sync86-dom-integration.md)，待前后端源码独审合入后启动。87环境首次新AVD180秒offline，exit2/owned PID自然0停止；同新data一次software GPU/show-kernel诊断进行中，不能称ready。

87新环境最小keylink修复62ca1cf0已实际冷启成功：同data、仅owned symlink，boot_devices a003800→a003600，18.751秒boot_complete，cycle21.715秒自然0。旧两次缺super失败保留，尚未App安装/provider/sync原生验收；环境作者整理证据后独审。86发现网络与Store独立stage重复计额，采用规格明确的网络3/256MiB＋Store串行1/256MiB与直接发布，防合计超过4/512MiB。

最新恢复：前端已合入且根受影响全套通过；87环境独审通过并正常合入，base userdata allocated未变化，目录总量增长不归因该文件。两App测试基础设施可先按冻结stdin契约开发，真实最终结论仍等待86后端独审合入。
