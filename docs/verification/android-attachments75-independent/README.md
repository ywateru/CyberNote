# Android 附件75独立验证

结论PASS / SOURCE-READY，原生Android故障仍unknown。见 [独审报告](../../plan/reviews/app-android-attachments75.md)。产品4052e8aa；builder-only后review2b5d15ea。没有改产品/runner，不操作原设备、用户数据或原生Notes。

- 各组process.json/log保留外部wall与自然退出；summary/suite为正式结果。desktop/保留首次旧100ms框架断言失败，desktop-retry/为另一次完整100通过，原因未确定。
- mobile/43、recording/43、notes/9、protocol/18、build、production为各自范围，不把Fake称为Rust或Android原生通过。raw-browser-artifacts.zip保留HTML/几何/screenshot等原件。
- rust-build/含当前源码locked/offline build、24输入、83包依赖图和actual registry hashes。82个checksum sidecar缺失如实记missing，不冒报外部完整性校验。current-harness.zip保存精确复制输入；source-and-build-proof.json为独立root/harness/binary核对。
- rust-result02/是正式21项双新PID真实Session/Store/FileReader/ACK/字节恢复；两child自然exit0。rust-process02/保留外部计时。rust/保留首次输出目录EEXIST的harness调用错误，没有child运行。
- extra03/是独审29项浏览器probe的代码/结果；extra/与extra02/保留探针自身原始失败和脚本，不能覆盖为产品成功或失败；extra03-process/是最终运行计时。
- rust-extra/是独审14项实际Session conflict、丢真实store响应、实际ACK后refresh-only、真实安全取消及新PID/字节恢复。所有合成故障明示，生产算法未替换；rust-extra-process/计时。synthetic-store.zip只含本轮合成目录，进程退出后封存。
- sha256.json记录生成时所有证据SHA（不含本README及清单自身）。脚本保留本轮绝对临时路径；重放时替换到自己的fresh目录即可。所有测试仅用合成内容，PDF不证明原版预览，像素和原生目标继续开放。
