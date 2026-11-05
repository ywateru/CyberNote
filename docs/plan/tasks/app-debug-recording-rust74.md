---
id: app-debug-recording-rust74
scope: command-driven-recording-real-rust-persistence
status: ready
depends-on: [app-mobile-recording-primary73]
---

# objective

让用户要求的高效命令验收覆盖真实Rust落盘：复用现有调试API、实际App/Editor/RecordingSession和合成音源，验证桌面暂停自动checkpoint、继续累计、跨笔记侧栏关闭，以及退出受测Rust子进程后同一隔离目录的新进程恢复。默认Fake九组保持其既有边界；新模式必须明确opt-in，不能宣称现有100/42项自动变成Rust通过。

# context

- docs/INDEX.md、docs/debugging.md、docs/testing.md
- docs/ui/recording-desktop.md、docs/plan/tasks/app-mobile-debug-recording71.md
- scripts/debug/{runtime,platform,cli,scenarios}.mjs
- src-tauri/src/{lib,session,store}.rs及session/、store/完整模块
- scripts/check-mac-recording-autosave64-store-independent.{py,rs}
- docs/verification/app-smart-u-platform-ui09/transport.rs（仅协议参考，旧源码与旧空屏障不可直接当当前实现）

# contract

1. 新增可重复的小型Rust Session/Store行协议适配器及专用录音场景。参数解析/base64解码后路由真实Session方法；不能重写存储/授权/journal逻辑，不能改生产Rust或Tauri命令来方便测试。只接受本轮新建隔离目录，默认不连接用户数据或安装应用。
2. 按字节冻结当前完整store.rs/store/**/session.rs/session/**及其真实依赖输入，保存path/hash清单；wrapper、Cargo.toml/lock、binary单独绑定。构建须显式、locked/offline、使用根独占分配的既有Cargo缓存，不自动安装依赖、不构建Mac/APK、不清共享target。缓存不可用时准确报告，默认JS套件仍可运行，绝不fallback冒充Rust。
3. register_save_intent→Session.register_save，正文saveNote→Session.save；附件store/query/cancel→Session相应方法；read_attachment先由真实Store确定note归属，再Session.sensitive及tagged。保留window、Token、revision、recordedAt和operation owner，不直接Store.action(saveNote)或猜committed。不实现的命令明确unsupported。
4. 最小场景仅普通建笔记、编辑、设置/选择、录音及附件读写，不执行lock/delete/import等屏障。未实现屏障动作显式拒绝，不能沿用旧transport的空participants/ACK no-op并称窗口已排空。native recording_local registry、系统退出/授权/窗口仍可明确Fake，只证明前端流程和真实存储，不手写第二套registry算法。
5. 三条使用fresh隔离数据的路径：A录音→暂停自动checkpoint→继续→侧栏关闭final；A录音同时编辑B→关闭后真实A音频与B最新正文；owned子进程正常退出→同目录新Session恢复。每步通过真实debug动作和状态/HTML等待，要求真实正文ACK、save.pending/failed归零、面板final后才消失、同一逻辑卡，旧committed音频版本按Undo契约保留。
6. 新Session核对A/B正文、当前附件ID/recordedAt、合成WAV字节/完整累计时长和真实AudioContext解码/后段播放。旧operation在新Session应ownership拒绝（现有64契约），不能为冷启测试允许adoption。只读取本轮合成字节，不导出用户录音。
7. 修复外部transport资源生命周期：处理spawn error、异常/超限stdout、未知/重复响应、超时及stdin错误；pending有界；close必须等待owned child真实退出并有界终止，退出前不rm目录，重开不能与旧进程并存。负例可用本轮短小协议fixture，不能只测正常路径或留下进程/计时器。失败明确报错并保留最小诊断，不忽略parse错误或退回Fake。
8. 复用当前api/state/snapshot/合成设备；不得源码字符串注入App私有接口。保留旧默认桌面100、手机43/notes9、build和production排除回归。新报告补Rust输入/binary身份与开始结束一致性、实际进程退出状态/耗时和pageErrors，区分真实Rust与Fake系统生命周期及真实设备未知。
9. 不操作原Android/模拟器或其未保存录音，不运行原版Notes、不请求真实麦克风、不复制/读取用户录音或既有数据库。只清理本轮自建中间文件，保留紧凑可复核证据。

# path

scripts/debug/中transport/runtime的必要边界、专用Rust wrapper/显式构建与录音runner；docs/debugging.md、docs/testing.md和docs/verification/debug-recording-rust74/。不扩散产品功能或录音视觉，不新增依赖或生产调试后门。

# verification

2026-11-06准备：依赖73已限定完成。只读核对可复用缓存候选`/private/tmp/apple-notes-recording-window50-independent-target`（debug/deps存在），小锁`docs/verification/qa-fix-00/store-probes/Cargo.lock`与旧09小锁SHA同为`66c00622e6c40b61212517ac93d24f93399424f80cbf481cf6cb7ccfa97aabae`。九项直接依赖源码本地存在；完整离线闭包、rustc兼容及新wrapper编译未验证。正式开发前由根独占分配该缓存，不运行旧probe冒充当前源码，不清共享target。73已修手机saved-card就绪等待，现手机基线43项；本任务不重复该修复。CLI runtime完整wall仍可能显著长于summary，需准确记录，不宣称视觉脚本提速已经修复runtime。

开发提交冻结后由不同agent独审，逐项核真实方法路由、令牌/保存意图、附件owner、旧op拒绝、完整累计字节、同目录新PID恢复与close后目录清理顺序。独立重跑专用路径与必要协议负例；默认回归、构建及生产排除均需实际exit0。根合入后运行整合，不能以wrapper静态存在或Fake suite成功替代真实Rust落盘。本任务当前仅有只读准备，不声称运行/构建通过。
