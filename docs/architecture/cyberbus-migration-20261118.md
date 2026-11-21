# CyberBus 账户设备与同步迁移

状态：核心迁移已接通；真实双 Mac 原生 UI 增量同步已通过，Android 真机双向同步及完整生命周期验收待完成。2026-11-18 用户授权先读代码和文档、形成方案，再替换并测试。本文取代账户链路中的 CyberGrid/coordinator 传输契约；既有 Store、Session、版本向量、冲突和附件规则继续适用。未完成的验证不得写成通过。

## 基线与目标

应用基线 `eb6f4f27`；CyberBus 固定源码 `359465e83bd74b571a963f3d1fdc238f50169919`，本机 `/Users/water/work/2026/CyberBus` 与公开仓库 HEAD 相同。来源为 `https://github.com/osd-pub/CyberBus`。旧 SDK 通过 Vercel/Redis 目录、端口映射、enrollment JWT 和 Cloudflare provider 接通本机同步服务。新 SDK 通过自有 OIDC owner、EasyTier、Noise 认证设备与 Protobuf Data 工作，并不提供旧端口映射 API。

目标：账户登录、设备展示、命名、暂停/启用、指定设备 push/pull/both、取消/退出/重启恢复全部接入 CyberBus。未登录的本地编辑和手工配对同步仍使用现有实现。保留正文/附件合并、删除墓碑、并发冲突、持久 inbox、Session quiet 屏障以及持久收据，避免为换传输重写数据一致性算法。

## 模块和创建链

```text
账户设置 → account::Runtime → notes-cyberbus → CyberBus Client
                                ├─ AuthStart/Callback/Restore/Logout → Logto
                                ├─ WatchDevices/PublicProfile → 有界账户设备目录
                                └─ SubscribeData/Send/CompleteData → 类型化字节流桥
账户 Runtime → 已认证账户 workspace/协议身份 → SyncService（账户单次方向模式）
字节流桥 → 受限 bootstrap / 同步 loopback → Noise → SyncBackend
                                                  → 持久 inbox/blob → Session/Store
```

`notes-cyberbus` 是不依赖 Tauri 的适配 crate，拥有 SDK 的唯一事件消费者、状态/设备快照和受限虚拟流。原生账户 Runtime 拥有 UI 生命周期、精确回跳、同步启用确认、SyncService 和单次操作收据。前端保留现有 IPC 主形状，并扩展有限的 CyberBus 传输/错误枚举。

## 身份与授权

CyberBus 是新账户认证的唯一 owner；不把旧 account-auth 的 access token 注入 SDK，不运行双 grant owner，不读取 JWT 内未验证字段派生归属。使用经过服务器核对的固定公共 issuer/client/resource/product/redirect/relay pins。OAuth code、授权 URL、token、seed、PSK、私钥不得进入前端状态、日志和测试回执。

新的稳定设备传输 ID 为 SDK 的 32 字节安装身份，前端以 canonical base64url 表示。旧 registry UUID 可作为设备公开业务 profile 的安装标识保持 UI 兼容，但不能代替 SDK 身份认证。同步协议 UUID 和 Noise key 仍由现有 IdentityStore 管理，发布于经过 SDK Noise 验证的有版本 Notes profile；目标操作同时固定 SDK ID、协议 UUID、Noise key，目录刷新不能重定向在途操作。

同账户 workspace 由 SDK 已验证的 `AccountSummary {issuer,subject,product_id}` 作分域 SHA-256 确定性派生 UUID；固定算法和 domain，不依赖 client ID、设备、时间、请求 Host 或 JWT 原文。同账户多 Native client 得到同一 workspace，不同账户/产品隔离。迁移首次采用新 workspace 时必须经过已有显式启用/保存合并屏障，保留原库、所有冲突与待应用内容。旧授权材料不自动导入，不删除旧资料库。

退出以 SDK 确认本地 grant 已关闭、旧网络/任务已退役为本地完成条件；云端撤销失败或未知应单独保留事实，不能阻塞已完成本地清理后的幂等退出，也不能宣称云端撤销成功。本地持久化/关闭失败仍须明确失败。旧 CyberGrid 的 `.account/grant.json` 不由新 SDK 读取或恢复；本轮不引入旧认证 owner 做在线撤销。新账户退出仅对 CyberBus 授权提供收据，旧授权的服务端撤销状态未验证，作为明确迁移限制记录，不能把新退出扩称为历史授权全部撤销。

macOS 只使用 `EncryptedFileStore`：AES-GCM 密文、本机 `0600` 密钥文件、原子替换、进程独占及完整性校验。Android 只使用系统 Keystore 保护的本地加密文件；Keystore 是平台保护机制，不是用户可选择的存储设置。设置页、状态 DTO 和 IPC 均不再暴露凭据存储选项。

