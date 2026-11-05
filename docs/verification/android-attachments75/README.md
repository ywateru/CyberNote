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

开发阶段38项手机附件及真实Rust21项已跑通；正式冻结与全部回归结果随后追加。本轮不执行74桌面录音真实Rust，不构建Mac/APK、不改依赖、不操作原版Notes或用户文件。
