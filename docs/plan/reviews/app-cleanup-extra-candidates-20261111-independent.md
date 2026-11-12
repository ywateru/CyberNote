# 本项目额外缓存候选（仅盘点）

2026-11-11。**没有删除任何文件。** 精确候选清单及当前元数据在`artifacts/modernization101/cleanup-extra-candidates-20261111-independent.json`。只盘点项目target/artifacts与已知临时交付树，没有扫描用户目录、共享Gradle/node依赖或操作UI/设备/构建；没有hash大包或重跑测试。

| 候选目录 | 归属/可再生用途 | 文件数 | 逻辑长度B | 记录分配B |
| --- | --- | ---: | ---: | ---: |
| `artifacts/media99m-after-run1/store/media-cache` | 已结束99M测试Store派生PNG缓存；原件/DB/raw另保留 | 178 | 116440314 | 116834304 |
| `artifacts/media105-independent-representative-f1/after/store/media-cache` | 已结束105独审代表运行Store派生PNG缓存；原件/DB/raw另保留 | 22 | 6159756 | 6201344 |
| 合计 | 精确200路径 | 200 | 122600070 | 123035648 |

两目录当前均只有普通single-link PNG；精确目录lsof均exit1、stdout/stderr为空。只读进程可执行文件检查没有Cargo/rustc/Gradle/java或上述测量host匹配，仅有正式106 notes-clone PID63791；该App不使用这两个隔离测试Store。这是采样时点的有限检查，不保证稍后无人使用。上述路径未列在已核105五个派生cache清理记录，先前18项build-script、2400静态编译物及6项own库不重复计入。

建议父级确认测试派生器来源/证据保留要求后，若决定清理，需重新核对本清单stat、无活动引用，再只unlink清单文件，目录保留；不是本报告授权立即执行。123035648B约117.3MiB为记录分配量，不是保证能独占释放的物理空间。raw实际HTTP PNG/ROI证据与本候选media-cache是不同路径，全部保留。

明确排除`artifacts/media105-independent-representative-f1/baseline/store/attachments`约700MiB：这是测试媒体原件，不是缩略图缓存。`artifacts/unified-candidate06`约2.7GiB主要为历史构建交付，未证明哪些封装可舍弃，不能按目录总量删。target剩余约1GiB含运行入口、动态库、codegen及共享编译依赖，未新增其删除候选；临时交付树主要是历史验证/研究材料，也不因位于tmp便删除。包、DB、受管附件、性能原件、二进制/前端pins、原始证据及未知归属产物均保护。
