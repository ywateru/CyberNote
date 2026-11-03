# APP002：权限回调候选独立静态复核

2026-11-03，verify。对象为隔离目录 `/private/tmp/apple-notes-media-roundtrip-02` 的冻结提交 `88dfee5cef009ce6e4357661ceb0fc8fd50035ed`，检查前后工作树干净。按 `docs/plan/tasks/app-002-permission-01.md` 的固定可信 bundle 边界复核，未更改产品代码，未构建或安装 APK，未操作 Mac/Android。原始录音入口失败不能因本报告变为通过。

**结论：在本轮有限静态范围内，没有发现阻止进入主分支整合及新包验证的确定产品问题。独立复跑实际生产模块的 9 个 Rust 定向测试全部通过；实际 Android 授权、录音和有效 CSP 仍待新冻结包验证。**

证据在 `docs/verification/app-002-media/permission-independent-01/`。`source-identity.json` 固定候选提交、实际文件 SHA、命令/退出码和锁定 API 文件 SHA；`locked-api-excerpts.txt` 保存本次直接读取的框架片段；`rust-policy-tests.txt` 是独立运行输出。未把开发者的 Android cargo check 当作本次独立运行。

## 生产路径与契约核对

| 项目 | 独立核对结果 |
| --- | --- |
| 实际回调接线 | `lib.rs:238` 将 App 全局 permission callback 换为 `media_permission::response`，紧接注册同 crate 的生命周期 hook。没有依赖/锁文件、窗口创建路线或原生 Android 请求实现变更。回调与导航/page hook 均没有 `.url()`、等待 UI 调度结果或自行申请系统权限。 |
| 默认拒绝 | `response` 只查已存在资源；没有资源、未完成可信 Started/Finished、销毁、不确定状态与 Camera/Microphone 以外的种类均明确 Deny。没有用 Default 放行。 |
| 真实实例资源 | `resource` 调用传入 Webview 的 `resources_table()`；`table_resource` 以实际 Rust 类型查找/加入 `Arc<MediaPageResource>`。锁定 Tauri 2.12.5 的 `Webview::new` 为每个实例创建新的 `Arc<Mutex<ResourceTable>>`，clone 只共享该实例的表；其内部存活判断也用表的 Arc 身份。候选没有以 label、Webview Eq/Hash 或全局映射复用可信状态。 |
| 销毁 | ready 捕获该资源 Arc 并在所属窗口 Destroyed 时置为 uncertain；Resource::close 同样撤销。迟到的旧销毁回调只触及捕获的旧资源，不按 label 查询替代窗口。ready 使用“如无则建”，不会覆盖此前已经收到的有效加载状态。 |
| 产品入口 | Android/Windows 严格为 `http://tauri.localhost` 有效端口 80；其余目标严格为 `tauri://localhost` 且无端口。共同限制空 userinfo 与 `/`、`/index.html` 路径。仅 cfg(dev) 增加实际配置的 `http://localhost:1420`。其他端口、HTTPS、伪装 host、非入口文档、file/data/blob/about 均不在白名单。query/hash 不选择另一份 bundle 代码；当前独立笔记窗口确实使用 `index.html?note=…`。移动 dev 代理的其他实际来源没有被猜测放行。 |
| 允许导航到 Started 之前 | navigation 先清 committed，再清 started；此时旧可信 Finished 没有配对 Started，不能恢复授权。navigation 本身不授信。 |
| 可信重载与取消 | 可信 Started 撤销 committed 并更新最后 URL；精确同 URL Finished 才可恢复。没有等待可能永不完成的旧 load，也没有第二 Started 永久拒绝。不同可信 URL 的迟到 Finished 不匹配新 started；同 canonical URL 的旧 Finished 则存在公开 API 的固有限制，见下文。 |
| 未知事件不可洗白 | 任意非白名单 navigation、Started 或 Finished 都调用 revoke，留下 blocked；随后可信 Started/Finished 不能清除。未知 navigation 返回 false；不把被取消的外部导航视作可忽略事件。 |
| 争用撤销 | 自有 policy 使用 try_lock。更新失败将 uncertain 原子标志永久置真，后续读取即拒绝，不能默默丢失一次撤销后保留旧 Allow。读取遇到 policy 争用也拒绝。这里不声称完全无锁：公开 `resources_table()` 本身使用框架 Mutex，并非 try_lock 或等待自由接口；本候选没有再等待 UI 消息管道。 |
| 全窗 hook | 锁定框架为每个 pending Webview 包装导航/页面/权限，插件 store 逐个分发全局 hook；attach 将实例加入 manager 后触发所有插件的 webview-created。候选不局限 main label。配置主窗与 `App.tsx:1010` 的 JS 独立笔记窗均走此框架路线，生产中未发现局部 permission 覆盖。框架自身用 label 找当前注册 Webview，这不是候选自己的 label 信任缓存；此静态检查不声称测试了销毁替换中的平台事件时序。 |
| requesting-frame 信息缺失 | permission 仍只有 kind，候选没有假造 request origin。实际配置同时加入 `frame-src 'none'`、`child-src 'none'`、`object-src 'none'`、`form-action 'none'`；devCsp 未设置，锁定 manager 的 dev 路径回落到普通 csp。当前编辑器 schema 没有 iframe/object/embed，实际应用附件节点使用既有组件，未见生产 raw HTML/frame 主动创建路径或主动 Webview navigate/loadUrl。该有限文本/接线审查不是完整 HTML 输入安全审计。 |

