---
id: app-account109-live-recovery
scope: Real account coordination diagnosis and command-driven acceptance
status: in-progress
depends-on: [app-account109-native, app-account109-server, app-account109-ui]
---

## objective

在保留已有真实授权与合成数据的前提下修复双桌面自动连接失败，完成完整文档和附件原字节双向同步，再完成少量 Android 三端账户同步。用户允许命令行直接调用真实功能；可使用 debug/e2e 原生 App stdin 驱动与生产 IPC，仍须执行真实 owner、SDK、enrollment、Noise 和 Store 链。

## context

[账户同步架构](../../architecture/account-sync.md)、[验收用例](../../verification/account109/ACCOUNT-TEST-CASES.md)、[五轮原始结果](../../verification/account109/macos/real-account-runs01/README.md)。前置模块已接线但其真实集成验收仍在进行，不以模块任务名称判定前置全通过。

## path

四项隔离工作：原生有限错误分类（`account/{types,provider,enrollment,transport,mod}.rs`、前端 DTO）、桌面执行器（`scripts/verification/account109-desktop*`）、服务身份公钥错误分类（`services/coordinator/{src/identity.ts,test/identity.test.ts}`）、精确候选核包及 Android 合成数据更新验证（`docs/verification/account109/{macos,android}`）。实现与独立验证分离；具体候选经审阅后逐项合入。

## verification

1. SDK provider 与 account auth 的网络/刷新/身份失败保持有限安全分类，认证失败也能定位阶段；前端严格拒绝任意第三方字段。不能记录 token、回跳 URL、邀请、原始响应或 grant 文件。
2. 服务端只有实际身份/签名/claim 验证失败返回 401；远端 JWKS 请求失败返回固定 503。固定 issuer、resource、ES384 和所有 claims 校验保持，加入故障与恢复反例。
3. 在同一对 `90b8b28b` 已登录的测试库复验，不清库、不复制 grant、不手工配对。终端认证失败立即保存状态并失败，不耗尽整个发现超时掩盖原因。
4. 双端完整 document/plainText、附件引用及 PNG/bin 原字节一致；暂停/离线重启补齐、冲突保全、退出后不收发且本地保存可恢复。每轮结果必须在 owned 进程及 driver 清理完成后判定。
5. Android 候选先核源码/包/签名/回跳/arm64 provider，再保数据更新并比较全部既有合成文档；账户三端用例需后续真实授权，不用本地更新冒烟代替。
6. 汇总红绿记录和本轮提交，净化导出通过后才向新私有仓库发布全新历史并执行 Actions 构建。旧仓库历史不能直接推送。


## 2026-11-13 CLI 续验检查点

- full02 已真实通过十项检查，包含双向完整正文/附件原字节、暂停恢复及离线重启；两端各形成一个冲突，后续原生 eval 超时，根因未定。
- 已审阅的生产 `sync_command` 续验工具在 continuation01 中完成原始两分支只读基线校验，但 A 的 `ready/documentProbe` 超时，未执行冲突解决或退出；关闭未正常结束，精确 owned PID 经 SIGTERM 后已不存在。失败原样保留于 [continuation01](../../verification/account109/macos/full-native02-continuation01/README.md)。
- 本次父级只读原生访问明确返回当前 Mac locked/自动解锁失败；仅作当前访问条件，不追认为 full02 或启动超时的已证实原因。用户此前已授权用命令行调用实际功能，现评估无需 WebView 的 native 调用方式。
- 工作树审计覆盖 20 个有效工作树，未发现遗漏的未提交第一方产品或执行器代码；历史 Android 输出/依赖目录保留。见 [审计](../../verification/account109/WORKSPACE-AUDIT-LATEST.md)。
- Android coordinator 原生连接超时仍是独立外部前提，真实三端未执行。不会用准备好的执行器或设备外测试代替结果。


## 无 WebView 的真实原生测试入口

目的：在当前界面访问受阻时验证实际 Rust 账户与数据链，遵循用户允许命令行调用功能的授权。此入口不替代真实 UI 确认、浏览器登录和物理输入验收。

1. 仅在 `sync-e2e && debug_assertions && desktop` 编译条件下，并显式开启专用环境开关时生效。常规开发、production 和 Android 不新增入口、socket 或 IPC。
2. 使用正常 `startup::Workspace` 独占 lease、隔离 cache、AppHandle、Store、Session、Media、Sync、Account 初始化；不复制 grant，不注入身份，不手工配对。仅从原库恢复已有授权。
3. 清除本次配置窗口，保留一个明确标识的 native harness 文档参与者。现有 adapter/Session 不能用空参与者执行同步；native harness 通过真实 Session token 回答 production probe/prepare/reply 协调协议，不能改写原有权限、归属、epoch 或提交规则。它没有待保存的编辑器草稿；新正文只以正常 Session 保存动作落库。
4. stdin/stdout 仅提供固定 JSON 操作：ready、workspace、conflicts、keepAll、accountStatus、signOut、readAttachment、createPlainNote、shutdown。拒绝未知字段/类型、超长行和重复或非法请求 ID；不接受任意 action/eval、路径、账户配置、URL/token 或配对参数。报告安全错误，不记录 grant、上游原文或回跳。
5. workspace/附件通过生产 Session/命令授权边界；keepAll 必须已有 entity/digest 且明确 true；createPlainNote 仅本轮合成文本。关闭复用正常 App exit 与账户网络/Media/Sync 停止流程，自然退出后才能 overall pass。
6. Node 驱动在新鲜输出目录延续 full02 两分支只读基线与精确 digest gate，核对完整两分支、附件引用/归属和读取/磁盘原字节；再执行退出、本地编辑、两向排除和重启。旧失败保留，不重跑此前十项或重新制造冲突。驱动与真实运行由不同代理复核。

先在一次性独立合成库完成初始化/协议/保存/退出烟测并独立审阅，再允许原库单次续验。构建须记录准确 source revision、工具/可执行字节哈希及无 WebView/native participant 覆盖边界。若此方案需要放松生产协调或授权规则，停止该方案并回到外部访问前提。


## 2026-11-13 实际原生续验结果

[临时库 7 项烟测](../../verification/account109/native/headless-smoke01/README.md)和[原库 91.131 秒续验](../../verification/account109/native/headless-continuation01/README.md)均通过。原库既有两个冲突分支经一次生产 keep-all 后双方完整保留，PNG/bin 原字节一致；A 实际退出、本地新建、重启与两向排除通过，三个进程全部自然退出且最终不存在。保持旧 full02 和 WebView continuation01 失败，不追认其根因或 UI 修复。

本任务仍 in-progress：Android coordinator 网络前提未满足，实际账户三端用例未执行；A 已正常退出，三端前需要真实浏览器重新登录，不能复制 grant。最新结果、覆盖限制与净化候选见 [RESULT-LATEST](../../verification/account109/RESULT-LATEST.md)。GitHub/Actions 维持测试完成后顺序，尚未执行。
