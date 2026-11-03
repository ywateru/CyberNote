# candidate04 统一包进度

状态：**正常生成前置和零结果文字源码独审通过，尚未最终冻结或构建**。本页记录2026-11-04的阶段结果，不替代准备目录中的原始记录。

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
