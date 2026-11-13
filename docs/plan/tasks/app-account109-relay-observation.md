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

## 有限 DTO 与采样边界

`status.transportGeneration?: number` 标识本次 network owner 的观测代次，独立于账号代次；每次启动分配新值，停止即清空。远端 Device 可选 `transport: {generation,sample,ageMs,enrollment,sync}`；两路径值只允许 `webrtc-direct | iroh-direct | cloudflare-tunnel | unavailable | unknown`。sample 是本观测代次的递增正整数，ageMs 由 native 单调时钟计算，不依赖设备墙钟。采样间隔 1 秒，每条 Mapping 读取上限 250ms，并行读取两路径；超过 3000ms 的缓存不返回。status 只读缓存，不读取 Mapping。

每个 Mapping 对拥有可取消采样任务；每次读取开始前撤销该 peer 的上一样本，超时/关闭/错误返回 unavailable，未知 SDK 标签归为 unknown。观测任务不更改 Mapping，不参与重试或业务连接。cycle 错误暂停缓存发布并清空样本，下一次业务成功只重新开放缓存，必须等待新采样；owner 停止/失败/换代封闭旧任务，迟到结果不能复活证据。DTO 扩展只在 ready、enabled、无 error 时有效，本机条目不带 Mapping 证据；缺失字段保持缺失。

可选 RELAY-02 由执行器显式开启并声明手机4G/桌面WiFi；该声明不等于自动检测网络设置。A→C、C→A、B→C、C→B 四条有向 sync Mapping 必须在两向正文/附件用例动作前后均为本代新鲜 cloudflare-tunnel，后样本序号必须增加且代次不变。普通数据 PASS 不生成 relay PASS，清理失败仍阻止最终 PASS。采样只证明前后时点，不证明每字节所经链路。

## 作者实现与离线验证

独立作者分支 `codex/account109-relay-observation` 基于 `d1a6eadf`，前一诊断分支保持不变。仅在既有 transport/types/Runtime/TS/helper/三端执行器路径实现缓存观测及独立 opt-in 断言，不修改 SDK 策略或 relogin 执行器。原始路径字符串只在 native 内匹配并归约，不进入 DTO；status 不调用 Mapping。样本时龄从读取开始计算，恢复时拒绝暂停前已开始的迟到读取。采样任务 Drop 取消并 abort，不延迟 Mapping 正常关闭。

作者离线检查：原生 `account::` **31/31**，Node DTO/helper/三端/relogin 四套 **84/84**，`tsc --noEmit` 与 `git diff --check` 通过。原生命令为 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib account:: -- --test-threads=2`；使用父级释放的 `/private/tmp/cybernote-account109-mac-ec4348c6-target-01`，`CARGO_BUILD_JOBS=2 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0`，完成后释放。此前作者专用小型 target 的精确缓存模块/原生 DTO harness **8/8**，不替代整合检查。测试覆盖切换 direct、关闭/未知/锁超时、pending 撤销旧成功、采样超时、失败/暂停/退出/新代与迟到结果清理、有限序列化/严格 DTO、connected direct 不可获得 relay PASS、同代递增前后样本以及原数据/原字节/cleanup gates。

未运行真实三端/4G 或 App，不访问现有授权/原库、ADB、provider 或公网，不宣称 RELAY-02 已实测。独立审阅仍由父级安排；此记录是作者验证。源码先提交，再从该精确已提交 SHA 单独刷新 manifest；没有新增导出文件路径。

## P2：同代 peer 退休的取消屏障

审阅指出 `abort()` 不会抢占已在同步 record/remove 或等待缓存锁的旧任务；仅检查 owner generation/ready 不足以阻止同代退休 peer 的迟到写入。本修正在同一缓存 mutex 内检查该 sampler 的 cancellation token，再执行 task record 或 task remove；Drop 保持先 cancel、abort，再无条件的同锁 remove。若旧操作先获得锁，Drop 最后删除；若 Drop 先完成，旧操作在锁内观察取消而拒绝写入/删除。`run_service` 单一 owner 串行遍历退休项，`mapping.close().await` 在后续 map/spawn 前完成；同 peer 的替代 sampler 不会先于旧 Drop 的最终删除建立。因此 token 屏障足以覆盖当前串行退休/重建路径，不新增 sampler ID 或 API/策略。回归包括退休后迟到 record 不复活、同代替代样本不被旧 record/remove 改写，以及持有 cache 锁期间取消的旧任务操作。

P2 作者验证：相同受限环境的完整原生 `account::` **33/33** 通过（新增两项取消/退休回归），`git diff --check` 通过；此前 Node/TS 字节未变。完成即释放共享 target，独立复审由 Cicero 执行。未启动 App、真实网络或访问现有授权。
