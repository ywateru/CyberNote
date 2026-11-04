---
id: app-005-unified-candidate06-01
scope: accepted-tags-and-recording-date-cross-platform-package-and-runtime
status: pending
depends-on: [app-002-audio-card-01]
---

## objective

在录音日期和手机紧凑卡经过不同作者独审、主线整合验证后，把它和已合入的标签、Mac宽三栏工具栏一起交付新的Mac完整应用与Android APK。依赖指源码门槛，不能以任务仍有设备/像素未知而永远停在旧包。root先指定精确主线冻结，开发或构建者不能自行采纳后续HEAD。本任务尚未获派发，不能提前编译平台或安装。

## context

- docs/INDEX.md、docs/requirements.md、docs/verification/README.md
- docs/plan/tasks/app-002-audio-card-01.md、app-003-tags-01.md
- docs/plan/tasks/app-001-wide-toolbar-runtime-01.md
- docs/verification/unified-candidate04/preparation/README.md及既有构建/收集/签名脚本
- docs/verification/unified-candidate04/android-recovery-01/README.md
- docs/verification/app-003-tags-main-integration-01/README.md
- docs/ui/audio-card-mobile.md、scripts/window-capture.md

## build boundary

只接受root列明的40位主线SHA、产品文件聚合及依赖/生成输入清单。Mac和Android完整冻结分别记录，不因应用源码相同就声称同一个完整构建身份。复用既有离线构建及已验证依赖缓存；不下载、升级、修改锁文件、引入proof features或任意编译flags，不复制target、不清理共享缓存、不重做未变更的扫描模块生成。

主机Rust target只给一个操作者。每输出阶段与构建监测均保留≥2GiB可用空间；不足时停止本次拥有的构建进程并保存失败，不能删除历史证据或用户数据腾空间。准确复用candidate04恢复构建中已证明可行的Android依赖环境，不能把曾失败的默认wrapper再次下载视作正常重试。若需要本地listener许可，使用正常审批，原失败保留。每次新尝试独占新目录，不覆盖旧包。

Mac保全原始完整.app与ZIP、完整本地adhoc签名副本/ZIP及严格验签结果；Android保存精确APK、签名/ABI/模型身份。建议输出分别在artifacts/unified-candidate06/及docs/verification/unified-candidate06/；实际路径和输入/输出哈希必须在开工前由root确认。构建本身不证明启动、保存或像素一致。

## runtime boundary

root独占Mac GUI，Android按用户明确允许的ADB验收执行。先核目前真实安装/运行身份、指定旧合成笔记和受管附件，再正常退出旧Mac、Android保留数据升级。禁用卸载/clear-data/权限重置/复制整份用户数据库；不强杀原版备忘录。测试只新增有唯一QA前缀的合成笔记和新录音，不改用户原有内容。源APK/.app、实际安装包、运行PID和窗口分别记账。

新包写入recordedAt后，不再切回旧candidate04/05操作同一活数据库。当前契约没有承诺旧二进制保全新字段；不得用降级掩盖错误。若Mac05仍未启动而本包先满足入场条件，保留它built/unrun的历史身份，直接在06复验宽栏改动，不回填05运行通过。

至少在两个平台分别覆盖：

- 新标签输入/提交、保存、筛选、最后匹配消失、清除筛选恢复与新建目标；系统中文输入法与受控DOM检查明确分开。
- 新录音等待后实际开始、暂停/继续、完成保存；同条卡片标题/日期/时长与受管文件身份、真实正文引用；旧录音日期仍未知。先保存再进行一次Mac正常退出或Androidforce-stop冷启，确认新旧正文/日期/受管字节保持。
- 不主动制造真实用户保存失败。设备层可安全受控的失败才做，其余精确记录源码验证及设备未知。受管音频导出检查须有该具体数据和目的地的明确授权，不把既有另一条测试音频的授权扩大到本次新录音。
- Mac宽/窄三栏、无侧栏、画廊与搜索/清除/菜单锚点；同条件原版/克隆窗口证据。截图工具只有系统权限实际生效且acceptOutput=true时才接受PNG。历史JPEG保留原编码，不标无损通过。

手机低清原片只能用于有边界的结构/相对布局对照；日期实例不同、系统键盘/状态栏不同必须披露。输出同条件截图、叠图、差异与未知，不能以模块通过或低清重采样授予像素通过。实际可听和有效收音需单独证据，不以音轨非零、UI计时或播放状态推断。

## verification

构建和设备验收由不同作者承担；root核每项产物与证据manifest。报告按源码、构建、安装、功能、持久化、原生输入法及像素分别给结论。全部历史失败和candidate04/05身份继续保留。完整应用目标、智能文件夹/绘画/扫描/数学/链接/标准格式与未覆盖交互仍继续执行，本批通过不关闭总任务。
