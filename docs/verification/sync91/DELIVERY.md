# Mac29 / Android21 同步交付与验收范围

2026-11-07。原生反向同步故障已修复：Android在同一数据与配对中自动应用原先滞留的桌面笔记，新的双向完整文档和原媒体保持一致。数据仍保存在各设备本地；图片、录音通过独立附件文件保存，数据库保存元数据和文档引用。同步服务由用户显式开启，不依赖iCloud。

## 准确产物

| 安装包 | 字节 | SHA256 |
| --- | ---: | --- |
| [备忘录-Mac29.zip](../../../artifacts/sync91/备忘录-Mac29.zip) | 6720140 | `a8896b23d08a2a30832780ef50b97c964d9310fa4a85e47d34226a1cb82227fd` |
| [备忘录-Android21.apk](../../../artifacts/sync91/备忘录-Android21.apk) | 238738727 | `e9e1142e9d24a13b533767173c236d1d10841d62d9709aec69e652cf0c9eb60a` |

两端322项产品输入均等于批准主线b373ac95，完整嵌入前端相同。独立核包、root完整APK/ELF/ZIP/executable摘要及最终[产品输入复核](final-product-input-check.json)一致。Mac为本地ad-hoc签名、未公证；Android为arm64/API26+、开发签名/debuggable。产物标签不改写应用内0.1.0版本号。[准确构建及独审](native-independent/README.md)保留原始Mac签名失败与派生临时签名的严格验证。

## 修复与验收

原Android20反复出现syncMediaPublish，唯一源码生产点为硬链接发布附件。SYNC91改成锁外准备独立、已校验的暂存文件，锁内不可覆盖的原子重命名；保留原有授权、计划、事务和回执门槛。Android不依赖API30才提供的renameat2动态符号。实际失败的OS errno未被捕获，不推断SELinux或文件系统根因。

| 范围 | 已证实的结果 | 证据 |
| --- | --- | --- |
| 文件与事务 | 真实文件9、Session12、冲突解决5；64MiB新ID附件并发测试成功，前台最长等待约10.6ms。不是所有大文件吞吐保证 | [作者](media-publication-author/README.md)、[独审](media-publication-independent/RESULT.md) |
| 当前实际两App | 真实React/Tiptap、独立Rust/SQLite/Noise，39项含冲突、媒体、录音归属和原目录重启，退出自然0 | [整合](final-integration/README.md)、[独审](final-host-independent/README.md) |
| 当前LAN/公网 | LAN双向文字/PNG/WAV通过；新匿名wss定向39项通过，含原字节导出、错误PSK拒绝、换址新邀请、原目录重启 | [路线原始记录](final-integration/README.md)、[独审](final-host-independent/routes02-result.json) |
| Android原反例 | 原同一配对Store、同userdata升级21；目标inbox1→0、笔记0→1、commits1、所有29类apply错误0；未重置或重新配对 | [实际记录](../sync91-native/native-original-target-and-network22/README.md)、[独审](../sync91-native/native22-independent/result.json) |
| Android双向正文/媒体 | 原目标与新笔记完整document/plainText一致；TXT/PNG/WAV实际系统选取保存；两端五份受管原文件长度/SHA一致 | [实际原文件](../sync90-native/native-provider21-originals/README.md)、[完整双向记录](../sync91-native/native-original-target-and-network22/README.md) |
| Android恢复 | 新bootUUID/模拟器进程、同userdata dev/inode/size；两个完整文档、五份附件元数据与原SHA不变。前台恢复自动收敛、无手动同步，双方完整正文及五份原文件再次一致 | [冷启独审](../sync91-native/cold23-independent/result.json)、[前台独审](../sync91-native/foreground24-independent/result.json) |
| Android图片导出 | 真实预览→信息→保存→系统目录→应用保存回执，导出PNG70字节与原件逐字节相同。请求目录2、实际选取已准备空目录1的事实保留 | [原始记录](../sync91-native/native-export24-and-home/README.md)、[独审](../sync91-native/export24-independent/result.json) |
| Android首页 | 实际Android21双列画廊、四个合成测试卡片、黄色56px添加按钮；此前新建与系统输入法焦点也有实际记录 | [首页截图](../sync91-native/native-export24-and-home/home-visible-final.png) |

## 原始失败与测试限制

首轮当前版本公网反向WAV元数据25秒等待超时保留为失败；相同源码、脚本、预算在新隧道完成定向复验。没有把复验追记到原失败运行。新隧道第一进程需要宽限后的SIGKILL、第二进程自然退出，记录保持。

原desktopMedia自动动作返回通用失败仍保留。验收工具随后修正了预期空段落的DOM比较，并将打开笔记的等待收紧为精确owner；后者是测试改进，未被指认为某次实际失败原因。最终原生媒体观察中，桌面PNG完整显示/源字节门槛返回true；WAV已通过精确owner、正文、可见卡片/控件、标题及1秒解码元数据检查，readyState4且currentSrc===src。脚本fetch该Blob失败，缓存源字节读取不可用；CSP解释仅为推断，未证实具体原因。实际原文件SHA已由原生read_attachment及对端受管文件独立确认。没有宣称四个媒体完整脚本门槛全部通过，亦不将该读取限制记为已证实的产品播放故障。[完整观察与原始失败](../sync91-native/native-media-diagnostics25/README.md)。

LAN与匿名wss路线运行在同一台Mac的独立进程；Android实际验收使用隔离API30 ARM64模拟器，不外推所有实体手机、后台常驻网络、硬件麦克风或原版Notes全窗口像素。WireGuard/EasyTier复用已建立的可达虚拟网ws/wss地址；本次没有受控可达VPN对端，未实测该具体路线，不修改用户VPN或路由。

## 使用与资源保全

按[设备同步使用说明](../../sync-usage.md)，在Mac设置→数据→设备同步开启服务，填写手机能访问的地址并生成配对串；Android同入口加入。局域网填写Mac的LAN地址；匿名隧道或虚拟网填写相应可达地址。隧道地址变化时生成新邀请并“更新连接”，保留原设备和本地笔记。

最终所有owned原生测试进程及监听已关闭，[清理收据](../sync91-native/native-media-diagnostics25/cycle25-final-owned-cleanup.json)保留。原Android/旧AVD及约13秒未保存录音完全未操作。命名交付包、原配对Store、原生userdata与原始失败均保留。新清理仅删除与保留安装包逐字节相同的两份编译中间副本，共476117582字节，见[清理09](duplicate-build-intermediate-cleanup09.json)。
