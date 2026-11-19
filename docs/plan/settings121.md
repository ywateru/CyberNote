# Settings121 实施计划

日期：2026-11-19。设计契约：[settings121](../architecture/settings121.md)。状态：实施中。

| 任务 | 写入范围 | 依赖 | 状态 |
| --- | --- | --- | --- |
| settings121-ui | Preferences.tsx/css、AccountSettings.tsx/css、PreferencesInterfaceDetails、presentation/PreferencesPresentation，自己的验证脚本 | 无 | done（模块修复独审pass，实际App另验） |
| settings121-cloud | src-tauri/src/cloud_sync/、src/cloud-sync/、必要依赖及自身验证 | 无 | done（模块修复独审pass，真实服务另验） |
| settings121-update | src-tauri/src/software_update/、src/software-update/、自身验证 | 无 | done（模块修复独审pass，真实安装另验） |
| settings121-backup | src-tauri/src/local_backup/、src/local-backup/、自身验证 | 无 | done（模块独审pass，宿主另验） |
| settings121-integrate | lib.rs、App.tsx、DataManagement、Session/Store必要适配、上述模块注册和生命周期接通、调度装配 | 前四项 | in-progress（源码与合成宿主通过，真实外部边界待验） |
| settings121-review | 独立契约/源码/运行检查，docs/plan/reviews/settings121-* | 对应模块或整合 | pending |

各开发工作树从 `f4cc2308` 隔离。主整合分支 `codex/settings121` 保留用户的AGENTS修改。参考项目只读，绝对路径为根仓库 `refs/magpie`；不复制为产品依赖。模块先提交可审查产物，独立审查通过后整合；不得擅自发布/推送/改真实账户数据。

模块闸门已关闭：UI `c68ee19b`、更新 `5f060a01`、本地备份 `37111325`、发行身份 `db73d2d5`、云同步 `f57c40bf` 均通过各自独立复审，历史blocked报告保留在review目录。公共宿主已接入两套命令handler、唯一Session/Store、保存与录音屏障、调度和退出生命周期；实际App桌面/手机 fixture、宿主定向测试、前端构建和macOS dev native链接均通过。

仍未把源码验证外推为外部环境验收：真实 WebDAV/S3/GitHub 服务、CyberBus 三端传输、已安装包更新替换、Android unsigned APK 安装、macOS WebKit、Android WebView/实体设备及真实用户资料库没有在本轮执行。相关界面和错误状态已明确，最终交付范围以这些剩余证据为准。

入口与调用链：Preferences创建/保留各面板 → cloud-sync/software-update客户端 → native invoke注册 → 唯一宿主/Session → Store/受检远端或下载器 → 状态与事实事件 → 设置刷新；每条链需真实现验证。旧sync设置导航转账户，冲突界面保留在账户内。导入导出继续由App的保存/录音保护协调，自动任务亦受同一边界控制。
