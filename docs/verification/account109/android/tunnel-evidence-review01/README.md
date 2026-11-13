# Android 匿名隧道现有证据审查

结论：**代码和 APK 静态证据确认已配置匿名隧道回退；现有 Android
记录不能证明实际启动了 provider、建立了 mapping，或选中了隧道 transport。**
之前失败的可观察边界是协调服务网络请求，尚不能认定为 4G/Wi-Fi 打洞失败。

本次在 main `6e219696d1cb39bbb98ba47a0357237d3223247e` 只读检查了已有报告和源代码。
没有调用 ADB、读取原 store、复制 token、登录、启用同步、操作 UI、改网络或新增网络探测。
已有证据足够回答阶段问题，因此没有追加手机状态或 logcat 读取。
[result.json](result.json) 保存有限字段、输入文件哈希与判断边界。

## 静态能力与运行证据

| 检查项 | 已有证据 | 可得结论 |
| --- | --- | --- |
| Android provider 打包 | 9263 APK 静态身份与构建记录含 `libcloudflared.so`，SHA-256 `c1f6fc493bef37eb530022a1598e689c0d50073680192616aa7aea4e732cdd3c` | provider 随包存在，不证明曾执行 |
| Android provider 配置 | `src-tauri/src/account/provider.rs:169` 使用 `CloudflaredConfig::android_native`；`account/mod.rs:267` 将其放入 SDK 配置 | 产品已有匿名隧道能力，不证明本次已进入该路径 |
| 直连与回退 | `vendor/cybergrid-sdk/src/peer.rs:267` 在直连路径未成功后记录 `fallback-attempt / cloudflare-tunnel`，等待对端 tunnel 后拨号 | 匿名回退已实现，不证明本次打洞失败或回退发生 |
| provider 就绪 | `tunnel.rs:330` 同时要求 provider 分配地址和注册连接后才发布 `tunnel-ready` | 已有 Android 报告没有该运行事件 |
| mapping / 真实 transport | SDK 保留 peer transport，并有 `multiplexer-ready`、`mapping-ready` 等事件及 `Mapping.current_transport()` | 已有 Android 报告没有记录选中 `cloudflare-tunnel`、`webrtc-direct` 或 `iroh-direct` |

该 provider 实现使用 Cloudflare Quick Tunnel；当前启动参数选择 HTTP/2。
如果实际采用该回退，双方通过各自到隧道服务的出站连接完成通信，可以覆盖直连受限的场景。
这个设计说明无法替代对手机实际连通路径的运行验证。

检查了现有 Android 目录下 **84 份 JSON/JSONL 报告**，其中没有保留
`tunnel-ready`、`coordination-ready`、`mapping-ready`、`multiplexer-ready`、
`fallback-attempt` 或上述三类 peer transport 标签。目录中也没有归档的
`.log`、`.jsonl`、`.ndjson`、logcat 或 trace 文件供还原历史原始运行日志。
最近一次登录的临时输出目录没有顶层日志文件。

**缺少标签不等于证明 provider 历史上从未运行。** 登录助手的 safe DTO
仅保留 state、enabled、profile 是否存在及有限 error 字段，没有采集 SDK
provider/mapping/transport 事件；原始设备日志也未归档，无法事后补造这些证据。
报告中的 ADB forward/reverse mapping 清理属于调试连接，不是 SDK 端间 mapping。
旧网络报告的 `WIFI`、`CELLULAR` 则是 Android 网络接口类别，不是 peer transport，
也不能证明已经分别完成 4G 对 Wi-Fi 的端间测试。

## 之前错误停在哪里

[9263-signin01](../9263-signin01/README.md) 的唯一一次真实产品登录记录为：

```json
{
  "state": "error",
  "enabled": false,
  "hasProfile": false,
  "error": {
    "code": "account_network",
    "stage": "coordinator",
    "providerReason": null
  }
}
```

终止等待耗时 20,692 ms；一次 signIn，没有 enablement。状态从 signedOut 经
authorizing 到 error，同步始终关闭，没有被接受的 profile。该 APK 来源是
`9263ea87b5f6112bbd23d4b57d6d7a8b21c9fee3`。其历史 enrollment 错误投影使用
通用 `coordinator` 标签；不能把后来增加的更细 coordinatorProfile / Enrollment /
Jwks 标签倒套成当时已经观测到的精确失败端点，也不能证明具体 HTTP 状态、
底层网络根因或 OIDC 回调成功。

源码的顺序是账户身份/绑定及启用条件成立后，才运行协调注册、peer 发现和端间
mapping。`account/mod.rs:251` 在未启用时直接返回；`transport.rs:162` 先完成协调
登录/注册，随后才运行服务与 `client.map()`。SDK 的 provider 启动亦位于已初始化
协调 runtime 的路径中（`client.rs:1208`）。因此匿名隧道不能绕过当前账户启动所需的
协调服务 HTTPS 前提。`account/mod.rs`、SDK `peer.rs` 和 `tunnel.rs` 从上述 APK
来源到本次 main 没有变化；当前详细错误分类与历史证据的差异已单独区分。

已有的 [Android Rust public-native01](../public-native01/README.md) 也只观测到
协调服务请求约 5 秒连接阶段超时，身份服务 discovery 返回 200；它是公开 HTTPS
探测，不是 tunnel/provider/peer 测试。

最近的既有样本进一步限定当前前提：

- 手机 2026-11-13 **04:23:18–04:23:21 UTC** 的单次 `/healthz` 请求返回 curl 7、
  HTTP 000，无已完成 TCP/TLS；此前 native probe 的超时分类是另一份历史观测。
- 主机 **04:25:33–04:25:35 UTC** 的唯一控制 GET 返回 HTTP 200、curl 0、TLS verify 0。

这说明手机当前可达前提仍未恢复，主机在控制样本时可达；无法据此证明所有时刻的
服务器状态，也无法证明手机已在匿名隧道建立后失败。本次没有重跑任何探测。

## 下一次真实隧道测试的前提

1. 手机正常证书校验下能访问规范协调服务，且产品应用进程的账户请求路径可用。
   当前手机样本仍不满足；后续按用户已授权的真实测试范围执行。
2. 通过正常流程完成真实账户回调、owner/profile 绑定及启用，确认同账户对端发现。
   现有 Android 记录尚未通过这些账户验收点。
3. 准备经过审查的有限事件采集：provider 启动/就绪、双方 mapping 状态及实际
   selected transport。只记录固定事件名、transport 枚举、阶段、计数和时间；
   不记录隧道 URL、token、账户标识、原始 provider 日志或回调。
4. 在用户已授权的真实网络测试场景中，拿到 `cloudflare-tunnel` 实际选中与认证
   multiplexer/mapping 的对应证据，再验证完整文档、plainText、原始附件字节及有界清理。
   若实际选中直连，只能证明直连成功，不能计作匿名隧道验收。

这份审查未改变任何前提或设备状态，没有占用 ADB，也没有创建 commit。现有登录、
手机网络失败及主机控制报告均保持原样。
