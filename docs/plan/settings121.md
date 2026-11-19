# Settings121 实施计划

日期：2026-11-19。设计契约：[settings121](../architecture/settings121.md)。状态：实施中。

| 任务 | 写入范围 | 依赖 | 状态 |
| --- | --- | --- | --- |
| settings121-ui | Preferences.tsx/css、AccountSettings.tsx/css、PreferencesInterfaceDetails、presentation/PreferencesPresentation，自己的验证脚本 | 无 | done（模块修复独审pass，实际App另验） |
| settings121-cloud | src-tauri/src/cloud_sync/、src/cloud-sync/、必要依赖及自身验证 | 无 | in-progress |
| settings121-update | src-tauri/src/software_update/、src/software-update/、自身验证 | 无 | done（模块修复独审pass，真实安装另验） |
| settings121-backup | src-tauri/src/local_backup/、src/local-backup/、自身验证 | 无 | done（模块独审pass，宿主另验） |
| settings121-integrate | lib.rs、App.tsx、DataManagement、Session/Store必要适配、上述模块注册和生命周期接通、调度装配 | 前四项 | pending |
| settings121-review | 独立契约/源码/运行检查，docs/plan/reviews/settings121-* | 对应模块或整合 | pending |

各开发工作树从 `f4cc2308` 隔离。主整合分支 `codex/settings121` 保留用户的AGENTS修改。参考项目只读，绝对路径为根仓库 `refs/magpie`；不复制为产品依赖。模块先提交可审查产物，独立审查通过后整合；不得擅自发布/推送/改真实账户数据。

当前提交与审查：UI `e29a7d8c` 独审 `c26e2a83` 为blocked，5项交互/视觉修正正在进行；云模块 `189b348e`、本地备份 `185d76cc`、更新 `cfde3810` 已冻结提交，独立审查进行中。`codex/settings121-integration` 是尚未接受的组合试装分支，先接线以暴露实际接口问题；不会因模块测试通过或试装编译就提前标记交付完成。增加发布标签身份小任务修复预发布包无法识别自身tag的问题，保持package稳定core版本源不变。

后续状态：本地备份最终 `37111325` 经独审 `41309a7a` pass，已接收模块到本分支；UI修复 `c68ee19b` 正在复审。更新独审 `f8662f41` 发现5项阻塞（实际ZIP展开限制、活新进程未ack回滚、安装lease准入、配置失败重试、手机开关触达），修复中。发布身份最终 `13ef2986` 正在独审，云模块 `189b348e` 也在独审。组合试装已接收四模块和UI修复，公共宿主开发与针对性验证进行中。

最新进展：UI `c68ee19b` 经 `0a464235` 复审pass，已接收；更新修复 `5f060a01` 正在复审。云独审 `85873a61` 发现锁重入、设置owner投影、control行缺失和前端确认/在途状态5项阻塞，修复中。发布身份 `0031b581` 关闭隐藏index问题，但复审发现真实大index输出ENOBUFS回归，继续修复。公共Host `6a0e3de1` 已在组合试装分支提交，实际App验证与数据面板收尾进行中，尚未独审验收。

当前闸门：更新 `5f060a01` 经 `630d9b31` 复审pass；发布身份 `db73d2d5` 经 `c12585a1` 复审pass，两者已接收。云修复 `f57c40bf` 已提交并导入组合试装，模块复审与Host新Guard/设置owner适配中。公共Host+实际App冻结点 `dfc5c841` 已完成一次完整macOS dev native编译链接、正常handler检查、6项真实Store/Session定向与桌面/手机actualApp fixture，独立三路宿主审查继续，不外推为真实云账号/设备/安装验收。

入口与调用链：Preferences创建/保留各面板 → cloud-sync/software-update客户端 → native invoke注册 → 唯一宿主/Session → Store/受检远端或下载器 → 状态与事实事件 → 设置刷新；每条链需真实现验证。旧sync设置导航转账户，冲突界面保留在账户内。导入导出继续由App的保存/录音保护协调，自动任务亦受同一边界控制。
