# 双端同步当前交付状态

更新：2026-11-06。本文件用于中断恢复；[正式规格](../architecture/sync.md)、[窗口协议](../architecture/sync-coordinator.md)和各任务文件仍是行为契约。完整同步目标持续active，不因单层pass结束。

|层|当前状态|准确源码/审查|工作树|
|---|---|---|---|
|84真实Store核心|作者冻结，独审进行中|d484ab95＋证据e69d7a7c；前次111 lean原始exit101（104pass/4fail/3ignored）保留，新独审分离路径fixture问题与产品|/private/tmp/apple-notes-sync84，codex/sync84-core|
|85认证网络/身份|独审pass，等84后组合合入|c88982a6修复，作者7d206973，独审59fc3f32；真实19项通过，原并发退出101保留|/private/tmp/apple-notes-sync85，codex/sync85-network|
|86同步设置UI|已合入＋主线整合pass|9ed9a078，独审4c85204b，主线合并d8ff3336；48＋48＋52与build/production通过|旧UI工作树/分支已正常移除，全部证据在主线|
|86前端quiet协调|开发中|固定probe/prepare/release与线性化取消收据；不同agent开发，后续独审|/private/tmp/apple-notes-sync86-frontend，codex/sync86-frontend，基线d8ff3336|
|86Rust adapter/Session/真实transport|pending|待84/85通过合入后分配，文件与前端不重叠|未创建|
|87真实双端/路由/新Android/准确包|pending|两个独立生产Rust进程＋App DOM＋全新隔离Android，不用fixture代替|未创建|

84完整lean旧失败：Session fixture基于CARGO_MANIFEST_DIR在lean crate错位；3旧archive测试在应用data root内导出，早于84的生产契约已拒绝。新独审保留原失败，独立harness只纠正测试路径，原冻结产品不改。独审尚未出结论，不能写为通过。

根负责规格/派发/合并及主线完整整合；代码开发和独立审查由不同agent完成。恢复时新agent使用明确当前任务和工作树，不能恢复旧debug70任务；所有shell显式workdir，禁止写主线。原失败保留，修复后只复验受影响边界。

## 数据与设备保全

用户原Android约13秒未保存录音现场完全不碰：禁止安装/启动/停止/重启/读取/导出/备份原应用或旧AVD（含emulator-5580）。真实Android验证只可全新独立AVD/data目录，所有ADB/CDP指定新serial，不kill-server。不使用真实麦克风；录音测试用合成媒体。原Apple Notes不执行删除实验。用户既有执行授权沿用，不重复询问权限。

## 当前用户可安装包

Android快速首页83和统一设置82已交付，包见[mobile-home8283](../verification/mobile-home8283/README.md)：Mac26/Android构建16。直接画廊、黄色＋一键输入已实现，不重做。**这些包不包含当前新增同步**。同步后续准确编号拟Mac27/Android构建17，实际未构建前不冒称已包含，不覆盖旧包。