旧版 macOS Keychain 项不由当前实现读取或删除。启动时若发现旧 Keychain 偏好或安装标记，先把当前绑定归档到私有会话记录，再清除活动绑定并要求重新登录；本机备忘录、附件和旧 Keychain 项保留。重新登录会验证身份，匹配原同步空间时可复用有效的同步设备身份，账户同步仍须明确重新开启。该迁移是单向的，产品不提供新建 Keychain 安装或切回 Keychain 的入口。

所有模式都须区分首次创建与 Existing。所选存储已有 marker 时，密文或密钥缺失、篡改、不匹配仍报错，不生成替代身份。内置授权窗口以额外的 15 秒等待原生呈现确认。窗口创建失败或宿主意外退出报告失败，用户关窗才报告取消。提交回跳前取消只终止本次授权；提交后取消仍等待 SDK 清理可能已写入的凭据。

## 设备目录和界面

登录即显式 NetworkStart 以发现设备，内容暂停不停止发现。业务 profile 只含 schema、设备 registry UUID、协议 UUID/Noise 公钥（启用时）、允许同步标志和有限笔记数量/更新时间摘要，不含路径、正文、附件 URL 或秘密。目录仅接受 SDK 已认证快照；处理 watch revision/reset，EOF/网络停止/租约失效立即撤销 online 和 syncAvailable。已认证历史设备按账户分区持久保存以显示离线设备；离线摘要隐藏。新安装尚未发现的离线设备不伪造为已知，跨设备离线目录补齐属于验证时必须明确核对的兼容边界。

```text
账户设置
  已登录账户                          [退出]
  本机名称                       [修改名称]
  本机设备               [同步此设备 开关]
  其他设备  在线/离线 · 笔记摘要 · 同步能力
    [推送到此设备] [从此设备拉取] [双向同步]
  本次进度 / 持久传输结果 / 待应用 / 冲突
```

沿用现有账户页面与 320px 响应式结构。目录在线、CyberBus 消息 ACK、同步持久收据、Session 应用完成分别显示。新传输显示为 CyberBus，不宣称具体直连/中转路线；SDK 当前无充分路线观测时返回 unknown/unavailable。

## 有界业务字节流

适配 crate 以自己的 Protobuf envelope / 固定 type URL 经 CyberBus Data 传递 Open、OpenAck、Chunk、Close。每条流固定 16 字节随机 ID、32 字节认证 peer ID、服务枚举 bootstrap/sync、单调序号与生命周期代际；不能传任意目标地址/端口/文件路径。只有宿主注册的两个 loopback 端点可接收远端流。每 peer/全局流数、分块大小、队列、建立与 ACK 等待均有界；取消、peer offline、账户失效、NetworkStop/Close 关闭所有流并排空任务。SDK 发送受理不视为成功，CompleteData(PROCESSED) 仅在消息被目标流有界接受后发出；真正笔记成功由既有持久收据决定。

bootstrap 只通过已认证 CyberBus 流交换 nonce、协议身份、公钥与一次 Noise 邀请；双方都核对已认证 profile 和当前账户代际，邀请不可发到目录/前端/日志。无需旧 coordinator enrollment JWT；新的 Gate 授权由当前 SDK auth/network lease、已认证 peer 与 Noise key 绑定组成，并在暂停/退出/离线立即关闭。保留 Noise 双重防护和同步层方向权限，不能因 loopback 而接受任意本机调用为同账户。

为把真实 SDK peer 传入 bootstrap handler，core 在 Bootstrap 服务 loopback 字节前写专用 native prelude（magic、peer ID、stream ID、流 generation、账户 generation、接收 core 独自产生的随机 capability）。账户读取后必须调用 core 的一次性 `claim_bootstrap_context`，该调用核对仍活跃的真实 incoming 流、peer、账户代际及本机 capability 并消费 claim；远端自选 stream/generation 不能构造本机 capability，旧上下文不得在 slot 重建后重放。退休标识的保留也必须有界，超限明确拒绝，不能静默淘汰仍可复用的安全状态。只有 claim 成功后才从当前认证 profile 取得协议 UUID/Noise 公钥并处理配对。Sync 服务不写 prelude，保持原 WebSocket wire；其准入仍受 Noise 和当前 Gate 双重验证。

单次操作同时最多一项，仍保留总绝对 deadline、进度观察及取消后 join/drain 收据。push/pull/both 同时受主动 cycle 与被动协议限制。未知结果和错误不得变成成功；连接恢复只恢复发现，不自动重放内容任务。同步关闭仍可发现/重命名设备。

## 部署与交付

Logto 主机为用户提供的 `cath-w:/home/water/work/codex-work/logto`，公开域名 `https://auth.x.aixgg.com/` 与 `https://logto.x.aixgg.com/`。优先复用已配置 CyberBus 脚本；只把公开 pins 写入配置，秘密留在服务器。部署调查报告记录实际版本、hook/scope/role/client/relay 和可执行检查路径，不导出秘密。任何必要配置更新先私有备份并保留既有非目标 resource 逻辑。

