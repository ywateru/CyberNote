# Android 附件75独审：PASS / SOURCE-READY，原生故障仍 OPEN

2026-11-06。独立 review worktree `codex/android-attachments75-review`。产品冻结 `4052e8aafea7fa51eda6dd5be8420901155dad7d`；随后只 cherry-pick builder 缺失 checksum sidecar 的窄修 `11fa62c8`，本树 HEAD `2b5d15ea6033a953d49c673d1b188843fd8a27af`，与开发对应输入一致。独审不改产品/runner，只新增 review probe 与证据。

无 blocking finding。允许以源码及受控链 SOURCE-READY 合入；用户 Android 系统 chooser/URI/WebView/IME 现场未操作，原生“无法保存”的根因仍 unknown，父附件任务不可据此关闭。没有构建/安装 APK 或 Mac 包，没有操作原 Android、模拟器、用户数据库/音频、原版 Notes 或真实麦克风。

## 源码审查

- `App.tsx` 仍先捕获原目标/书签并执行完整 rebind 检查。只在本次刚插入附件自动成为 NodeSelection 时，于同一 chain 事务移到后续文本块，必要时添加 paragraph；用户主动选旧卡的原书签仍决定替换。没有修改 epoch/owner/document/Editor 约束，也没有把录音 parked 放宽用于通用附件。
- `useAttachmentMedia` 仅对 typed MetadataStale / AccessChanged 最多三次总读取，每次重新经过原 bridge gate；失效 lifetime 不创建或发布媒体源。其他错误停下并显示重试，不把访问失败当成功。
- 空 File.type 仅识别已读取字节的 PNG/JPEG/GIF/WebP/PDF 签名，非空 MIME 保留，不按扩展名猜测。FileReader error/abort 明确 reject，原 File/operation 保留。取消 observer 仅在 cancelRequested 时不覆盖取消 handler 的结果；handler 失败依然上报。重试仅所有工作确已清空才清旧 error。
- Rust transport 使用当前生产 Session/Store 方法：register/save、附件 store/query/cancel、真实 owner→sensitive→tagged read；屏障命令明确 unsupported，无空 ACK 或 Fake fallback。owned child 关闭等待真实 close，协议异常拒绝所有 pending。未改生产 Rust、依赖或归档格式。旧 committed/Undo 媒体及无本轮 journal 的既有文件不按“未引用”删除。

## 独立运行结果

以下成功运行均自然 exit0，wall 为独立 Python subprocess 外部计时，包含最终清理。

| 检查 | 结果 | wall 秒 |
|---|---|---:|
| 新手机 attachments | 43 PASS | 46.804 |
| 桌面九组，第二次 | 100 PASS | 47.420 |
| 手机 recording | 43 PASS | 14.516 |
| 手机 notes | 9 PASS | 5.167 |
| TypeScript / Vite build | PASS，Vite 3.30s | 9.382 |
| 生产入口排除 | API/URL/bundle 检查 PASS | 1.020 |
| transport 协议故障 | 18 PASS | 4.440 |
| 当前 Rust fresh harness 显式构建 | locked/offline PASS | 6.933 |
| 正式真实 Rust 手机链 | 21 PASS | 11.140 |
| 独审补充浏览器负例 | 29 PASS | 13.564 |
| 独审补充真实 Rust 失败/恢复链 | 14 PASS | 6.662 |

首次桌面运行自然 exit1，5.097s，停在旧 contract 的 `100ms false async predicate timeout + lastState` 断言，未进入产品组，pageErrors=[]。原 failure/process/screenshot 保留；第二次独立完整运行通过。此次没有抓到 first state/计时细节，**原因未确定**，不把并发、产品或新附件修改当作已证根因，也不抹掉首次失败。该既有短时限断言的稳定性继续作为非阻塞测试风险。

独立 probe 两次早期失败也保留：第一版误将原始 `{content:[]}` 与 Editor 规范化省略空 content 的文档按 JSON 字节比较；改为原真实 Editor 快照后精确 Undo/Redo 通过。第二版对刻意换 Session 后 app.refresh 的预期授权拒绝未收集，尚未提交 FileList；第三版显式记录该拒绝后继续验证，未放宽产品判定。Rust runner 首次调用被计时 wrapper 预建输出目录触发 EEXIST，0.087s，在 child 启动前结束；换为独立计时目录和真正 fresh 输出后运行21项。以上是验收 harness 问题，原日志未覆盖。

