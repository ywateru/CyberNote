# 50 最终 Quit 边界修复与验证

最终产品源：`12e5cd2bfcb9dca75983a3c54f67d6f4a94c6cf0`。第三修复为 `1b47c8025f3df5b43d85561566fd7ab381096820`，第四修复为其后单行 `12e5cd2`。完整 50 产品文件清单为原 19 个文件加 `src/search-editor-gate.ts`，共 20 个；准确最终 SHA256 见 `final-source-manifest.json`，旧清单原样保留。没有改 Session52、麦克风插件，也没有提交旧的三份合同副本覆盖主线 b224258。

## 第三发现：已确认窗口在等待其它窗口时继续编辑

独审在 8e06189 实际 App 闭包和 SaveQueue 中复现：一个无录音的文档参与者已 success:true ACK，editor 仍 editable，新输入产生实际 saveDoc/SaveQueue pendingDocs=1、saves=1、backendStillOld=true；其它窗口最后确认可能越过这一新正文。原始失败 stdout/stderr 保存在 `quit-independent-first`，独审原脚本保存在 `check-quit-reviewer-original.mjs`。

修复只作用于原生显式 Quit 通知：第一 await 前以专用 ref 封入场、暂停现有 SearchEditorGate、park 所有已挂载编辑器，并同步设 App 根 inert。成功 ACK 后仍维持冻结，直到本轮退出结束或匹配 id 的取消通知到达。Gate 的 activate/restore 自身也检查暂停，因此晚挂编辑器、已有 host 的迟到 activate 或异步 restore 都不能重新开输入。

取消/失败恢复按当前真实 owner、挂载实例、同步、访问屏障、授权和 parked 状态判定，仍不能把另一个 parked、被锁、同步中或失去权限的编辑器启用。取消消息带本轮 id，旧取消不能解冻新一轮。IME 正在组字或最后组字尚未由真实事务确认时取消本轮 Quit，不改变正文、不强行结束组字。普通附件操作未完成时也取消退出并保留原操作。

新建、格式、原生工具栏/菜单、快捷键、附件与独立笔记窗口入口受 ref 保护；createNote/openSeparate 在 await 后实际新建之前再次检查。录音 A 的必要结束插入仅认可同一轮冻结之前本来可编辑的原实例；所有原有原笔记/版本/权限/真实保存 ACK 检查保留。正常后台录音和普通关闭隐藏不会触发此 gate/inert。

Rust 记录完整文档参与者快照，在文档 ACK 与录音子窗口 Destroyed 导致退出前，核对当前真实文档窗口集合。新增或消失文档窗口会取消本轮退出，已收到的旧 ACK 不能继续授权退出。取消、失败、超时和异常销毁的取消事件统一携带准确 id。

## 第四发现：重复 Quit 绕过仍在等待的正文

独审在 1b47 实际 Rust public 函数中复现：main 的录音保存、child Destroyed、main 正文 ACK 后仍有 note-pending 未 ACK；再次 ExitRequested 因 entries 已空直接放行，repeatPrevented=false。原失败位于 `quit-repeat-independent-first`。

最终单行修复仅让 entries 空且没有 active Quit 时直通。已有 Quit 时重复请求继续 prevent_exit，保留同一等待集合，不越过未确认正文。原样独审准确最终源 probe 复验为 firstPrevented=true、otherAckSent=false、repeatPrevented=true、exitCalls=0。

## 必要验证

| 目录 | 结果和边界 |
| --- | --- |
| `quit-build-final01` | 最新前端源 build 通过；最终 12e5 仅 Rust 判断一行，前端源不变 |
| `quit-parent-final02` | 38 项通过，实际 App 函数、SaveQueue 与真实 SearchEditorGate；包含第一 await 前冻结、成功 ACK 后保持、原生/新建/格式守卫、late onReady/activate/restore、匹配取消、3 种访问限制、2 种组字未完成、在途新建/窗口 |
| `quit-repeat-native-unit01` | 最终 Rust 4 项通过，含参与者变动取消与原有登记/访问屏障 |
| `quit-reviewer-unadapted01` | 原脚本直接运行新源的 host 缺少 quitPending，失败原样保留，不计通过 |
| `quit-reviewer-adapted01` | 仅补新增 ref/state 与真实 gate/Editor.setEditable 宿主，独审原 Quit-edit 断言通过，editableAfterAck=false、pendingDocs=0、saves=0；产品函数及断言未改 |
| `quit-participant-native01` | 准确 1b47 生产 public 函数，晚文档窗口在 ACK 前和全部 ACK 后/child Destroyed 前两次序均取消，exitCalls=0、旧 ACK 被拒 |
| `quit-repeat-reviewer01` | 独审原样重复 Quit probe，准确最终 12e5 模块，runExit=0、repeatPrevented=true |

边界适配来源和哈希见 `quit-reviewer-host-adapter.json`。Rust probe 仍只去 command 属性和改内文档注释，真实产品函数体由准确 git SHA 获取，不替换算法。先前局部 fixture 的 NOTE_B 常量/新 pickerTargets host 缺失导致的尝试失败也保留，不计产品失败或通过。原始日志 EOF 空行原样保留；产品 `git diff --check` 通过。

本轮未新增依赖、未下载、未触碰用户笔记数据或真实麦克风。结果属于受控窗口/媒体/IPC 边界和真实生产函数/临时 Store 验证，仍不构成真实设备录音可听性、双窗原生验收、移动包或像素一致证明。主线需在合入 50+52 后执行最小整合检查。
