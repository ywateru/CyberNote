# candidate04 统一包进度

状态：**源码已冻结，Mac已构建并保存，Android三次构建均失败；本批尚未运行验收**。本页记录2026-11-04的阶段结果，不替代准备目录中的原始记录。

## 正常生成前置

两次前置均以主源码 `87e538c4577483c8756aa49445f47b24badd98ff` 运行相同的 Cargo Android `check --locked --offline`，未执行 Gradle、完整原生构建、下载、安装或运行。

- [preflight-01](preflight-01/result.json)：退出101。NDK_HOME本身不足以让cc-rs发现Android目标编译器，原始失败保持不变。
- [preflight-02](preflight-02/result.json)：仅补充已存在的API26目标CC/CXX/AR三项父环境，退出0。实际minSdk26、工具版本、包装脚本及实际工具身份见[补充记录](preflight-02/toolchain-authorization-supplement.json)。未增加linker/Rust flags或改变依赖、features。

root逐文件复核了01的7份证据和02补充清单的15份证据，字节数与SHA-256均一致；按路径排序聚合分别为 `1c1c7c45177cf4812a255e4acb466bb1e59bd1ceb9801e9748fadb246e933990` 与 `d05a732152fc00853a3c60ebfc5d5218829e7fd0aad860e0e0284c443f5efaa3`。

02正常生成只增加预期的三行：settings中的notes-scan include/projectDir，以及app中的notes-scan implementation，见[完整差异](preflight-02/generated-diff-eof-aware.patch)。两个生成文件受Git忽略，tracked diff为零不表示生成文件未变。其实际生成变化经root审查接受，并将在最终输入冻结中以实际字节列明；没有手工改写生成文件。共享target已释放。

02最终可用空间3,265,036,288字节。后续阶段仍执行2GiB空间门槛；不会自动清理旧证据或复制target。

## 后续门槛

OCR接入及预览明文清理已在主源码独审接受；暂停录音预览亦已合入，但两者都不在candidate03内。搜索零结果文字源47d4446已独审SOURCE-READY并主1665dfd合入；root复核22证据及report hash，两产品aggregate仍为c421f6b8…，主合入未改其字节。700字重仅候选，原生像素未知。后续root指定最终40位SHA，再按[准备流程](preparation/README.md)冻结输入、串行构建与保存Mac原始包/独立签名副本及Android包。

正式构建改用[run-build-safe-cleanup.py](preparation/run-build-safe-cleanup.py)，保留原run-build.py/原准备清单不变。root审查了最小差异并逐项重算6个新增工具证据，聚合63b4e89a…一致；实际构建命令和环境不变。它只删除仍匹配本次device/inode/size/hash的临时init，清理异常仍写失败结果并阻止收集。合成六例检查通过不代替真实构建；同缓存仍必须串行。详见[窄修说明](preparation/SAFE-CLEANUP.md)。

截图格式更正：2026-11-04新原版读取已恢复，但CUA原始截图实际为JPEG。candidate03独立目录中17个名为png的历史截图亦经独立文件头检查为JPEG；其旧字节和manifest保持不变，不能用作无损PNG逐像素验收。原版新观察和限制见[补充记录](../../research/mac-zero-original-recapture-20261104-01/README.md)。后续必须先核实真实编码和采样比例。

正式Android构建前另行串行共享Gradle cache使用者，并明确授权已有脚本的临时离线init方案。构建、签名、模型成员核验不代表设备运行、可听录音、真实OCR、冷启或像素验收通过。

## 最终冻结与Mac构建

2026-11-04冻结源码 `d8f832e83349c7503b872e0e88853d1ab7b0713a`，279项列明输入aggregate `21358ef21f530eada2862860e163114b6628ac0ca2e5e88156d4f0f3789f7153`，见[输入清单](build-01/source-inputs-before.json)。前述“后续指定SHA”是当时准备阶段状态，本节为其后实际结果。

