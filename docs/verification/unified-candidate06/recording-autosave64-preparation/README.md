# Mac录音自动保存64：Mac18准确构建准备与执行

2026-11-05。root在64独审及主线typecheck/build通过后，指定准确整合源 **`8022407f0b827a564fa64f693b5c7e7f6220b42e`**，授权创建本轮完整九字段 [mac-authorization.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-autosave64-preparation/mac-authorization.json) 和 [input-plan.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/recording-autosave64-preparation/input-plan.json)。本轮只有Mac18，不构建、安装或操作手机；当前应用的GUI由root另行负责，本执行者未启动或替换它。

产品 **353** 项，聚合 `8b4557edcc8d18a3144cea44f4437cfcb70d9956c95670ed39603ebf0bc48d95`；完整 **374** 项，聚合 `8de71e6d7ff91118bdd1c69b7b54bce42000cbde9a56632210fa1463d31ecb15`。以Mac17准确授权的333/352完整底表为基础，保留全部旧路径并按实际字节重新计算；新增20项产品、22项完整输入。77个插件文件、14个旧生成输入、5个补丁依赖和既有fixture例外全部保留，非仅tracked清单。

新增产品包括：

- 60手机时间轴检查脚本。
- 63诊断helper及三个诊断脚本。
- 64六个新源码：DesktopRecordingPanel、desktop-recording-session、recording-pcm、recording-replacement、recording-revision-relay、recording-revisions。
- 64四个作者脚本/fixture、三个App/boundaries/browser独审脚本、两个Store独审脚本。

另外将 `docs/verification/qa-fix-00/store-probes/Cargo.toml`、`Cargo.lock` 显式加入input-only验证输入，未把它们称为产品代码。旧路径中实际修改的SHA另见input-plan；所有最终产品/输入行均有大小与SHA。最终freeze与本计划逐行一致，不使用先前候选4a/66或尚未提交session时的旧字节。

准确授权文件SHA256为 `12248785aab2d75d197f87f83a63f2b360c7102564c6803d85e71e01fea93114`；[Mac18 input-freeze.json](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/input-freeze.json) 347088字节、SHA256 **`469c75c5817f1f8e7197e5074257dc8b38ae209ae1eef9339614ca353285efa5`**。freeze后root直接核对source、九字段、计数、全部大小/SHA、两聚合和环境，再明确START。root在build/collection期间保持准确HEAD与完整输入不变，未提交新HEAD。

使用既有[candidate06工具](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/preparation/README.md)，只有一次attempt01，固定 `pnpm mac:build`，合作锁和独占共享target/cache声明。旧固定.app/dist原子保全至本次prior-outputs；不清理target/cache、不改工具/依赖/能力/签名要求。Mac有效环境保持SDK、NDK27.2.12479018、Java17、既有Gradle cache、Cargo离线和jobs2；没有Android scoped init参数。600秒截止及空间门槛沿既有工具。

Mac18 build exit0（110.795秒），collector ready=true；全部15项输入比较true、补充输入不变、组已停止无残余。正常流程保全完整原包，再对独立派生副本本地adhoc签名一次并strict/deep验证，不循环重签。原始严格验证失败如实保留。完整产物和日志见 [Mac18构建记录](/Users/water/work/2026/Apple-Notes-Clone/docs/verification/unified-candidate06/mac-recording-autosave-build18/README.md)。

相对Mac17，新包包含60、默认关闭的63诊断，以及64暂停checkpoint/关闭final分离、分段累计WAV与原A单逻辑卡替换。源码通过不追认此前真实Start授权超时已解决。64每revision为独立不可变附件，旧文件保留供Undo/历史及不确定保存，界面一张卡不等于只有一个物理文件，磁盘/归档占用会增长。63只有精确运行环境值 `NOTES_RECORDING_DIAGNOSTICS=1` 才启用，输出缺席不证明系统callback未发生。

本轮ready仅是本地准确构建与封存门槛；没有DeveloperID、公证、TCC、真实麦克风/回放、暂停或关闭保存恢复、GUI、手机或像素验收。旧Mac17/Android13及全部失败证据保持历史身份；新包运行/独立核包由不同记录另给结论。

本目录evidence-index仅索引本说明、准确授权和完整输入计划，排除索引自身；平台run与artifact由Mac18单独索引。