## 已运行检查和证据小问题

在隔离候选目录离线运行以下现有测试，使用获准共享的主 target；Cargo 串行锁管理编译输出，没有复制 target：

```text
cargo test --manifest-path src-tauri/Cargo.toml --offline --lib media_permission::tests --target-dir /Users/water/work/2026/Apple-Notes-Clone/src-tauri/target
```

退出码 0：9 passed、0 failed、30 filtered out。检查穿过实际生产 PageTrust、MediaPageResource、table_resource 和实际配置，并非复制出另一个策略模型。覆盖入口白名单、未知权限、缺失/未确认、导航撤销与 Started 前旧 Finished、可信取消/重载、未知事件 sticky deny、真实新旧 ResourceTable、迟到旧销毁、policy 争用及 CSP/dev 配置。测试中的 Android 边界是显式构造参数，不等于运行 Android WebView。

产品三文件的提交差异 `git diff --check 88dfee5^ 88dfee5 -- src-tauri/src/lib.rs src-tauri/src/media_permission.rs src-tauri/tauri.conf.json` 退出码 0。全提交差异退出码 2，唯一报告为 `docs/verification/app-002-media/permission-01/rust-policy-tests.txt:17: new blank line at EOF`。这是保存测试 stdout 的非产品格式小问题；未改动冻结证据。开发自检笼统写 diff-check PASS，不能替代本次对已提交差异的结果。root 可在保存/整合证据时处理，并保留此原始结果。

开发者保存的 Android cargo check 退出成功日志、首次受限失败日志及 NDK 环境已读取；本次不重复跨目标 check，也没有声称取得独立 Android 编译或设备结果。

## 下一阶段必须保留的边界

锁定页面事件没有 load ID。`Started(L旧) → Started(L重载) → Finished(L旧)` 在精确同 canonical 可信入口时可能提前恢复来源可信；不能证明最新页面完成加载或绘制。本契约接受它的理由是固定同一可信 bundle、拒外导航、实例资源与无 frame/object/form 路径共同组成产品边界。它不能推广为逐请求/逐 frame 的来源验证。query/hash-only 导航若没有后续 page events，候选会保守保持拒绝；当前产品没有明确主动 hash 导航路径，其实际行为仍未知。

同样，CSP 字符串和 schema 未发现 frame 路径只能支持源代码结论。srcdoc/about:blank 等本地派生文档、WebView91 的实际策略执行、受控不可信来源/子 frame 拒绝必须在新包中另测；不能仅看缓存主页面 URL 宣称 frame 来源已核。系统文件选择、分享和外部打开没有因本静态检查获得通过，既有附件失败/孤儿证据保持有效。

本报告不证明旧 GetUrl panic 已在运行时消失、不证明首次拒绝/允许弹窗、无附件副作用、静音容器/时长、track/recorder 生命周期、冷启读取、系统指示/物理释放、Mac 采集或像素一致。新包仍须按任务契约有限验证；宿主麦克风保持 OFF，可听/可辨音轨仍 unknown。
