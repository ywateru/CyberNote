# 主机原生 HTTP 公共路径对照

2026-11-13，主线 `95ddc2ff`，独立原生工具再次明确报告 Mac 锁定、无法自动解锁。没有再次启动 App 或发起授权。随后运行一次无凭据 Rust 公共端点探测，检查上一轮“终端代理是否导致协调请求失败”的假设。

独立临时 Cargo 程序使用与产品相同的 reqwest **0.12.28**、默认 feature 关闭、json+rustls-tls；redirect none、15 秒总超时、5 秒 connect 超时。第一组 client 保留默认环境代理处理；第二组显式 no_proxy。只读取 HTTP 状态和耗时，不读取/归档响应体、headers、cookies、网络地址或底层错误原文。没有授权、密码、App grant、回调或邀请输入。源代码及锁文件冻结在 [source](source/src/main.rs)，哈希和编译/退出结果见 [receipt.json](receipt.json)。

| 公共请求 | 默认环境 | 直接请求 |
| --- | --- | --- |
| coordinator health | 200，2695 ms | 200，2649 ms |
| coordinator auth/config | 200，2691 ms | 200，2670 ms |
| coordinator 匿名 profile | 401，1413 ms | 401，1413 ms |
| Logto discovery 对照 | 未请求 | 200，821 ms |

[实际结果](result.json)证明该时点主机原生 Rust 公共路径在两种模式均可达，匿名 profile 正确拒绝未登录访问；不支持“继承终端代理必然失败”的判断。因此没有修改产品代理、DNS、TLS、部署防护或服务配置。此前 desktop B 的 authenticated coordinator 阶段失败仍保留，不能用本次匿名 401 证明认证请求恢复，也不能推断手机网络、产品建连或多端数据收敛通过。

无 App 构建/安装/启动，无登录自动重试，无 ADB 操作或与旧手机操作者并发。独立工具编译/运行均退出 0，未留下探测子进程。双桌面真实用例仍待桌面解锁后使用已准备的 7841 候选执行。
