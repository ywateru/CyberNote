# Android附件75：源码修复与受控链

本目录区分源码复现、浏览器手机布局/合成边界、当前Rust真实存储和原Android设备。原Android/模拟器及约13秒未保存录音始终未操作。用户设备“附件不能保存”的原生根因仍unknown；下面已证缺陷不能直接等同于用户现场根因。PDF目前仍为本地文件卡/下载，不声称Apple Notes预览或像素一致。

## 已保全失败

- `before/multi-image.json`与PNG：启动基线`002273d8`未修改产品，手机390×844，`attachment.choose`保留原目标、FileChooser真实change一次两PNG、仅read边界650ms延迟。两媒体/正文已ACK，但第一张永久AccessChanged错误。`before/run.log`自然exit0，wall8.52s。附原始重放脚本，绝不能拿它现在运行的结果替换原失败。
- `before/empty-mime-forced.json`：同原基线，真实input/FileList传入空File.type，PNG存成octet-stream/file。`empty-mime.json`是最先的未复现：Playwright自动按png名推断image/png，保留它以说明为何必须明确模拟空type。未知字节不能按扩展名猜。
- `before/reader-abort.json`：真实FileReader.read后abort，原Promise未结束，idle200ms为TIMEOUT。`read-boundaries.log`自然exit0，wall7.86s。后续源码onabort显式reject，原operation保留重试。
- `before/empty-note-multiple.json`：在其他75修复已开发、插入选区修复之前，新空笔记一次真实FileList选PNG+TXT；两份stored，最终仅TXT正文引用，DOM是自动ProseMirror-selectednode。wall9.94s。`development-failures/rust-empty-target.json`和`rust-heading-target.json`同样保留真实Rust第一/二次runner的丢引用：先写标题也会自动替换，最初“只是fixture选区”的解释已被新证据否定。
- `development-failures/retry-banner.json`：实际恢复后旧error仍使idle失败；修复仅完整流程成功且pending/failed/batch/OCR为空才清。`cancel-observer.json`：取消等待晚读后，其原run的故意失效错误覆盖取消成功；fileSelected仅cancelRequested不重复上报，取消handler自身失败仍保留并上报。

## 修复边界

仅本次新插入attachment的自动NodeSelection，在原chain同一事务移动到后续输入段落，必要时创建paragraph。原书签仍用于用户显式选旧卡的替换，原权限/epoch/owner/正文/Editor校验不变。原committed媒体保留Undo/历史，不按当前未引用一概删除。普通文件与录音local分支的特殊目标规则保持分开。

媒体最多三次总readAttachment，typed MetadataStale/前端AccessChanged每次重新走完整bridge/gate，拒绝bytes从不创建URL；其他错误不泛吞。所有媒体提供手动重试，原lifetime/id/kind/version和URL释放保持。仅空MIME识别已知PNG/JPEG/GIF/WebP/PDF字节签名，签名不证明文件有效。解锁但仍locked的笔记入口遵守Rust原有附件禁止策略。

## 正式冻结结果

正式源码包含两个提交：`4052e8aafea7fa51eda6dd5be8420901155dad7d`为产品、runner与Rust wrapper冻结；`11fa62c80526aefe5ab6f7c1ea15713083fcdb45`仅修正builder收集缓存registry身份的ENOENT处理，不改变产品、其他runner或Cargo依赖。前一提交的默认桌面/手机录音/手机笔记及前端构建结果继续有效，没有因builder单文件修改重跑这些无影响组。

| 验证 | 源码 | 结果 | 进程完整wall |
| --- | --- | --- | --- |
| 默认桌面九组 | 4052e8aa | 100 PASS，exit0 | 54.83s |
| 手机录音 | 4052e8aa | 43 PASS，exit0 | 23.97s |
| 手机笔记 | 4052e8aa | 9 PASS，exit0 | 15.34s |
| `pnpm build` | 4052e8aa | exit0；原有Vite大于500KB提示 | 9.30s |
| 手机附件 | 11fa62c8 | 43 PASS，exit0 | 46.66s |
| 当前Rust wrapper显式构建 | 11fa62c8 | exit0 | 2.86s |
| 手机chooser→当前Rust Session/Store→新进程恢复 | 11fa62c8 | 21 PASS，exit0 | 12.24s |
| 严格Rust进程/协议负例 | 11fa62c8 | 18 PASS，exit0 | 4.44s |
| 正常生产包排除调试入口 | 11fa62c8 | API与标记均不存在，URL不能启用，exit0 | 1.90s |