## 补充负例与真实持久化

正式手机43项覆盖空笔记多选、连续选择、主动替换、Undo/Redo、单图/文件/PDF、同名重选、取消重选、焦点往返、延迟/abort/error、正文失败重试、已落盘丢响应、多文件部分失败、ACK后refresh-only、取消晚读、目标改变、媒体有界重读/撤权和390/320浅深色长文件卡。

独审另写29项实际 App/FileList probe：空笔记单次插入和连续选择分别比较精确原 Editor 文档，Undo 连新增 paragraph 一并恢复，Redo 恢复原身份；主动选择旧图替换仅目标卡、保留历史媒体，Undo 精确恢复。新空笔记一次三文件各有一个正确引用。9种空MIME样本覆盖全部已知签名、未知/WAV/空文件保持 generic；非空 text/plain 即使内容为 PNG 仍不覆盖。abort/error 的首次 query 与后续 query/store 实际 operationId 相同。刻意改变 session/global epoch/noteEpoch 均拒绝旧 chooser且无 store。取消 handler 失败明确保留并可重试；导航后才释放的合法 read bytes 也不发布到 B。pageErrors=[]。

独立重建并核对24个递归源码/构建输入与23个 harness 副本（另一个为 builder），包括 store/session 子模块和 include JSON；Cargo.lock SHA为 `66c00622e6c40b61212517ac93d24f93399424f80cbf481cf6cb7ccfa97aabae`。图83 packages，其中82 registry；82个 `.cargo-checksum.json` 均实际缺失，记录 missing/null，**不把缺失称为校验通过**。builder 仍记录全部实际 registry 文件聚合 SHA 和完整依赖图；其他 IO 错误不忽略。构建 binary：7,195,568 bytes，SHA-256 `c91b12fb05136d4f0eb118d017abb6eaad9f8f9c8e518d7e3d7db019bbdd7086`。独立读取 root、harness 和 binary 哈希均匹配。

正式21项手机链真实 FileReader→Session/Store→正文ACK，校实际文件字节和两个唯一引用，PID83525自然退出后才由新PID83731/新Session同fresh目录恢复。旧Session token读被拒、新Session不能收养老operation，lock/delete/import屏障明确拒绝。两子进程退出0、pending=0、pageErrors=[]。

独审再用实际 Rust 增加14项：向真实 Session.save 注入过期revision得到两次真正 conflict，保留原File/op；恢复正确请求后同op唯一ACK，无第二次store。实际 Session存储已成功后丢弃响应，query恢复同op；实际正文ACK后仅注入读取列表失败，重试不增save/store/revision。FileReader延迟取消等待真实store结束，再由真实Store安全aborted且无正文引用。PID85839自然退出后，新PID85931/新Session恢复三份错误重试后的文件、原引用与SHA；两子进程退出0、pending=0。这些是明确的合成请求/交付故障，不是 OS 或硬件失败，也没有改写 Session/Store 算法。

## 身份、显示与限制

4052时87输入指纹 `5b81e114c06b86cdd89ddcc67aa37598b080aac98e3799c88e10e56200c27d52`，覆盖 mobile43/recording43/build/协议18及首次desktop失败。builder-only 后87输入指纹 `7988ded2a1060c244993aa70415e5c3a59b8df8d950ec99ee7fb34704e37ff8e`，覆盖desktop100/notes9/production/真实Rust及补充probe。各有指纹的运行start/end一致、gitDirty=false、pageErrors=[]；无变化组不重复运行。独立git比较确认两个freeze的产品、Rust、依赖/config字节不变，唯一差异是builder sidecar采集策略；主线整合须以最终输入再记录自身检查，不能混称单一87指纹。

已实际查看手机保存后及320深色长名PNG，卡片在编辑区内、名称截断、错误重试可见；HTML/几何/截图原件压缩保留。PNG是1×1合成图，PDF是合成文件卡，不证明实际PDF渲染或原版预览。没有原版同态像素证据，不能宣称苹果UI完全一致；原生设备与完整像素目标仍 OPEN。build保留既有大chunk提示。全部独审启动的正常/故障子进程已终态，Cargo缓存已交回根，不删除共享target。

证据：[独审目录](../../verification/android-attachments75-independent/README.md)。开发原始before/开发失败档仍保持；本报告不把这些已复现源码问题直接等同用户设备故障。
