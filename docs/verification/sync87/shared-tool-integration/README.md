# 主线共享工具窄整合与调用恢复

2026-11-06。基线 `81524d5a`，最终共享文件已合入，后续native工具合入前执行。只对依赖受影响的默认notes fixture与实际LAN做窄检查，未重复主线464/290/Store等完整套件。

- 默认笔记fixture **9项自然0，外层9.478750833秒**。实际命令、输入147项前后相同和完整stdout见 `result.json` / `notes.stdout.log`。
- 首次LAN **启动前exit1，0.024104167秒**：root传入 `/private/tmp/sync87-main-shared-tool-integration/lan`，不符合脚本要求的全新 `/private/tmp/sync87-routes-*`。stderr原件保留。原聚合 `result.json` 状态保持 **failed**。
- 仅修正调用输出路径为 `/private/tmp/sync87-routes-main-final11`，无工具或产品修改。恢复实际LAN **21项自然0，外层12.710163542秒**，见 `lan-recovery.execution.json` / `lan-recovery.result.json`。真实双向正文、PNG/WAV读回与原字节导出、同目录客户端重启；3个Rust进程自然code0/signal null，pending0，无异步quiet错误。binary、55项源指纹和harness前后相同。

使用已审immutable11，SHA256 `333fcd44e19ebbd30ece11b7a595816249a9458a46fb03523855ae8c51215800`。没有ADB、设备、真实mic、用户库或公网复测。这份恢复证据不把第一调用改记通过；其余源码/双App/网络/包身份由各自准确证据覆盖。

归档仅驱动、日志和安全JSON，没有SQLite、身份凭据或邀请。合成临时Store原位保留供需要时复核。
