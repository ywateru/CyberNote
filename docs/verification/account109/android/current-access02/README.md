# Current Android access check 02

2026-11-13 **05:09:50–05:09:56 UTC**（北京时间 13:09:50–13:09:56）。源码记录 `86cf971f925e375b63caa6771abe211f470dee43`；启动时主工作区 clean。

**手机 canonical health 仍不可达；下一步真实手机登录的网络前提尚未恢复。** Host 单次 control 成功。两次请求均使用普通 canonical HTTPS/TLS 校验，未跟随重定向、未附带凭证、未保留响应正文。

| 有限观察 | 本次结果 |
| --- | --- |
| 指定设备授权状态 | `authorized`（ADB get-state=`device`），只读一次 |
| 当前 active-default network | `CELLULAR`；设备端过滤后仅保留有限 transport 标签 |
| 手机 GET | curl **7**，HTTP **000**；无完成的 HTTPS 响应 |
| 手机计时 | DNS 0.125778s；TCP 0.000000s；TLS 0.000000s；curl total 2.337119s |
| Host GET control | curl **0**，HTTP **200**，TLS verify **0**；total 2.793860s |
| 请求数 | 手机 **1**，host **1**；无重试 |
| ADB 归属 | 检查结束后已释放；本 agent 后续不再使用 |

唯一请求 endpoint：`https://cybernote-sync.vercel.app/healthz`，method GET，连接上限 5s、curl 总上限 10s；手机另有设备命令 12s 和 host 侧 15s guard，host control guard 12s。精确命令保留于 `check.py`。请求按原环境执行，未更改 DNS/IP/proxy/env/VPN，未 pin IP 或绕过 TLS。

手机 stderr 在内存中仅归约为有限 `errorKind=timeout`，未输出或归档原文；**实际 curl exitCode 为 7，不是 28**。DNS 计时存在，但 TCP/TLS 完成计时均为零；`verifyResult=0` 在没有完成 TLS 握手时不能证明证书验证成功。结果表示本次手机侧连接未完成，不能据此认定精确路由/代理/NAT 原因。Host 成功也不证明所有服务 API、OIDC/JWKS 或手机 app 可用。

`CELLULAR` 仅是当前 Android active-default network 的系统元数据，不能证明实际 SDK 选用何种 peer transport、打洞失败或隧道建立。读取 connectivity 时在设备端过滤，未保留 network ID、IP、SSID、路由、用户数据或原始 dumpsys 文本。

Parent 报告本轮原生 Chrome AX 已成功、当前桌面不再 locked；该信息在 result 中作为 **parent 的独立当前观察** 记录，本次没有重复 CUA 操作，也未将它作为旧故障原因。

未登录、复制授权、扫描用户数据、操作 app/store/UI、安装工具、变更网络或运行额外 DNS/TCP/网络探测。旧 `goal-network-recheck01` 的全部文件 hash 前后相同，映射保存在 `result.json`。失败证据已保留，未循环检查或自动继续登录。

归档包含有限手机/host 结果、设备授权和默认网络标签、完整安全汇总及实际执行脚本；无任意上游 stdout/stderr、响应正文或凭证。`SHA256SUMS` 绑定除自身以外的全部文件；均使用可普通 Git 收录的后缀。本 agent 未提交。
