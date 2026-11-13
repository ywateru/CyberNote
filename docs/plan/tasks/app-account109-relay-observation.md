# ACCOUNT109 实时中转承载观测

2026-11-13。产品 account transport 持有每个 peer 的 enrollment/sync 两个 SDK Mapping，但当前 Device DTO 与三端执行器只观察 online/connected，不能证明实际走匿名中转。SDK 公网 RELAY-01 的通过不补足真实 RELAY-02。现有三端普通 PASS 不得标为中转 PASS。

## 观测契约

- 在持有真实 Mapping 的账户 transport owner 内有界读取 `Mapping::current_transport()`；禁止使用仅代表初始连接的 `transport()`、provider tunnel-ready 或业务 connected 代替。
- enrollment 与 sync 路径分别记录，输出仅为固定 `webrtc-direct`、`iroh-direct`、`cloudflare-tunnel`、unavailable/unknown 标签。不得输出 URL、地址、证书、token 或第三方原始错误。
- 只读 status 返回 owner 已缓存的观测，不发网络请求，不等待 Mapping 锁。观测带明确 generation/样本序号；采样超时/错误/关闭不能复用旧成功，pause、logout、generation 改变时清除旧证据。字段为可选有限扩展；缺失不能推为 direct 或 relay。
- 不改变 map 选择、认证、身份、重试、同步提交或默认 transport 配置，不增加强制 relay、任意网络地址或身份输入。采样任务必须有界关闭，不延迟正常 shutdown。
- 严格 native/TS DTO 与测试 safeStatus 同步支持新字段。RELAY-02 增加显式独立断言：真实手机 4G/桌面 WiFi 的声明链路，在正文及附件原字节传输前后均取到本代新鲜 sync Mapping 中转样本。通过普通三端数据用例但路径为 direct/unknown/缺失/过期时，不记 relay PASS。采样仅证明这些时点，不能宣称逐字节路径追踪。

## 验证门槛

离线验证换路/关闭/未知路径、锁超时、旧代清理以及 connected=true 但路径非中转的拒绝；原数据、附件字节和清理 gates 保持。作者与独立审阅分离。真实公网/4G、安卓网络设置及原库不在离线实现中操作；网络与账户条件满足后另运行真实用例。

此任务排在当前 token 响应诊断整合之后，避免并发修改同一 DTO。先完成 AUTH 的诊断候选与一次有限复验，不以此观测功能阻止定位当前登录错误。