所有浏览器正式summary均记录`gitDirty:false`、`sourceInputsChanged:false`、`pageErrors:[]`；Rust结果的前后指纹同样不变。4052指纹为`5b81e114c06b86cdd89ddcc67aa37598b080aac98e3799c88e10e56200c27d52`，11fa为`7988ded2a1060c244993aa70415e5c3a59b8df8d950ec99ee7fb34704e37ff8e`。两者差异包括builder本身，不能将指纹写成相同。所有exit0均已读取最终工具回执；表中wall来自外层`time -p`，含清理与自然退出，非仅summary内计时。完整命令、会话号和退出信息在`final/runs.json`。

`final/mobile/`保留43项summary、实际HTML/semantic快照、两PNG恢复图及390/320宽浅/深色长文件名卡片；输入使用实际隐藏input的FileList/onChange/FileReader，不拿`attachment.submit`代替chooser往返。默认JS Fake明确模拟原生IPC、窗口、OCR、退出和故障；合成音源不证明TCC/硬件。`final/desktop/`、`recording/`、`notes/`保留各组summary/suite/catalog与完整run日志。

`final/real-rust/`使用独立fresh合成目录，第一次进程PID80791自然exit0后才由新PID81096打开同目录，恢复两份唯一正文引用和原始字节。新Session不能收养旧operation，旧Token读取被拒；lock/delete/import barrier明确unsupported，未伪造空参与方ACK。此受控链证明源码Session/Store持久化与恢复，不包含Tauri IPC、Android WebView或系统选择器。

`final/rust-build/`保留24输入路径逐文件hash、Cargo.lock hash、83 graph packages、82 registry packages的实际完整源码文件聚合hash和依赖图。该缓存82包均缺`.cargo-checksum.json`，显式记录`registryChecksumSha256:null`及`registryChecksumMissing:true`；不伪称registry侧车校验已通过。仅此文件ENOENT允许缺失，其他IO错误仍抛出。冻结二进制SHA256为`600c5f2aa8c0ccbf844dce5bf828af70692110390ec8582511e9d4251ca57396`，7194224字节；构建输入前后不变。没有自动构建、替换依赖或回退Fake。

## 保留的工具失败

第一次正式builder在4052源码已成功cargo编译，但身份收集遇缺失registry checksum侧车而exit1，wall6.27s，未运行wrapper；其partial build.json、cargo build.log与外层失败日志在`development-failures/first-formal-rust-builder/`。11fa仅处理上述ENOENT并完整记录实际源码身份，随后build02通过。

两个旧补充脚本`check-attachment-submission.mjs`与`check-attachment-cancellation.mjs`均在data-URL loader导入当前bridge时缺`./metadata-client`，exit1、分别wall0.59/0.61s，**执行用例数为0，未计入PASS，也不作为产品失败**。本轮按冻结范围不适配旧loader。`final/legacy-loader-gap.json`记录完整原始日志绝对路径、字节数和SHA256；原始大日志仍在本地/tmp，不把巨大的嵌入源码错误堆栈重复入库。

## 未完成边界与保留文件

独立复审由主线程另行汇总，本目录只报告本工作树结果。Android原生“附件不能保存”的用户现场根因仍unknown；Android新包、原设备恢复、系统文件选择器与原版像素一致尚未验收。原约13秒未保存录音现场保留；不执行74桌面录音真实Rust、不构建Mac/APK、不操作原版Notes、真实麦克风或用户文件。

本目录不复制Cargo target、整个harness、缓存或合成数据库。正式/tmp原输出暂保留供主线程审阅；源码快照可由已提交builder重建。共享Cargo target已交还主线程/独审使用，本工作树不再写入或清理它。
