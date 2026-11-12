# MEDIA105 最小工具实施清单

2026-11-10，只读准备完成；未改工具/产品、未构建、未启动浏览器或重跑测量。访问规则以 [固定访问协议](media-coverage105-protocol.md) 为唯一来源；历史因果与未知项见 [169/450 分析](media-coverage105.md)。下一步仅少量真实 App 代表项及不同代理工具审查，尚无正式 500 paired gate。

## 现存 baseline 可以复用的范围

复用真实旧 transport 和静态 frontend，**不从当前 root/delivery 重建旧 baseline**。旧候选是 revision `84f2c896a4bfb6a4e3d48a8d51aff7a2471dbfa3`、fingerprint `2f77b076c00cc67416d7cdcbad08d85e2e4dded3cee056d987a9c001b3d687d2`、372 inputs、`sourceDirty:true`。该 dirty 产品树现已不存在；仅 checkout 该 revision 无法复现当时全部输入。

当前只读复核可用产物：

- `artifacts/media99-baseline-harness/current-transport`：28,089,264B，SHA256 `f2ccb77a82fbe3986f956b368d0a41fe5a09e9e9118c912c676367422a44a6cf`，与既有 `build.json` / `performance-build.json` 一致。
- `artifacts/media99-baseline-harness/harness/current` 中原记录的 49 个 production 源文件逐哈希一致。原 `recording_window.rs` 全文没有保留，只有既有机械提取 `recording_local_core.rs`；可支持已固定 binary 的来源证据，不能称完整旧产品树可恢复。
- `artifacts/media99-baseline-run1/frontend` 为此前独审接受并由 run4 使用的实际旧 App 静态产物；9 个文件仍在，下面是本次读取得到的 exact pin。其 `source.json` 注明身份是从原运行配置恢复，未发现原构建时完整逐 asset SHA 清单。因此这是“现在固定的已保留真实旧产物”，不能声称本次证明了历史构建时逐 asset 的密码学绑定。
- 保留原 `docs/plan/reviews/app-media-baseline99p.md` 接受结论、run4 的 `measured-runner.mjs` 和 raw；不在新源码上重跑旧 identity 审计、不改其工具和历史报告。

| frontend 相对路径 | bytes | SHA256 |
| --- | ---: | --- |
| assets/index-DZMIUHbb.js | 3247805 | 57192e78a3beda5da45d27c12c7c3f7992347cc363b8fd825a8c037619505f05 |
| assets/index-KKkYOzJz.css | 184658 | f9a37a9dcc5a221ad95d5b4f1696809f464ed5b4e8b66992a2ac1d77c1f71cbd |
| assets/native-recording-access-CFEbIwSC.js | 1478 | 5df87a4fae2aa88d67cd586444022e23574cd24f4b7358392c5741e0dfe8ca57 |
| assets/runtime-5LFG0ObK.js | 24049 | 8a84e5d5bc5d91c92350ef4d63cfa3f5a291149ce68e38c2ba3f9af558330fe7 |
| cybernote.svg | 2874 | 64ced2fa3d9f18adcc1bb20b2f53c371f0791facf08c3acfaebc6e89bba0ff8f |
| index.html | 1919 | 87241d8be01dff3f936b10b34af94d2babcd7bb6d7b463d6c14614b4d7d548e5 |
| source.json | 410 | af9ad88ef52d35d33efe88780db54de4e810c136f7b9a7a8aef21afac7550ed1 |
| startup.css | 2915 | 2deaeeb5a19519a39731cbfbd3b1d53f9a4eb829307bb70cb21088e8e1f473b7 |
| startup.js | 2319 | ed5c34bf3f142f9619e680059c4c5fa95c07a4b41eaf9871a757e784e0881ff9 |

105 用独立 `baseline-artifact` role 校验这些固定 bytes、原 build metadata 和来源限制；不能让旧产物通过当前 after-source gate，也不能关掉身份锁。工具审查需明确接受该复用边界。

## 最少改动路径

| 路径 | 最小变化；不扩大为新观察系统 |
| --- | --- |
| `scripts/performance/run-media.mjs` | 新增显式 105 role/workflow，复用既有真实 App server、Chrome、RSS、network/transport、媒体激活与退出逻辑。baseline 使用已有 `tracedTransport`，after 使用 `realMediaTransport`；滚动/等待只调用同一个105 helper。旧99M模式原候选锁保持。不要复制另一份大 runner。 |
| 新 `scripts/performance/coverage105.mjs` | 集中 role pins、固定协议滚动与状态变化 ledger。仅协议所需少量字段，复用原 raw 文件与 phase metrics，不另建完整 schema 家族。由同一 helper 生成两侧覆盖对账。 |
| `scripts/performance/build-media-harness.mjs` | 为104的编译期字体补准确输入引用，见下节；保留现有机械 provider 提取和源哈希前后检查。 |
| 新 `scripts/performance/check-coverage105.mjs` | 少量实际 App 代表项与纯谓词负例，检查身份锁、当前 source/decode 屏障、旧 Blob/新 lease 关联及初次缓存 snapshot。不得直接调用 acquire、赋 src 或 load 制造通过。 |
| `scripts/performance/README99M.md` 与105当前文档 | 补调用方式、两类身份锁、采样限制及小样本结果。历史99P工具/报告与原99M raw不变。 |

