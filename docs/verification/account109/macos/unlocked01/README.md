# 解锁后的真实桌面账户检查点

2026-11-13。用户告知已解锁后，原生工具首先能正常列出运行应用。所有测试使用独立绝对数据目录，未访问默认用户资料库。原始合成资料库保留；最小安全观察见 [checkpoint.json](checkpoint.json)。

`ec4348c6` 候选两个独立进程均进入 visible/interactive、root 非 inert、startup detached。A 发起一次实际账户 UI SignIn，已有托管 SSO 自动返回后原生终态为 error/account_network、无 profile、同步关闭；B 仅启动，未发登录。两个进程均自然退出 0。

为定位笼统网络错误，`efe9902c` 为安全错误增加固定枚举 stage，区分 callbackListen/browserOpen/callbackReceive/identityProvider/coordinator；保留原 account_network 和安全提示，不传递上游错误、地址、回调或凭据。14 项原生账户测试通过。

从干净 `11cbf61f` 构建 debug/e2e 候选后，两端再次均可交互。A 的真实 SignIn 成功，原生状态为 paused、预期合成账户、同步首次默认关闭。A 实际请求开启并出现本地数据合并说明，随后经“开启并合并”按钮确认；最终 enabled=true、state=error/account_network，未建立远端连接。B 单次真实 SignIn 后原生终态为 error/account_network、stage=coordinator，无 profile、同步关闭。此阶段不证明具体 DNS/TCP/TLS/HTTP 故障层级。

这次也发现诊断字段未同步加入前端严格 DTO 白名单，B 的 UI 显示“账户服务返回了无效数据”；原生只读 status 才得到上述固定阶段。`f28818ad` 修正白名单，2 项测试核对旧 DTO、全部固定 stage、未知字段/URL/对象/空值的拒绝，TypeScript 检查通过。记录这一失败，不将修正前的二进制当成最新候选。两个 11cb 进程退出码均为 0、未发终止信号，但 shutdown ACK 超时，因此不接受自然退出检查。

最新构建为干净 `7841f308`，实际二进制 203,033,504 bytes、SHA256 `d36c5e23b6406ea31235220c8384750667038380fcc4ccb7c19be7d5f0078a70`。已从实际二进制匹配 Brotli build-info；fingerprint `98df19ef9d2bc4cf729b7e3f057283b3d930ff001d01e7c22f6c90becf85a347`、1,652 inputs、sourceDirty=false。详情见 [构建回执](../7841f308-debug-e2e.json)。它含默认原生账户入口、DEBUG 和 sync-e2e，是测试候选。

新增 [真实双桌面执行器](../../../../../scripts/verification/account109-desktop.mjs) 在这个二进制上尝试首次启动，45 秒内页面一直 hidden/root inert/startup loading，未执行本地数据、登录或同步步骤。随后原生桌面工具明确报告 Mac 再次锁定，不能自动解锁；[完整安全失败记录](latest-startup-result.json)保留。只对 owned PID 75748 发送 SIGTERM，已观察其退出。没有绕过 startup gate。

执行器已提交：创建两个全新资料库，经真实编辑/附件提交、原字节读取、进程重启、本地隔离、真实系统浏览器登录、首次合并、账户自动发现、双向正文与附件、暂停补齐、离线重启和退出等步骤。有错误则停止并留存；本轮这些数据用例均未运行。它在 macOS 上对自身进程生命周期持有临时 idle sleep assertion，不修改系统设置，也不能解锁或阻止手动/安全锁定。后续只在已解锁状态使用新输出目录运行：

```sh
node scripts/verification/account109-desktop.mjs \
  --binary /Users/water/work/2026/Apple-Notes-Clone/artifacts/account109/mac-7841f308-network-stage/notes-clone \
  --output /private/tmp/account109-desktop-real-7841f308-02
```

执行器清除其自有子进程继承的终端代理变量，接近从 Finder 启动的环境；不修改系统网络。此环境尚未执行到登录，不能声称它修复了协调服务请求。独立主机请求曾得到两个服务 health/discovery 200，Node health/auth-config 200；curl 也观察到连接被重置。不同客户端/时间点证据不可用于推断手机网络已恢复。

当前只有桌面 A 的一次产品登录成功；双桌面同账户连接、数据收敛、冲突、账户边界和 Android 三端仍未完成。GitHub 新私有仓库、推送和 Actions 未执行。旧 d69 双平台生产包保留其历史身份，尚未纳入此次诊断与 DTO 修正。
