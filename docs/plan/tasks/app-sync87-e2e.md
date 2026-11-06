# APP-SYNC87 双端、路由与准确包验收

状态 in-progress：84/85/86源码独审、主线完整整合、实际双App DOM、LAN与匿名wss以及Mac28/Android18独立核包均已完成；新隔离Android实际配对/完整上行已独审通过，反向完整笔记未收敛，仍在同一绑定Store上定位。准确来源和恢复入口见[交付状态](../sync-delivery-state.md)。目标是最终完整双向同步交付，不以文档/UI/某个普通笔记slice代替。根协调，不操作原Android未保存录音现场。

## 生产路径

两个独立Rust进程/临时SQLite通过实际生产84+85+86网络，任一端创建/修改/目录/附件/locked/删除恢复最终到另一端；第三peer转发及离线重启。headless仅stdin控制，不暴露网络debug；失败代理只干预帧/连接。保全实际PID、端点、commit、文件hash、自然退出、SIGKILL准确栅栏，不重建目录掩盖恢复问题。

继续[86 adapter](app-sync86-adapter.md)矩阵：因果冲突、墓碑、100次重放、乱序、丢ACK、blob中断/先后、篡改/撤销/预算；真实App两页面各接独立Rust后端补pending/实际PM组字/录音owner与无关epoch变更，浏览器fixture不算真实Store。锁明文、媒体完整性是阻塞门槛。

## 网络路线

至少localhost独立进程和本机局域网地址连接实测，不能把127.0.0.1截图称两台硬件。已安装cloudflared可开启仅本轮合成临时Store的Quick Tunnel，记录进程PID/临时wss地址/真实双向传输/错误密钥拒绝/停止清理；不公开真实App root、不需要云账号、不把邀请secret写日志。QuickTunnel hostname变化必须可更新endpoint或新邀请重连，密钥身份不会因URL变化漂移。官方当前来源见research/sync84，不用邮箱浏览器认证给非交互客户端。

WireGuard/EasyTier由系统网络提供IP，应用使用相同ws/wss端点。实际已具备可安全隔离测试的虚拟网时验证真实路线；没有现成组网时明确记录未验证部分与操作说明，不能把模拟路由当真实VPN通过，亦不为测试修改用户现有VPN/路由。网络路线能力、实测和前置条件分别报告，不无限扩展为内嵌VPN产品。

## 新隔离Android

沿用[原生76隔离契约](app-android-attachments-native76.md)：全新AVD名/独立ANDROID_AVD_HOME和data目录、只读复用已缓存API30 ARM64镜像、cold/no-snapshot/no-audio。禁止复制旧AVD/userdata/snapshot；禁止默认ADB serial、kill-server或访问旧emulator-5580/其他原设备。每次ADB/CDP明确新serial与新WebView身份，清理只owned资源。磁盘不足先回收本轮可重建中间物，保留旧现场和共享SDK/Cargo缓存，不擅删用户数据。

安装准确新debug APK（新增同步构建编号，不把旧16包追认为含同步）；通过实际手机HTML/控件操作粘贴邀请、连接桌面临时服务；手机＋新建→输入→保存→桌面可见；桌面编辑→手机回前台可见；Android进后台/回前台重连、该新设备冷启原目录保持；至少图片和合成音频分别在两端可读取/导出原字节，未授真实麦克风。活动编辑/录音保护用开发合成媒体，生产无debug后门。系统选图新增合成PNG/TXT可一并验证附件实际chooser与取消/再选/重开，避免只用DOM赋值当原生provider验收。

AndroidAPI30只证明Android11模拟器；原始苹果整窗像素、其他Android版本/硬件及OS杀后台常驻同步边界不外推。应用前台恢复自动同步是本版承诺，系统强杀后不承诺常驻service。

## 根整合与交付

源码冻结后根一次build/production排除/受影响桌面与手机notes-recording-attachments-preferences-quickhome-sync分组＋真实Rust模块。失败保全，精确修复相关边界后恢复，不重复无关全套。准确Mac27/Android构建17打包（若其他已占号则递增，不覆盖旧包），审计构建前后tracked产品输入、包内JS/CSS/native及签名；ad-hoc/未公证/debug性质明确。APK未安装前不声称设备通过，实际安装只新AVD。保留安装包、紧凑HTML/截图/日志/摘要，清本轮无用工作树/targets/AVD（完成且数据为合成之后），不清共享target/node_modules或历史现场。

完成条件：任一端录入的所有受支持实体/独立媒体通过实际生产网络在已配对端收敛；离线/冲突/删除/恢复/锁定与崩溃无静默数据丢失；设置实际可用；原设备约13秒录音现场完全未动；准确新包可交付。完整目标达到后根才能update_goal complete，未完成继续active。