已读部署存在 `cyberbus` 测试产品，不能让正式 CyberNote 与 sample 共享产品网络。最小增量是在已有 JWT 脚本产品表追加 `cybernote`，允许现有 CyberNote Native `il4abzwbu1ohjwv5mb667`；沿用 `17897` loopback 与 `com.local.notesclone.auth://callback`。SDK resource 固定为 `https://cyberbus.x.aixgg.com/api`，scope 为 `network:join`；旧 `connect` resource 和现有 CyberBus 产品保持配置。管理 API 更新先私有备份，再白名单增量、读回核对，不轮换根密钥/epoch。真实签发与异产品隔离另行验证。公开 bootstrap 为 `tcp://43.155.169.102:11010` 和同址 UDP；当前只确认 TCP 可连，实际认证与业务待验。

源码依赖和 lockfile 固定上述 SDK commit，包含其 EasyTier 源码和许可证；构建/发布清单不能继续要求 cloudflared CyberGrid helper 或缺漏新 crate。不得依赖开发机兄弟目录才能构建。

## 任务和验证门槛

1. `cyberbus120-core`：SDK 固定依赖、受保护 store、唯一事件 owner、设备/profile 与受限 Data 流；离线生命周期、损坏/缺失/锁竞争、分片/顺序/限制/取消契约测试。
2. `cyberbus121-account`：真实账户 Runtime 与 SyncService 创建链，登录双入口、退出/恢复/暂停、设备目录和定向同步，移除生产 CyberGrid 依赖，更新 UI 和发布。
3. `cyberbus122-verification`：独立审阅、组合构建与真实 Logto/双独立资料库/多端网络验证；发现阻塞退回修复。至少验证完整中文富文本、PNG/文件原字节、离线/重启、push/pull 隔离、并发/删除、暂停/退出、异账户拒绝、失败与未知收据。

SDK 自身 `docs/UNRESOLVED.md` 明确存在多平台握手超时和网络恢复未验项。必须用本项目真实链路验证并记录失败；不能把 SDK fixture 或原 CyberGrid 历史证据算作迁移通过。完整目标须在替代功能与对应测试实际通过后完成。

2026-11-18 收敛范围：本轮先交付核心账户/设备/定向同步接线及必要命令行验证。原生 UI 验收由用户按 [手动测试用例](../verification/cyberbus120/MANUAL-UI-TESTS.md)执行；Android 真机、第三设备、异网络、完整发布源导出仍分别记录状态，不用扩大范围拖延核心交付，不提前声明完整替代目标完成。

## 2026-11-19 真实原生 UI 进展

两个独立 macOS 资料库分别生成安装身份并登录同一测试账户后，真实应用 UI 均发现两台设备并显示在线状态。A 端通过设备确认框选择“双向同步”，同步前设备目录摘要为两台各 3 条笔记。A 端新建一条包含中文、Emoji、粗体和斜体的增量笔记，并通过真实 macOS 文件选择器加入 70-byte PNG 与 262144-byte 二进制文件；确认框最终显示本次传输 `3 / 3`、`261.8 KB`，诊断状态的实际已传输字节为 `268085`。

B 端实际收到新增笔记、富文本和两个附件。数据库核对显示 A/B 的 canonical `document`、`plainText`、标题和更新时间一致；两端 `revision` 与附件 `relativePath` 不同，属于设备本地字段，不参与内容等价判断。两个附件的源文件与 A/B `.sync/blobs` 内容寻址副本 SHA-256 完全一致，两端 6 个 `sync_attachments` 描述符也逐项一致。二进制附件在本轮两个 macOS 端均记录为 `application/macbinary`，没有出现跨端 MIME 漂移；Android 的 MIME 和打开方式仍须真机验证。

同一次传输发生期间，真实应用诊断状态出现 `businessSessionsEstablished=1`、`livePeerCount=1`、`sessionsOutbound>0`、`metadataFramesReceived>0` 和 `metadataValid>0`。因此双 Mac 结果不以设备“在线”或 SDK fixture 代替，而是以新增笔记和附件实际落盘、字节哈希一致为完成条件。

Android QA 安装已安装并启动，应用状态可达 `ready`，账户存储为 `encryptedFile`，设备目录可见。进一步只读诊断发现 Mac↔Android 的 Noise 会话反复建立，但业务会话建立数为 0：远端在读取首个 metadata frame 前关闭，读取侧持续出现无帧退出。该故障使 push、pull、both、正文/附件落盘和强停恢复均不通过，不能由登录状态、设备在线、Noise 握手或双 Mac 结果代填。失败计数和待定位边界记录在 [剩余工作](../verification/cyberbus120/REMAINING.md)。
