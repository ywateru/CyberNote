# APP-002 Mac 本地入口：独立源码复核 01

日期：2026-11-04。审查对象：`/private/tmp/apple-notes-mac-startup-01` 冻结提交 `c4890fc22f289335ad16445a1128b2e38b3f34fd`（产品源码 `0e85224`，基线 `4d61222`）。独立审查前后候选工作树干净，产品 `media_permission.rs` SHA-256 为 `0008e0f343c15e0019bdb86c44b6423d07b477ca1206bd38ed40be1487bb7ad6`，与开发交接及 manifest 相同。未修改产品、主 Git、冻结候选或原始证据；未操作 GUI、设备、原版应用或运行中的克隆，未打包。

**结论：pass / SOURCE-READY，仅限本次入口策略源码与定向编译检查。没有发现阻断源码整合和新 Mac 包验证的确定产品问题。独立运行实际生产模块 12 个 Rust 定向测试全部通过。旧 sealed 白窗仍是失败基线；本报告不证明新包已启动、React 已挂载、F07 已通过或 UI 像素一致。**

独立证据位于 `../../verification/app-002-mac-startup-independent-01/`。`source-identity.json` 固定候选、产品 SHA、开发 manifest 逐项复核和独立读取的锁定框架片段/全文件 SHA；`rust-policy-tests.txt`、`rust-policy-test-exit.json` 为独立运行结果；`format-and-host-cfg.json` 为格式、差异和实际 host cfg。

## Findings

未发现 P1/P2 blocking 产品问题。存在一项 P3 non-blocking 证据格式差异：

| 严重程度 | 门槛 | 位置与事实 | 处理 |
| --- | --- | --- | --- |
| P3 | non-blocking | `docs/verification/app-002-mac-startup/candidate-media-policy-test.log:20` 有末尾空行，冻结提交范围 `git diff --check 4d61222..c4890fc…` 返回 2。开发 `format-and-host-cfg.json` 中 `git diff --check` 是当时未提交工作区检查，不等于冻结后全提交检查。产品与任务文件限定检查返回 0。 | 保留原始日志，不改写冻结证据；不影响 Rust 入口策略或编译结论。主整合如处理格式应保留本报告中的原始结果说明。 |

## 契约与真实接线

| 任务契约 | 独立核对 |
| --- | --- |
| 锁定框架的实际默认入口 | Cargo.lock 锁定 Tauri 2.12.5、tauri-utils 2.10.2、url 2.5.8。当前 `tauri.conf.json` 主窗未设 URL，tauri-utils `config.rs:122` 的默认值为 `App(index.html)`。`frontendDist` 是目录 `../dist`，不是外部 URL；Tauri `manager/mod.rs:345` 的生产分支因此选择 `tauri_protocol_url`。`protocol/mod.rs:32` 在 Mac 返回 `tauri://localhost`，无尾斜杠；`manager/webview.rs:469` 对 App(index.html) 不 join 路径，保留该 base URL。片段由独立审查直接读取，不只引用开发摘录。 |
| 最小路径修复 | `media_permission.rs:36–64` 仍先拒绝非空 credentials，CustomProtocol 仅为精确 `tauri`、`localhost`、无端口增加空 path，与 `/`、`/index.html` 并列。不是任意 tauri 路径或 localhost 来源白名单。HTTP workaround 与 dev HTTP 分支仍要求旧 entry_path，未增加跨平台来源。 |
| 真实生产策略检查 | macOS 编译分支测试调用实际 `EntryBoundary::current().allows`，使用本 crate 的 `tauri::Url` 解析无尾斜杠入口，确认 path 为空并允许。其余新测试直接穿过实际 EntryBoundary/PageTrust，未复制策略模型或 mock Tauri URL。host cfg 独立核为 macOS/aarch64。 |
| 导航不是媒体许可 | `media_permission.rs:83` 的 navigation 仍先撤 committed，并清 Started；新无尾斜杠根入口 navigation 后，未确认 Finished、仅 Started 均不允许媒体，精确配对 Finished 后才允许 Camera/Microphone。Geolocation 拒绝；可信重载撤销；拒绝非入口导航后 sticky blocked 保持。实际新测试通过该生产状态机。 |
| 生命周期与实例归属保持 | 独立字节比较确认从 PageTrust 起到 response 末尾的生产代码与基线完全一致：真实 WebView ResourceTable、ready 捕获 Arc、Destroyed/Resource.close、uncertain、try_lock 失败保守拒绝、未知 PermissionKind 拒绝均未改。没有 label 级信任缓存或同步 WebView.url/UI 请求。原有实际资源表、销毁/替代、争锁和迟到 Finished 检查独立通过。 |
| 宿主接线保持 | `lib.rs:331–332` 仍将全局 permission callback 注册为 `media_permission::response`，同时注册 `media_permission::lifecycle`；lib.rs 未修改。锁定 Tauri `manager/webview.rs:296–335` 将 page/permission hooks 分发到注册的真实 Webview，`:601–630` 分发 navigation 到插件。此次不创建另一路 WebView 或更换回调。 |
| 既有平台与 CSP | Android/Windows 的 HTTP workaround 与 cfg(dev) 的 localhost:1420 分支保持，既有允许/拒绝检查通过。CSP/config/依赖/锁文件无修改；实际配置 frame/child/object/form 拒绝检查通过。该源码检查不代表 WebView 平台实际执行 CSP，亦不是 Android 首次授权流程复跑。 |
| 范围与完整性 | 冻结 diff 仅包含 media_permission.rs、任务文档和开发证据。App/bridge/Editor/CSS/Store/附件操作/原生顶部/依赖未改；独立验证开发 manifest 每个文件 SHA 均匹配。EntryBoundary::current 前缀与 PageTrust→response 生产区域字节一致。 |

## 独立执行

共享主 target 由 develop 正式交接后，仅执行一次定向实际库检查，退出 0：

```text
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib media_permission::tests:: -- --nocapture
```

结果：12 passed、0 failed、0 ignored、42 filtered out。使用真实生产 app library、锁定依赖、现有 target；未复制 target，未跑完整 Store 或 IME 矩阵。完成后已立即向 root 正式释放 target。独立 `rustfmt --check --edition 2021 src-tauri/src/media_permission.rs` 返回 0；产品与任务文件 scoped diff-check 返回 0，全冻结 diff 的 P3 见上表。

开发者旧策略加新空 path 回归的失败日志已读取、其 manifest SHA 已核：实际 allows 断言失败，前面的 path==空断言通过。本次没有切换冻结产品重跑旧策略，因此它明确计为开发者证据，不冒称独立基线运行。

## 后续实际验证边界

原 sealed exe `11dcbfc4…` 的 white window、WK URL=null/loading=false、navigation Ignore 及 private 原 request URL 保持原状；相关原始 README/result 已只读复核。锁定源码和实际策略检查确认一个能解释观察结果的具体缺陷，但没有捕获旧初始请求 URL，也不能证明它是唯一启动问题。

主整合并冻结新 Mac 包后，仍须核对构建输入、包/可执行 hash、本地签名、实际加载 URL 与页面，再观察三栏、原生工具栏、合成 note，随后执行 F07 unique→zero→clear、焦点/历史。媒体授权、Android 启动、音频触摸、附件提交和像素应分别验收。本报告不跨包追认旧失败，也不把 navigation source-ready 当作任一运行时或 UI 验收通过。

既有同 canonical URL 的 Started/Finished 无 load ID、kind-only permission 无 requesting-frame 信息等边界仍按原权限报告保留；此次空 path 等价形式修复不扩大这些结论。
