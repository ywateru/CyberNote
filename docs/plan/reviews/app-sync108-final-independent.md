# SYNC108 最终独立审阅结论

2026-11-12；审阅范围为已冻结源码、原始结果及归档证据。**接受 desktop run07（35 checks passed）与 three-peer run05（4 cases pass）作为正式最终结果；三项工具 P2 均已关闭，当前审阅范围未发现新的 P1/P2 阻塞。** 此结论不扩大下述实测覆盖范围。run06／run04 保留为前一版本，原失败报告及早期审阅结论继续保留。

| 正式结果 | 独立核对结论 | 原始 result.json SHA256 |
| --- | --- | --- |
| Desktop run07 | 35 checks；包含新增 B→A 反向附件；suite `17ad7372`，helper `50a2ac9f`，证据 `fe10afa6`；main 集成 `63fa9136` | `e37d585a5009f70f6efac553ae1fe93ced109e7d4ee59b01b0eaec66beeb85ae` |
| Three-peer run05 | 3P-01～04 全部 pass；实际 driver `d18e90b1`，helper 与50a2逐字节一致；归档 `7000cdde`，main 集成 `989f3fa9` | `69db7999d25fc137b4c8c8c465d343ab5c1885af11ba8b83074493e7ac2ca152` |

双端核对：原始报告 SHA、实际 runner/helper 文件哈希、binary、canonical build record 均匹配。对 canonical 的450个产品源文件逐一核对 commit blob，并重算文件名／长度／正文分帧指纹；9个 dist 文件匹配冻结摘要。实际导入工具单独核对，没有以 builder root 中旧同名文件代替实际 runner/helper。binary SHA256 为 `771bed664a3793938b7dc18d6dd07a4cbb63cb088808174c44062d2fb49fd723`；canonical record SHA256 为 `1ddd4c04da7d9cad525762cba3d169016e4024798e74b5ec79645fd160a8eb07`。A/B 原始 DB/WAL 经盐、滚动校验和及提交帧验证后仅在内存重建，integrity_check 通过；完整 document/plainText、原附件字节及最终语义投影一致，投影 SHA256 为 `1edeeaa383466376f5169863bcef0359d4e6e2bc1a178f79babbb720e2025975`。四段 owned 进程生命周期均 exit/close 0，无强制信号或 failureCode。原始 DB/WAL/SHM 在审阅前后哈希未变。

三端增量核对：run05 与已独核 run04 的七个工具中仅 native helper 改变；实际 helper SHA256 为 `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2`，匹配50a2及 desktop run07。七个实际工具哈希均匹配不可变 commit blob，Android工具及生命周期模块仍精确匹配7b789锁修复。相同四个 case 重新执行，产品源、dist、binary及build record保持一致，17份归档文件的大小／SHA与7000cdde匹配。原run02失败结果、A/B根及inode、三端workspace/device、连接端点保持连续；run05不是清数据后重新配对。C初始同步状态为error，未将其描述为全新disabled配对。

三端正文与恢复：run05四份完整document/plainText的运行摘要与保留A/B数据重算结果匹配；另精确核对C创建标题、两段正文及顺序，包含中文和emoji，没有只凭片段includes判通过。三份附件文件的原始字节／长度／正文引用与运行receipt一致。C由Home进入后台后标准am kill，PID由29187变为31384，原身份保留；冻结runner在正常重启后无pair/resume/syncNow操作，自动补齐正文及原附件。保留存储是run02开始的续测目录，本报告不将当前磁盘状态冒充不可变的某次结束时DB快照。run04确实使用旧helper，该差异留在历史审阅；正式run05已经实际使用50a2。

三项工具P2关闭依据：

- **Native尾帧fatal漏报**：50a2在await closed后再次合并fatal；原反例为有效shutdown回复后截断尾帧并exit0。作者修复后12项协议反例通过，正式run07及run05均实际使用该helper；fixture不充当业务结果。
- **Android重复close误删后继锁**：7b789使用单次closing promise与owner token校验，关闭后操作拒绝；两项独立锁反例覆盖重复close及owner变化。run05实际工具哈希匹配该修复。
- **Browser清理前写passed**：4cfbc52f的finalizeBrowserResult先await cleanup，再写最终passed/cleanup；清理失败写false并抛出，同时保留先前业务失败。三项故障反例通过；实际startup fixed02为17+4且两端cleanup passed，settings fixed02为56+56。手机及窄屏断言仍为44px，桌面宽屏28px有既有产品契约依据。

清理：run05四条owned cleanup receipt全部pass，A/B均自然退出0且无尾帧failure。最终清理归档记录forward/reverse为空、实际临时目录及旧路径driver lock均不存在；Gradle535/Kotlin544/651按独占home与父子/classpath确认归属后，经正常gradle --stop退出。测试手机包、原身份与合成数据按策略保留。独立审阅验证了冻结清理代码、原始receipt及归档哈希，没有再次操作手机、查询实时adb或停止进程；清理现场事实来自作者归档receipt。

覆盖边界：**DESK-11仍是部分覆盖，未完成确定性的in-flight本地保存／IME组合输入竞争测试。** 已观察到打开目标上的quiet prepare/commit，不能据此宣称IME或并发保存竞态全部通过。桌面附件经真实DataTransfer FileList输入，OS文件选择器打开被抑制；不等同于实际OS picker／物理键盘输入测试。桌面采用static debug前端与显式sync-e2e feature，不能推广为release配置验证。C的真实UI输入为CDP Input；Home+am kill证明受控后台进程回收后的恢复，不能宣称真实系统内存压力触发回收。正式通过仅涵盖记录中的35 checks和四个case。

本轮独立审阅未改生产源码、工作区文件或暂存区，未add/commit、编译、重跑suite或操作设备；所有新增审阅产物仅写/private/tmp。SQL仅针对内存中的只读重建数据库，不向产品SQLite写入，不伪造ACK。

可归档的独立证据：

- `/private/tmp/sync108-final-run07-independent-evidence.json`：正式双端、canonical、内存DB/WAL、浏览器原始与归档receipt核验。
- `/private/tmp/sync108-three-run05-independent-evidence.json`：正式三端增量核验、50a2、完整正文／附件、最终清理与17份归档哈希。
- `/private/tmp/sync108-three-final-independent-evidence.json`：run04历史审阅，保留旧helper差异及续测边界。
- `/private/tmp/app-sync108-tools-independent.md`：历史完整工具审阅；以本短报告的07desktop／05tri为最终基线。
