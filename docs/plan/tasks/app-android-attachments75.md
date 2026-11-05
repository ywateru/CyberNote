---
id: app-android-attachments75
scope: android-attachment-save-and-command-regression
status: done
depends-on: [app-mobile-recording-primary73]
---

# objective

优先处理用户2026-11-06新报告：安卓版添加附件无法保存，并继续完善显示效果。先定位手机附件提交的实际失败边界，修复可复现缺陷；建立手机布局的真实App→FileReader→Session/Store→正文ACK→新进程恢复命令验收。不能只运行桌面Fake组就把Android故障关闭。手机显示按HTML、几何和图片检查，完整原生与像素结论保持开放。

# context

- docs/INDEX.md、docs/requirements.md、docs/architecture.md、docs/debugging.md、docs/testing.md
- docs/plan/tasks/app-002-attachment-submit-01.md及其失败/取消/独审证据
- docs/plan/tasks/app-debug-recording-rust74.md（真实Rust传输可共享的契约；本次先覆盖附件，桌面录音路径后续执行）
- src/App.tsx的capturePickerTarget/fileSelected/validatePickerTarget/submitAttachmentBatch，src/attachment-{submission,target}.ts，src/bridge.ts
- scripts/debug/{runtime,platform,cli,scenarios}.mjs及当前Session/Store完整模块

# contract

1. 用手机布局及真实App handler复现附件选择/提交，不跳过原目标、授权或保存队列。分别检查单图、PDF/普通文件、多文件、同名重选、取消后重选、延迟读取与正文保存失败后的重试；每条成功须真实ACK、一个正确引用及pending/failed归零。对当前代码未出现的用户故障不得猜测归因，明确已复现与未复现。
2. 合成File和系统选择器边界可模拟。至少一条手机路径使用按当前源码显式构建的Session/Store小型Rust进程及真实附件字节/正文持久化，另一新进程同一fresh目录恢复并核对文件字节与引用。只使用本轮合成数据。复用既有小Cargo.lock，locked/offline，不安装依赖、不构建整机包。冻结全部递归Store/Session依赖、wrapper、lock和二进制hash；不可运行旧二进制证明当前源码。
3. register_save_intent→Session.register_save，saveNote→Session.save，附件store/query/cancel→Session对应方法；read_attachment先由真实Store确定owner再sensitive/tagged，保留Token/window/revision/recordedAt，不绕过Session。旧op不能由新Session收养。不支持的lock/delete/import屏障明确拒绝，不使用旧transport空ACK冒充。系统生命周期保留显式Fake，不能把它写成Android原生通过。
4. 如复用外部transport，owned child关闭必须等待退出后才删除/重开目录；处理启动失败、非法响应、超时和pending拒绝，失败不fallback Fake。新runner使用明确opt-in，默认Fake组保持；不为测试引入生产调试后门或第二套附件算法。
5. 产品修改仅针对有证据的bug。失败保留文件、原始目标和operation供重试；不能通过放宽epoch/owner/document检查、猜committed或删除既有媒体解决。界面应准确显示成功/失败与重试状态，手机附件卡片不溢出或被遮挡。无原图证据不编造视觉相同结论。
6. 不操作原Android/模拟器，不安装/停止/重启/复制原应用或其未保存约13秒录音，不读取用户数据库/录音，不操作原版Notes。用户已授权直接运行命令；不再询问许可。

# path

必要的src/App.tsx、附件模块/bridge及相关手机CSS；scripts/debug的手机附件group/runner与真实Rust构建/transport；docs/debugging.md、docs/testing.md、docs/verification/android-attachments75/。如发现生产Rust缺陷，先将最小证据及修改范围报根，再实施；不改依赖/归档格式，不扩散录音交互。

# verification

开发须冻结提交并由不同agent独审，保存失败原始证据和修复前后结果，记录精确源码身份、命令自然退出码、完整wall、Rust源/二进制身份、pageErrors、HTML/rect及截图。最低回归：桌面100项、手机recording43及notes9、pnpm build、production排除；新增手机附件测试单独计数。独立复跑真实Rust新进程恢复和关键错误重试，不以浏览器代替Android chooser/IME/设备验收。不构建APK来掩盖未复现；本任务按实际结果标source-ready或in-progress，用户原生故障未证实前不关闭父附件任务。

根独占分配本轮开发可复用Cargo缓存：`/private/tmp/apple-notes-recording-window50-independent-target`，只有开发agent可写，复核时串行交接；禁止删除共享target。2026-11-06开始时37GiB可用、无匹配cargo/rustc进程，完整离线闭包待实际构建。原task74桌面录音场景暂不执行；共用设施以本任务输出为准，后续更新task74依赖。

# completion / 2026-11-06

限定源码修复与受控链完成，不关闭父附件/原生/像素目标。产品4052e8aa、builder-only11fa62c8，开发证据bb70756a；[独审](../reviews/app-android-attachments75.md)7e8ee7fd为PASS/SOURCE-READY，无blocking；主线eccba2dd合入后[串行整合](../../verification/android-attachments75/integration/README.md)9条命令均自然exit0：桌面100、手机录音43/笔记9/附件43、协议18、真实Rust21、构建与生产排除。87输入指纹7988ded2…37ff8e前后相同、clean/pageErrors空。独审另29浏览器/14真实Rust故障恢复通过；首次旧100ms断言失败和probe工具失败按原样保留。

已修：自动NodeSelection覆盖前附件引用、多图同步后永久预览错误、空MIME已知签名识别、FileReader abort/error永悬、重试成功残留错误及取消晚observer覆盖成功；原权限/owner/正文校验不变。当前Rust锁定离线构建和同目录新PID恢复实际通过，记录24源/83包依赖图与actual registry hash，缺失checksum sidecar明示missing，不伪报校验。无生产Rust/依赖变动、无APK构建安装、原Android录音现场未动。下一优先[原生76](app-android-attachments-native76.md)。
