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
