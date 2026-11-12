# 三端原始证据归档

此归档包含全部三端 attempt：run01–05。**run04 与 run05 的四个 case 均实测通过，正式最终证据采用 run05（含最新 50a2 shutdown helper）；原 run01–03 失败全部保留。** 两次通过均延续原 run02 Store 根及 A/B/C workspace/device，没有清数据或新建 workspace 重配。主目录 README 的最终状态由协调者更新。

| Case | run04 | run05 | 实际断言 |
| --- | --- | --- | --- |
| 3P-01 | PASS | PASS | A→B/C 格式正文与 PNG；完整 document/plainText 深相等、正文附件引用、三端原字节 SHA/长度，C 实际 editor document。 |
| 3P-02 | PASS | PASS | C 真实 CDP Input 创建两段正文→A→B；精确新建 owner 与保存等待，完整 document/plainText。 |
| 3P-03 | PASS | PASS | B 经 A→C 格式文本与普通二进制文件；三端全文、附件引用及原字节 SHA/长度。 |
| 3P-04 | PASS | PASS | C Home 后标准 am kill、离线新增、正常启动自动补齐；PID 改变而身份不变，无 syncNow/resume/配对，全部本轮 ID 的全文及旧附件 hash 保留。 |

| 文件 | 内容 |
| --- | --- |
| `summary.json` | 每次 attempt 的原始绝对路径、SHA256、状态、case 和清理结果；已通过 3P-01 的正文与附件字节 hash。 |
| `run01.result.json`–`run05.result.json` | 与各原始 result.json 逐字节一致的归档，不改写原失败。 |
| `run04.terminal-audit.json` / `run05.terminal-audit.json` | 定向终态 receipt：每个实际 desktop PID 无 failureCode、naturalExit=true、exit/close code0、无信号，原身份/根与冻结指纹核验。 |
| `attempts.md` | 原失败步骤、工具原因及已做修复的解释。 |
| `continuation-proof.json` | run02 原双根、workspace/device、拓扑及 run03 对原始结果 hash 的引用。 |
| `android-apk-preservation.json` | APK 原路径、主 workspace 保全路径、大小、SHA、包身份及源码指纹。 |
| `ready03-canonical-original.json` / `ready03-continuation-build-record.json` | 原 canonical build record 及只增加原结果链接/构建变化声明的执行记录。产品 canonical 输入与实际 Node 工具分别核验。 |
| `final-cleanup.json` | 最终映射/真实 driver lock 为空、测试包及数据保留、独占 Gradle 正常停机证明。 |
| `fixtures/` | 实际 suite 使用的合成 PNG 和普通文件原字节。 |
| `archive-manifest.json` | 本目录证据文件 hash 清单。 |

run02 原双根为 `/private/tmp/sync108-three-20261112-02/store-A`、`store-B`，手机保留相同 C 身份和配对。run03 虽采用这些根及 continuation 元数据，但在 A Ready 就超时，未完成运行中的身份复核；run04/run05 则分别完成原三端身份、双根、连接端点和重启后 C 身份的实际核验。原 workspace 为 `a0111fa3-a489-4f6a-baa2-4e97f0e2adc5`，三个 device ID 详见 continuation-proof。

两次通过均使用 desktop binary SHA256 `771bed664a3793938b7dc18d6dd07a4cbb63cb088808174c44062d2fb49fd723`，产品源码 `e3225038cd47f00774e08a8cf10e32ab2335668f`；静态 debug 前端复用已冻结 dist，其摘要及较早构建身份如原 canonical record 所披露，没有宣称重新构建前端。Android 仍为准备 APK 的 `67b35ca5` 快照。

run04 的 helper SHA256 为 `6b871692d149df46aef747bbb8b985b46fe342da45d2e2c8fc3777ba9618a946`，对应已提交 `2ef1580b`，早于 50a2 的 late-fatal 合并修复。run04 receipt 逐进程独立检查现存 failureCode、自然退出及无信号，不能只取旧 helper 的 naturalExit 结论。run05 的 helper SHA256 为 `8501c7f55777ec9de2292433fa5ab122253d6302e844914ece44245a343524e2`，与已提交 `50a2ac9f` 原文件完全相同，对应本分支 `d18e90b1`。三端 runner 冻结 `7ff7e846`，Android owner/UI `e755c722`、安全 phase `814ada5c`、锁 fix `7b7898b6`；12 项 NativeApp 协议反例和 2 项独立锁反例通过，但不替代实际业务四项。

run02 3P-01 的完整 document/plainText 规范化 SHA256 为 `c9cab2d79f99211201ea5d136724d4e60e9e2a876f9106fc87d5124b5924356b`。三端 PNG 原字节均为 3677 bytes，SHA256 为 `3cab9ba707426dcea5e90bc86e8e90db7998a45c2f92e0bd65d040c800ae823a`。run04/run05 各次合成 note hash 及全部原字节 hash 见各自 observations。完整断言和实际 C editor 检查在原 suite 中执行；此处 hash 仅索引原证据，不替代执行。

唯一 Android 准备 APK 已复制至主 workspace 的 ignored 路径 `/Users/water/work/2026/Apple-Notes-Clone/artifacts/sync108/sync108-android-test.apk`，大小 343695163 bytes（约 327.8 MiB）。原件和副本重新读取所得 SHA256 均为 `e13efeefefa45752388218ebb91466f5c8253278810384d54e9b815dce440af5`。旁边保存 `.apk.json` 元数据；APK 不提交 Git，副本不依赖 Android worktree 的存续。本次归档未构建、安装或操作手机。

未归档包含完整合成笔记的私有诊断 workspace/screenshot；未读取原用户 App 内容，未记录邀请。原始目录和合成数据均保留。

最终本轮包 PID `31384`；forward/reverse 均为空，Node 实际临时目录中的 driver lock 不存在。准备 forward 59445 已于 run01 精确清理；run04/05 各次 CDP 与同一个 owned reverse 37529→61778 均精确清理。A/B 四个实际 PID 均自然退出0，无强制信号。Gradle535 及 Kotlin544/651 通过独占 home、父子关系及 classpath 确认归属；正常 `gradle --stop` 后三个 PID 均不存在，没有批量 kill。手机测试包及全部合成数据保留。