Mac `pnpm mac:build` 退出0，输入七类比较均相同。原始链接签名包保留不改，另作完整adhoc签名副本，严格验签退出0。root逐文件核对[Mac阶段清单](build-01/MAC-STAGE-MANIFEST.json)的11个文件，共321,938字节，全部size/SHA-256相符。完整本地签名ZIP已另存 `artifacts/unified-candidate04/NotesClone-mac.zip`，4,750,334字节，SHA-256 `6a821684a64406c5febd9dd6f703e84c09459f0fb7acf90ad015e4e4b40b4738`。原始ZIP同时保留。这不是开发者公证分发包，也没有获得实际OCR、录音或像素通过。

## Android尝试01–03

三次都使用上述冻结输入，未采集旧APK、未安装或启动。root逐文件核对[Android失败阶段清单](build-01/ANDROID-ATTEMPTS-01-03-MANIFEST.json)的23个文件，共422,266字节，全部size/SHA-256相符；当前没有 `android-original-identity.json`。

| 尝试 | 结果 | 实际边界 |
| --- | --- | --- |
| 01 | exit1 | Rust编译通过，Tauri本地WebSocket受到执行权限限制，未进入Gradle |
| 02 | exit-15 | 必要权限解决WebSocket问题，但wrapper先于Gradle offline init启动9.6.1分发包下载；监测发现后停止所属进程，保留95,820,438字节part |
| 03 | exit1 | 复用本机已有9.6.1成功，两次出现offline标记，无下载提示；离线解析拒绝 `androidx.lifecycle:lifecycle-livedata:2.10.0` |

[wrapper静态审计](wrapper-audit-01/README.md)后，仅新增两个指向已有相同版本分发目录及成功标记的链接；[独立version验证](wrapper-reuse-01/result.json)退出0，原分发树、part和lock字节不变。链接和失败现场均保留。

attempt03的AAR实际上在selected和默认cache中都存在，55,037字节、SHA-256 `3e8c009fc88da1c52e4ed05a81269d5ac9bd405046f300307f5e3a17e201a6df`；对应descriptor也相同。故“No cached version”不能被解释为文件不存在，尚需定位Gradle仓库/索引解析状态。外层configuration cache序列化报错没有证明产品源码错误。七类输入比较仍相同，临时init身份匹配后删除成功，最低可用空间5,004,304,384字节；未触发空间或下载停止器。共享target已释放，但本轮产生的Gradle/Kotlin daemon仍存在，不能声称cache无进程占用。

## 运行与像素门槛

candidate04 Mac尚未启动，Android尚无本批可用APK。录音、暂停回放、真实OCR文字保存与冷启均待本批实际运行。当前窗口工具仍返回Mac锁定，用户的解锁确认并未转化为可操作窗口状态，未继续盲目输入。

历史CUA截图实际编码为JPEG，即使文件后缀写作PNG也不构成无损证据；旧文件与清单保留。新的原生比例PNG取证工具源744a924已经独审SOURCE-READY并合入6428d22，四工具hash保持一致，root核对独审10证据及report hash。实际窗口枚举/取图尚未运行；普通输出只证明PNG与原生比例请求，不保证SCK内部无重采样或原始背板等价。整窗像素一致仍UNKNOWN。


## Android离线恢复进度（构建前）

在独立只读快照中，精确`@aar`可解析；原项目真实`universalDebugRuntimeClasspath`仍失败。进一步用既有Gradle自己的缓存API确认：相同坐标/文件名分别有`DefaultModuleComponentArtifactIdentifier`和`ModuleComponentFileArtifactIdentifier`记录，前者正向、后者缺失；真实descriptor的runtime variant需要后者。

只在全新隔离home中，从已存在且SHA匹配的55,037字节AAR建立缺失file key，没有修改原缓存BTree、metadata、依赖或文件内容。随后将新索引和AAR两文件（73,704字节）作为只读补充缓存。原项目真实目标artifactView已解析成功，两种ID文件SHA相同；另一次完整外部依赖lenient解析114项、失败0，无应用编译或下载。它们证明补充缓存可解决已知离线解析阻塞，不等于APK已经构建或运行通过。

后续Android恢复构建将显式冻结新增`GRADLE_RO_DEP_CACHE`路径及两文件身份；原准备common的七类比较不覆盖这个变量，不能默称已覆盖。主源码083a8d4相对原d8应用/插件/配置/依赖字节不变，只增加5个取证工具输入。原Mac包保持其原始冻结身份，不伪造新Mac构建记录。
