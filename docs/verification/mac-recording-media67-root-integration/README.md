# 录音持久卡读取恢复67根整合

2026-11-05。SOURCE-INTEGRATED / PACKAGE-PENDING / RUNTIME-OPEN。

产品7243c649→root496707b7，仅use-attachment-media.ts；作者证据7309ab1c→393975a4；独审证据f8735bb5→608d13ab。root产品目录src/src-tauri/plugins与7243逐字一致，git diff --exit-code返回0。根检查基点393975a4，typecheck0（4.007秒）、build0（7.574秒），原始日志与checks.json保留，现有大chunk提示未修改。

独审[正式报告](../../plan/reviews/app-mac-recording-media67.md)候选30组PASS（hook/实际bridge/StrictMode/共享媒体27，新read后端锁定撤权2，实际App final1），精确旧hook同链1组复现预期缺陷；作者25+2通过。恢复旧读取只使用typed MetadataStale，最多三次总读，每次完整校验；其它错误/身份失效不透明重试，无额外store/save/revision/ACK。271产品输入与作者准确源一致。

受控IPC、native响应屏障、合成媒体及后端事件边界不代表实际Mac20/麦克风/像素通过。Mac19 C首次真实失败、E/F有限成功与旧18内存现场状态分别保持历史身份。下一步按准确最终root冻结Mac20完整输入及独立核包，再用Computer Use验首显与保存；Android不操作，实际音频不导出。
