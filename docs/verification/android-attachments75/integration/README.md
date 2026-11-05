# Android附件75主线整合

2026-11-06。产品及独审证据合入后，在主工作树`task/app-001`、HEAD `eccba2dd2a929ff4890604cdd734d61619b1ae0f`串行执行所有下列命令，无产品修改。完整命令、自然exit、外部计时和源码身份见[result.json](result.json)。每条wall均含该命令全部清理至自然退出，不能与summary内计时混同。

| 命令范围 | 最终结果 | wall秒 |
| --- | --- | ---: |
| frontend-build | exit 0 | 3.662 |
| production | exit 0 | 1.099 |
| desktop | exit 0 | 47.115 |
| mobile-recording | exit 0 | 10.375 |
| mobile-notes | exit 0 | 5.141 |
| mobile-attachments | exit 0 | 18.885 |
| protocol | exit 0 | 6.101 |
| rust-build | exit 0 | 3.055 |
| real-rust | exit 0 | 4.68 |

桌面100、手机录音43、手机笔记9、新手机附件43均PASS；协议负例18与当前Rust手机持久化/新进程恢复21 PASS；构建及生产API/URL/bundle排除通过。所有浏览器pageErrors为空，前后87输入指纹同为`7988ded2a1060c244993aa70415e5c3a59b8df8d950ec99ee7fb34704e37ff8e`，gitDirty=false，精确等最终独审输入。根串行桌面本次首次通过，没有抹掉独审首次100ms断言失败；其原因仍unknown、保留在独审报告。

当前Rust从主线24个递归源码/构建输入重新显式locked/offline构建，二进制与registry实际文件聚合身份见[rust-build/build.json](rust-build/build.json)。82包checksum侧文件缺失仍明确记录missing/null，未将其称为外部完整性校验通过。PNG/TXT使用真实App/hidden input/FileReader/Session方法与Store字节、真实正文ACK；同一fresh目录两个不同进程/Session恢复原引用与SHA，原operation不可被新Session收养、旧Token拒绝。正常owned进程退出后才重开，协议故障明确拒绝、不fallback。精确检查和退出状态见[real-rust/result.json](real-rust/result.json)。

本轮源码修复与受控链整合完成，父附件功能及Android原生现场故障/系统chooser/URI/WebView/IME和整体原版像素目标仍开放。PDF仅文件卡，未实现或验收原版PDF预览。不触原Android约13秒未保存录音、不构建安装APK、不使用真实麦克风或用户库。

下一优先为[独立Android原生76](../../../plan/tasks/app-android-attachments-native76.md)：准确新APK、全新AVD和显式新serial，保留原设备。桌面真实Rust录音74复用本次设施但录音场景尚未执行。

原始/root运行目录暂保留本机`/private/tmp/notes-attachments75-root-p9nikfpv`以便复核，紧凑结果/原始命令日志已归档，未复制整个harness、Cargo缓存或合成数据库。可重用Cargo缓存保留；只清理本轮明确owned开发中间件与已合入工作树。

本轮收尾已移除两个已合入开发/独审工作树及分支、9个mobile开发运行目录、3个真实Rust开发目录、2个旧harness目录。精确清单见[cleanup.json](cleanup.json)。主node_modules/dist、可复用Cargo缓存与正式原始输出保留。清理前无匹配当前Rust transport进程；未操作原Android或任何用户媒体。
