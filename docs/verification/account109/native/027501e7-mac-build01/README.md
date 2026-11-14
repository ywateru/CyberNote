# Mac 登录错误修正候选重新打包与启动

2026-11-14，按用户“重新打包并运行”要求执行，仅构建、打包及启动，登录和同步继续由用户手动验证。

- 精确构建源码：`027501e77154c059688385ac293787a88f9e3598`，构建前后工作区干净、四份锁文件不变。
- 新包：`artifacts/account109/mac-027501e7-debug-01/CyberNote-Account109-027501e7.app`。
- 包内 executable SHA256：`1e37f9cad7f1da7332e2e779cb2ade4acbf3e8874674b3ead4b319f5aa9d2f32`，arm64。
- 复用原共享 Cargo target，debug 构建启用 `sync-e2e,tauri/custom-protocol`，locked/offline、两任务并行；没有创建重复 target 或清理旧候选及资料库。
- 前端类型检查与构建、原生编译、24 项编译能力检查及内嵌版本/资源核对通过。独立复核确认源码指纹、包身份和资源一致。
- 使用 APFS COW 包装并做本地 ad-hoc 签名，整包 `codesign --verify --deep --strict` 通过；没有发布证书或公证。
- `open -n` 启动成功，进程 PID `19052` 的路径为上述新包中的 `Contents/MacOS/notes-clone`。原生 UI 观察确认应用名称为 `CyberNote Account109 027501e7`，窗口 `CyberNote`、`tauri://localhost` 主界面正常呈现。
- 本次按用户此前直接运行的方式使用默认资料库，未指定 `--data-dir`；独立 bundle ID 不改变编译时 `com.local.notesclone` 的资料库选择。

构建、打包和启动回执分别保存在上述产物目录的 `build-record.json`、`packaging-receipt.json`、`launch-receipt.json`；原始构建 binary 与签名后的包内 binary 身份分别记录，不能混用。

本次包含[登录返回后错误细分和协调域名修正](../mac-post-login-diagnosis-20261114.md)，不代表登录或同步验收通过。代理没有执行登录、账户操作、ADB 或端到端测试。用户可重试后展开“错误详情”，记录具体 code/stage/requestReason/httpStatus；历史 `codeExchange/scope` 分支仍待实际结果确认。
