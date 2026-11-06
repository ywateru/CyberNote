# 同步最终主线完整整合

状态 **PASS-MAIN-PRODUCT**。生产合入 `9cbbb150dfebf1f5fb4afcae454b5133b6ded220`，后端准确产品 `cd334bc8`、独审 `0feb310d`。执行期间仅恢复文档提交4b370ed3，不改产品或测试输入。

| 检查 | 结果 | 完整外层秒 |
|---|---|---|
| build | 自然0 | 8.607 |
| production | 自然0 | 9.236 |
| desktop | 自然0，464项 | 123.338 |
| mobile-notes | 自然0，9项 | 14.191 |
| mobile-recording | 自然0，43项 | 20.503 |
| store | 自然0，159通过/3原subprocess worker忽略 | 199.463 |
| network | 自然0，23项（lib12+integration11） | 45.751 |
| mobile-attachments | 自然0，290项 | 106.513 |
| tauri-check | 自然0 | 69.848 |
| mobile-sync-settings | 自然0，56项 | 46.699 |

前端各命令串行；Rust Store→network→Tauri串行；两条序列并行。计时包含真实子进程结束与清理，不以CLI内部elapsed替代。源码清单与hash前后完全相同，见source-before/after.json和result.json。完整原始日志、DOM/HTML/布局/截图在各组目录；输出仅在/private/tmp生成，runtime关闭后复制，避免Vite watcher干扰。

手机attachments组合含数据管理、图片预览、空间总览、设置和快速画廊。桌面覆盖完整16组，手机笔记/录音/附件/同步设置分别记录。默认IPC为明确隔离fixture，真实App/Tiptap/合成媒体；Rust组另使用实际Store/Session/socket及真实磁盘。两个证据范围不能拼接为Android或双App通过，实际双App/路由和最终APK另验。

完整Store包含实际64MiB前台响应测量、最新locked resolve、stale重试和现有归档/附件/锁定回归。保留已有编译dead-code/chunk-size warnings，所有命令自然exit0。原Android现场和真实麦克风未操作，完整同步目标仍待真实DOM、准确包及新隔离Android验收。
