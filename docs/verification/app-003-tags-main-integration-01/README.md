# APP-003 tags 主线整合回归 01

主线精确 `b598a74eb5713052323f70270d5d03e95fe916ca`。本轮是冻结候选04独立审查之后的整合回归；结论通过列明的源码、受控浏览器与真实 Store 边界。没有再做源码独审，不授予原生或像素通过。

| 检查 | 结果 / exit |
| --- | --- |
| pnpm build | 0；仅既有大 chunk 提示 |
| test:schema | 96 项，0；未运行 --write-manifest |
| test:access | 16 项，0 |
| test:native-toolbar | 13 项，0 |
| check-ocr-host | 37 项，0 |
| check-tags-browser | 27 项，0（run02） |
| check-tags-save-boundary | 11 场景，53 条真实 Store action，0（run02） |
| check-tags-composition-retention | 12 场景，170 条真实 Store action，0（run02） |
| 指定 Rust 基础场景 | 1 项，0，另41项过滤；无编译 |

identity-before/after 固定主线、12产品文件、依赖与未变公共边界；全部与冻结候选04逐字一致。src-tauri 相对37ee2bd及96584b7无差异。两个既有二进制明确区分：普通 Store CLI 的 SHA256 为 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`；Rust 单测二进制当前观测 SHA256 为 `94fca6a1a4729fc32c99c047a3ae28f58e722160f5056b259cfa5c7ccd1fd019`，历史日志仅证明精确可执行路径和测试名，没有历史二进制 hash 证明。见 store-test-binary-identity.json 和 raw/store-test-list.txt。

有界 Rust 测试为 `store::tests::tags_store_reopen_rejection_lock_and_full_archive`，执行既有二进制的 --exact/--nocapture，覆盖标签保存/reopen、非法跨度拒绝且原数据保全、标签锁定拒绝、两次归档导入、坏归档原子拒绝、普通井号文本锁定/解锁、恶意密文解锁拒绝、未知密码 opaque archive 保全。运行原始日志与 exit 保存为 store-basic-execution.json、raw/store-basic.txt。

App 保存与组合输入脚本挂载生产 App/Editor，保留实际保存队列和文档投影，仅把 preview transport 接到隔离真实 Store CLI。保存边界记录53条，组合输入170条（14 createNote、47 saveNote、109 workspace）。实际请求/响应、场景中间快照、错误和脚本注入原文在对应 run02/result.json。三套浏览器 pageerrors 为空。

三个浏览器脚本首次启动因本机 listener EPERM 在场景执行前退出1；tags-browser/save-boundary/composition 的原执行记录及完整 raw 日志保留，未写成通过。允许本地监听后使用相同产品/脚本及全新 run02 目录分别重跑成功。首次环境失败不属于产品断言失败。

access 脚本仅将两个输出目录字符串从 artifacts/access-boundary 替换到本目录，避免覆盖旧正式证据；其余执行原脚本。scripts/ 保存本轮原脚本副本；access-boundary-check.mjs 保存实际改址版本。schema 允许刷新常规 artifacts/editor-schema，但结果指定独占路径；editor-schema-generated/ 只封存本轮生成模块与本次96项结果，不含未执行的旧 editor-actions 产物。Vite 常规 ignored cache/dist 输出可刷新；未写旧正式证据。

每个输出阶段都先检查至少2GiB；结束可用4993490944 bytes。无新依赖、下载、Rust编译、平台构建、产品/契约修改、GUI、ADB或设备数据。host target 无需占用并保持释放。生产文件与锁文件前后相同；工作树仅新增本证据目录。

原生 GUI、系统输入法、native IPC/Session、真实原生 OCR、设备传输和像素对齐仍 UNKNOWN。受控 DOM/浏览器引擎输入不是系统IME验收，真实 Store preview 不是原生 transport。全部请求使用合成笔记，不读取用户数据库。

summary.json 汇总各 exit/场景/动作与限制，raw/ 保留完整输出。manifest.json 按 Path 组件顺序，对 UTF8 `<sha256>  <relativePath>\n` 聚合并排除自身，同时提供全路径字符串排序聚合。manifest 自身 SHA 在交付消息中单列。
