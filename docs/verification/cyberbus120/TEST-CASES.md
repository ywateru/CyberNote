# CyberBus 替代同步验收矩阵

当前仅定义用例，未执行结果不填通过。准确源码、服务公开 pins、工具链、命令、自然退出状态和证据路径随执行记录。使用新建隔离资料库，不改用户原笔记，不用历史 CyberGrid 测试替代。

| 编号 | 场景 | 必须观察的结果 | 验证层 |
| --- | --- | --- | --- |
| AUTH-01 | 同账户两个安装分别通过真实 Logto 登录 | SDK 验证账户一致、安装 ID 不同、workspace 一致 | 真实授权/SDK |
| AUTH-02 | 取消、错 state、迟到 callback | 原事务终止；不能提交到下一代 owner | 原生/SDK |
| AUTH-03 | 关闭并重开安装 | 本地加密文件（macOS）/ Keystore 保护的本地文件（Android）恢复、设备 ID 不变、暂停意图保持；旧 Keychain 不被读取或删除 | 持久存储/原生 |
| AUTH-04 | 退出或切换账户 | 旧网、流与在途写退役；本地全文/附件保持；另一账户默认暂停 | 真实原生/Store |
| AUTH-05 | 不同账户/产品 | 设备不互见，不能借 profile/loopback 伪造内容授权 | 真实网络与负例 |
| STORE-01 | vault 被修改、丢失、密钥错误、重复 owner | 明确失败；不创建新身份，不泄露 plaintext/密钥 | 存储 |
| DEVICE-01 | 登录但内容暂停 | 能发现并显示设备，syncAvailable=false，无内容传输 | SDK/账户 |
| DEVICE-02 | 改名、远端下线/重启、watch reset | 名称更新；离线条目保留且隐藏旧摘要；恢复同安装身份 | SDK/账户 |
| DEVICE-03 | 摘要 | 普通未删除笔记数量正确，上锁计入，回收站不计；空库无更新时间 | Store/界面 |
| BRIDGE-01 | 两种受限服务，多次分块/EOF | 真实 Data ACK 与字节完整，顺序正确，拒绝任意地址/服务 | CyberBus Data |
| BRIDGE-02 | 队列满、重复/乱序、错误 peer、取消、事件 EOF | 有界失败及所有资源回收，不能误标业务成功 | 边界/SDK |
| SYNC-01 | A 新建完整中文富文本与 PNG/文件，push 到 B | B 完整 document/plainText/附件 metadata 和 SHA256 原字节一致；B 独有内容不回传 | 真实 SDK→SyncService→Store |
| SYNC-02 | B 修改并 pull 到 A | A 获得 B 版本，A 独有内容不上传 | 同上 |
| SYNC-03 | both 与第三设备转发 | 各端同实体版本与附件收敛，不重复实体 | 多安装网络 |
| SYNC-04 | 离线修改与重启再同步 | dirty/inbox 保持、设备与协议身份稳定、完整内容补齐 | 持久化/网络 |
| SYNC-05 | 同实体并发含附件/上锁版本 | 冲突两分支完整可恢复；不按时钟丢弃版本，不泄露 sealed 正文 | Store/Session |
| SYNC-06 | 删除对编辑、恢复对旧删除、purge 对旧设备 | 墓碑/因果规则保持，无旧版本意外复活 | Store/网络 |
| SYNC-07 | 暂停、退出、deadline、连接中断 | 完成/失败在 join/drain 后发；未知结果不变成功；不自动重放单次内容任务 | 原生/网络 |
| SYNC-08 | 初次从旧账户 workspace 切换 | 显式确认合并；全文、附件、已有冲突、待应用数据保持；旧连接隔离 | Store/Session |
| SESSION-01 | 编辑/IME/附件/录音期间接收 | quiet 屏障保护活跃实体；焦点/Undo/授权及其他窗口不漂移 | 原生应用 |
| BUILD-01 | Mac release/debug 与 sync-e2e feature | 新 SDK 构建完整，生产无 CyberGrid SDK/provider 依赖 | 构建 |
| BUILD-02 | Android arm64 | Keystore/JNI、EasyTier、Protobuf 编译与准确包资源核对 | 构建/设备 |
| NETWORK-01 | LAN 与异网络/移动网 | 记录实际发现、认证、正文/附件持久收据；不以 relay 端口可达代替 | 多端实测 |

验收报告分清模块、生产创建链、实际登录、原生界面和移动网范围。SDK 已知握手/恢复问题如在本项目复现，保留首错并修复后另记复测；不能靠放宽身份、ACK 或数据持久化门槛消除失败。
