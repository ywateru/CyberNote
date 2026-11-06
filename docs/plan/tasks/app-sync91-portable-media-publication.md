# SYNC91 跨平台同步附件原子发布

状态：done（本轮同步功能交付；具体验证范围和保留限制见[最终交付](../../verification/sync91/DELIVERY.md)）。前置SYNC90实际Android20在同一绑定Store上syncMediaPublish持续23→26，其余28分类为0、目标inbox1/note0。源码唯一对应VerifiedMedia::materialize内fs::hard_link失败。可证明操作失败，尚未证明具体OS errno、SELinux或文件系统原因。原Store/失败/安装包均保留。

修复采用现有两阶段媒体准备能力：在MediaSnapshot::verify脱离Session/SQLite gate时，将已校验blob流式复制到attachments内独占临时文件，校验原SHA/长度并flush/fsync；gate内只执行身份验证和平台原子NO_REPLACE rename，不再要求硬链接，也不允许整文件复制、哈希或普通覆盖rename。Android需兼容minAPI26，不能直接依赖API30才有的renameat2动态符号；可用已有平台常量的syscall封装。Mac使用具备不覆盖语义的renameatx_np(RENAME_EXCL)。允许最小直接libc依赖（复用锁定版本）或等价经审查的封装，不引入外部服务。

准备池必须覆盖已有head、inbox、incoming的候选媒体及keep-all在事务内生成的新附件ID；不能只准备当前目标路径。每个独立最终路径消耗自己的完整已校验临时文件，禁止多个可变附件路径共享inode。重复blob按候选出现次数生成有界池，流式常量内存；在现有实体/媒体总量限制内核算额外分配，不允许无限临时副本。缺失blob仍按原协议等待，不强行应用。已有正确目标文件复用，内容/身份不符、符号链接、路径竞争、已有目标均拒绝，不覆盖、不吞原错误或绕过权限/计划门槛。

临时文件由明确的拥有者管理，失败/abort/未消耗项清理；crash遗留不得被当成已发布附件，恢复只处理明确受管命名和身份，不删除其他文件。rename后重读目标文件/目录身份，更新仅属于该临时文件的proof；保留原blob和已发布附件的独立身份。SQLite失败可留受管且内容正确的未引用附件供重试，不能产生数据库中指向不完整文件的行。原head版本、授权、participant、plan generation、blob SHA和最终receipt保持。

开发先更新媒体模块契约并实现最小必要文件、平台封装和受影响真实测试。测试覆盖大文件准备不持Session gate、普通远端PNG/WAV字节与独立路径、keep-all克隆、目标竞争/符号链接/篡改/重复调用、失败与abort清理、原安全屏障和错误传播。可用窄OS边界Fake模拟hardlink不可用来防回归，但最终必须以准确Android21同userdata实测那条原待应用笔记及媒体，不以宿主检查替代。

不同代理源码独审后主线合入，准确Android21优先构建/核包、同Store真实复验；再完成Mac29及相同最终产品的受影响DOM/路由/包一致性验证。原immutable11先保留用于同绑定Store原反例，不因修复而换Store或重新配对。最终双向正文、媒体原字节、provider/导出/重启门槛保持，完整目标未完成。

2026-11-07阶段：产品主线3963c3df、作者证据b373ac95、独审c7d0eaa8已接收。Android21准确322输入构建与独立核包通过，root收据已签发；同5584原userdata升级后，原缺失目标完整document/plainText自动应用，真实commits1/applyError0/syncMediaPublish0，inbox1→0、targetNotes0→1，未重置Store或配对。新一轮双方完整正文也已通过。desktopMedia原动作27.835秒返回通用失败；随后实际Android只读核对已有PNG70B/WAV32044B与原SHA一致，仍待具体可见解码阶段、独审和最终导出/重启/冷启动收据。

当前91宿主实际双App39项自然0；最终当前源码公网路线首轮在反向WAV附件元数据25秒等待超时，原失败保留，不能以LAN或旧版本路线通过追认为本轮通过。将使用同一脚本/相同预算在新隧道做窄复验；准确Mac29构建与剩余原生验收并行。完整目标仍active。

最终收口：Mac29/Android21相同322产品输入已独审，实际原生双向完整文档/五份原文件、严格同userdata冷启动、自动前台恢复、系统原图导出和最终画廊均已接收。当前源码双App39和LAN/匿名wss定向39通过；原超时和最终Blob读回限制保留，未声称全部媒体脚本、真实VPN、实体硬件或原版像素通过。两项额外测试修正均独审，不改变产品输入；生命周期自然结束，所有owned进程已关闭，无后续设备操作。[最终交付](../../verification/sync91/DELIVERY.md)。
