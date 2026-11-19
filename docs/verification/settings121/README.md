# Settings121 验证记录

日期：2026-11-19。状态：源码和隔离运行验证完成；真实外部服务与设备边界待验。

设计入口：[设置重构契约](../../architecture/settings121.md)。任务：[实施计划](../../plan/settings121.md)。保留历史CyberBus验收范围，不将云存储测试外推为设备同步验收。

| 边界 | 必须证明的行为 | 当前证据 |
| --- | --- | --- |
| AGENTS | 文件保留本项目工程规范，不包含参考项目名称或链接 | 独立审查pass；全文无相关名称/URL |
| 桌面结构 | 左栏原尺寸/样式；无设备同步条目；右侧面包屑/查找/分隔列表 | 真实React、实际App桌面/手机fixture pass |
| 视觉 | 参考的浅暗tokens、圆角、行高、分段/文字操作；无旧大标题表单 | 独立复审及48组菜单布局、浅暗/窄屏截图pass |
| 可达性 | Tab/Shift-Tab约束、内层Escape、手机返回、关闭恢复入口焦点 | 独立负例pass；程序化焦点跨兄弟层仍有P3边界 |
| 原功能 | 主题/字号/notes/Agent/存储/Apple导入继续接实际handler | 实际App fixture与账户82项边界回归pass |
| 账户 | CyberBus登录/退出/许可/设备动作守卫和单错误面不回退 | 账户边界回归pass；真实CyberBus三端未在本轮重验 |
| 冲突 | 入口迁到账户内，查询/选择/解决保留，旧配对界面不复活 | 实际App callback→query→确认→resolve→Back pass |
| WebDAV | 认证、读写、目录、ETag条件、404/401/网络区别 | 本地HTTP fixture pass |
| S3 | SigV4路径/查询/编码、endpoint/region、临时凭据、条件写入 | AWS向量、固定签名与HTTP fixture pass |
| GitHub | repo/branch/prefix、Contents API、blob SHA、并发拒绝/限制 | 本地API/大文件raw/CAS fixture pass |
| 云端密文 | 随机盐/nonce、错误密码/篡改零写入、秘密不出status/日志 | 加密与秘密不回传回归pass |
| 内容同步 | 稳定ID、双端独有内容、同项修改/冲突、墓碑及附件原字节 | 真实Store跨不同workspace、媒体与冲突回归pass |
| 首次/恢复 | 显式预览确认、保存屏障、当前内容保护、失败可恢复 | 全窗quiet、不可变归档、录音阻断与committed receipt pass |
| 本地备份 | 默认关闭、间隔/保留、原子manifest、目录、版本/恢复 | 16项运行时测试与React fixture pass |
| 调度 | 应用运行/有效权限/无录音；不重复启动；退出清理 | 宿主定向测试pass；真实长期驻留未验 |
| 导入导出 | 原生文件选择、取消/密码错误/坏文件/内容附件往返 | 实际App adapter与Store/加密回归pass |
| 检查更新 | stable/preview/daily语义、平台架构、无发布/网络/错误区分 | 30项更新器、身份与React测试pass |
| 下载更新 | 有界进度、SHA256/身份、坏包拒绝、重试、失败清理 | 实际解压/CRC/包fixture pass |
| 安装更新 | 用户确认、保存/录音退出守卫、系统签名限制及回滚 | 假bundle/活进程/lease测试pass；真实安装替换未执行 |
| 移动/窄屏 | 390px/极大字号/浅暗无横向溢出；44px触达 | Chrome/Android UA fixture pass；真实WebView未验 |
| 组合 | 版本一致性、typecheck/build、命令注册、文档/产品输入 | typecheck/version/build/Rust check/native dev build pass |

本轮不使用用户真实云端凭据、笔记库或正在运行安装包进行破坏性测试。真实WebDAV/S3/GitHub服务、系统安装器及手机功能如未运行，在交付中明确列为未验收；本地fixture不代替这些证据。

## 本轮命令证据

- `pnpm typecheck`、`pnpm version:check`、`pnpm build`、`git diff --check` 通过；生产前端构建2009 modules。
- 宿主定向测试9/9、本地备份16/16、云端23/23、更新器29/29通过；另有恢复活动录音阻断和不可变归档两项独立负例通过。
- 最终只读复核确认恢复的两项原始 P1 已关闭；其新增失败路径回归还证明云端最终应用错误会释放保存冻结并可重新建立 barrier。复核最终结论为 pass，宿主定向测试为10/10。
- 实际App 1280px桌面与390px手机fixture通过；覆盖云端预览/确认与外观投影、账户冲突resolve、备份/加密导入、更新入口、ready ack、访问代次清理和committed warning。
- 设置、云、备份、更新React/Chrome回归通过；浅暗、320/390/520px、44px触达、菜单键盘与单错误面通过。
- `cargo check --lib` 和完整 `cargo build` 通过，使用真实sidecar；Rust仍有既存/未使用警告，无编译或链接错误。

未运行：真实WebDAV/S3/GitHub账户、CyberBus Android/Mac三端传输、macOS已安装包替换、Android unsigned APK系统安装、WebKit（本机Playwright WebKit缺失）、Android WebView/实体设备、真实IME/麦克风/文件选择器。Chrome/Android UA和本地HTTP/临时Store证据不外推为这些验收。