尽量从新 helper 的 init script 复用 `browser-probes.mjs`，不改旧 observer；确有必须接线再局部增补，不新增 IntersectionObserver、产品 queue hook、逐帧全 DOM 扫描或全局大字节摘要。

## after 身份锁和104编译输入

现 `media-candidate.mjs` 固定的是1507d66a / `4e143c…` /434，不能直接测整合104后的产品。105 after 单独使用父级给出的**接受后组合 revision、完整产品 fingerprint/input inventory**，实施时明确填入且失败关闭；当前不猜新值。允许其后仅工具/文档提交，但仍要求 accepted revision 为 ancestor 且当前产品 fingerprint 不变。保存实际 Chrome binary/version、frontend inventory、transport SHA、生产 provider 提取/源 SHA 和全部工具 SHA。旧 baseline 固定 artifacts 与新 after 源身份分开，不按“当前源码”误改旧身份。

104 的 `svg_text.rs` 使用 `include_bytes!("../../fonts/NotoSansCJKsc-Regular.otf")`。现 builder 只复制生产 `src-tauri/src` 到 `harness/current`，该引用在测量树落到 `harness/fonts`，目前缺失；旧 after binary 也不含104，所以 after 必须准确重建一次 harness/frontend。

最小修法：owned harness 下 `fonts` 用显式 symlink 指向当前 accepted source 的唯一 `src-tauri/fonts`，不复制16.4MB字体；build metadata记录链接目标、字体/OFL/来源文档的实际 SHA，校验 target 正好属于 accepted source，构建前后再核 bytes。字体固定 SHA `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`。source 在构建期间必须保持不变。此为工具适配，不能说104此前原生包测试已覆盖它。

沿用 shared target / jobs2 / incremental0 / debug0，不新建 target、不复制 fixture/font。基线不重建。冻结 SQLite 必须先存在并核 SHA，才可使用原 `prepare-store.mjs` 的 owned 工作副本/硬链流程，不能触发生成新 frozen snapshot 的 fallback。

## 旁路观测与代表项验证

同一105 helper 在两侧页面加载前安装最少 load/error 监听；每一步和等待轮询读取当前卡片、img、source revision、实际 rect。初次 snapshot 捕获已经 complete 的缓存图。可见起止只记采样区间/上下界，**不称连续精确可见时长**；采样间隔固定并写配置，建议等待轮询100ms，且 DOM/source变化在下一样本重新纳入当前屏障。正面积相交、500ms最短停留、30s截止与≤0.5H步长均按协议，不为两侧/类型另调。

当前图已 complete/naturalWidth>0 后，每 source 仅执行一次 `img.decode()`，再核 connected/currentSrc 和两次rAF；此项单列屏障工作。DOM实际 `data-attachment-id` 是冻结 ID 入口，不能按文件名/出现顺序猜关联。after 将实际返回 lease URL 的局部摘要与 currentSrc/HTTP 对应；baseline 保留真实授权 read→产品 Blob→当前卡片关系，HTTP不适用。优先复用现有 Blob 创建旁路记录、卡片祖先ID与请求记录；若同ID重复请求使某source无法唯一关联，保留候选/标unmapped并停止等覆盖结论，不能靠数量、创建顺序或新增全量字节拷贝强行配对。**小样本必须先证明该关联可行，未证明前不启动正式流程。** queue取消原因仍unknown。

小样本使用同503 frozen库的 owned副本，真实“查看附件”入口与自然连续滚动，仅访问少量相邻卡片，并以相同步长访问至少一张文字SVG；事先确定代表位置与步数上界，不能悄悄走完整500。验证 PNG/JPEG、文字SVG、初始cached-complete、source替换/离开再返回的当前屏障和 raw因果链。故意身份错误/陈旧source判定用小纯工具谓词测试，不伪造产品IO。首次明确错误/timeout如实保留，出现关联歧义就停；不要顺带重跑三个长媒体的旧验收。工具独审后才由父级给正式paired gate。

## 正式阶段只在后续授权后执行

完全复用协议既定阶段，不新增 reload/GC/重复激活轮。450 raster、50 textSVG、两视频poster分别对账；计数支持情况显式区别，旧baseline无原生precise metrics为null/不适用而不是0。原件IPC/HTTP、派生HTTP、attempt/hit/logical input/output、Node/Rust/renderer RSS沿既有计量边界，不将逻辑bytes叫物理IO。只在全部500成功后称完整warm；保留历史169/450结论及局限。开始≥5GiB、低于2.5GiB停止自有流程；无设备、无原生整包构建、无冻结原件/SQLite改写。

本清单待对齐事项只有：接受旧静态frontend现存pin及其历史限制、确认105 after确切组合身份、在工具审查中冻结采样间隔并接受其非连续观测边界。其余阈值/阶段直接执行既有协议，不再另起设计轮。
