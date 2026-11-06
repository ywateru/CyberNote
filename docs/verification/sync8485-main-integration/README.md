# Store84与网络85主线模块整合

2026-11-06。主线合并Store84 `feff050d`、网络85 `0ab39d70`；组合依赖整理 `3754d60b`。产品修复分别为 `7da43718` 与 `c88982a6`，独审通过分别为 `447e1360` 与 `59fc3f32`。

Cargo自动合并后重复sha2声明已去重。离线metadata更新组合锁文件，增加34个网络所需包；未删除或升级任何已锁包版本，已有条目的依赖列表随feature统一及同名版本消歧更新。随后`cargo metadata --offline --locked --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml`自然0。完整metadata输出留本轮临时目录，不提交庞大环境路径清单。

从主线真实源完整运行，无filter/skip：

- 84独立runner：121项，118通过、0失败、3原有subprocess worker忽略，wall11.209秒，自然exit0。原locked drawing回归与旧归档/密文fixture全部通过。
- 85网络runner：19项全部通过，wall24.369秒，自然exit0。真实socket、三进程opaque File backend、共同offset0并发自动收敛和双源下载均通过。

准确命令、环境target、自然退出及计时见各status.json，原始stdout/stderr完整保留。并行运行两套无相互依赖测试，包缓存锁等待计入wall。测试开始于`feff050d`加组合manifest/lock工作树；测试期间提交仅该相同manifest/lock，结束HEAD `3754d60b`，tracked工作树clean。source-after.json为运行后指纹，未声称采集运行前指纹。

证明范围为两个已审模块在主线的回归，不含生产SyncBackend/Session注入、quiet窗口事件、真实App双端、Android或隧道。86/87仍须完成。原Android未保存录音/旧AVD及真实麦克风未操作，原始模块失败证据保持。
