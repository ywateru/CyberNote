# APP-003-TAGS 独立证据 01

冻结候选 96584b74d2356c361e897ed5ad275b15823c21a0；结论 BLOCKED。

ime-repro.mjs 是完整独立复现源，ime-repro-run02.json 是成功执行摘要，ime-repro.json 是生产 Editor / App / Rust Store 请求响应及显示状态，invalid-preedit-document.json 是实际被拒绝文档。rust-build.json 保留小 harness 离线构建日志。harness-* 保留实际入口、manifest 和 lockfile。identity-before/after.json 固定审查身份与未修改产品状态。static-boundaries.json 固定静态发现和修正出口位置；result.json 说明结论与限制。

第一次 localhost listener 尝试受到 EPERM 拒绝，未执行浏览器场景；随后仅调整 Vite HMR host 为127.0.0.1，并经已批准本地监听重跑成功。失败尝试未保存原始日志，不将其伪造为原始证据。

本轮受控 DOM composition 不等于原生输入法验证，preview transport 不等于原生 IPC/Session。原始产品源码未改。原临时 Store、Vite cache 与共享 target 留在工作位置，无清理。因磁盘低于2GiB，未继续编译／浏览器检查。

manifest.json 列证据文件 hash 以及外部报告 hash；聚合按 path components 顺序对每项 `<sha256>  <relativePath>\n` 的 UTF-8 串求 SHA256，同时列完整相对路径字符串排序版本。manifest 自身及外部报告不纳入证据聚合。
