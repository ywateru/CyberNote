# Android 独立实际有限验证：3edc4ad0

2026-11-04 00:36–00:40 Asia/Shanghai。精确包301366970B / SHA256 `3edc4ad07524f630d694c0695cbde34bc4a02aa3c36f1fba0bd44a8de80574bf`，冻结源f4d3a027，216输入aggregate `a6b191546c39f2bf1c431e7547228a2714f79e355376a686380c89efd2299939`。完整报告 `docs/plan/reviews/unified-f4d3a02-android-independent-01.md`。

本轮 PASS：安装包身份；原429547B Opus/WebM两次字节hash；解析后初始1:06/time0paused；原生Play0.513487→Pause1.45205且暂停稳定；真实媒体/纸张往返归属；Beta39..43、格式关闭与纸张Cancel/reopen/Back的完整doc/selection/key及实际Editor/View/DOM身份保持；全部过滤测试对象最终与基线严格相等，revision30/58未变。

已知阻塞：移动.audio-expand隐藏，实际range缺失。开发原生双击展开失败证据已重hash核对，本轮只读确认hidden，不重复该失败。range/±15/边界未测，不通过。主HTML audio duration仍Infinity；有限显示与平台metadata分别记录。初始观察在解析完成后，不声称之前所有事件；errornull仅采样，无声音/首次权限/新录音/完整ended/Store前端/iOS/Mac/pixel验收。

动作全部原生adb input，CDP仅只读观察和真实对象身份比较；没有observer、API wrapper、DOM点击、编辑器/React/store写入。安装包和managed媒体来自真实设备读回；保留original-managed-audio.webm。源输入、开发22+48文件manifest均独立全量重hash匹配。初次本机manifest解析器格式假设错误和修正如实写入31-source-evidence-rehash.json，未影响设备。

清理：已释放自有handles/socket并移除9227，最终无forward。模拟器PID3197/session73263保持，不重启/清数据/重置权限/打开hostmic；app9355。最后paper note1a0718dd… grid-large，菜单/IME关闭、当前无音频、媒体最后暂停。最终纸张重开selection回正常起点。设备已正式归还root。

文件序号表示实际观察顺序；所有JSON/PNG、原始action log、审查脚本、result与不含自身的manifest保全。此目录状态仅为独立有限功能通过，不能替代移动展开修复和整体像素验收。
