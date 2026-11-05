# Mac截图修正77主线整合

2026-11-06，主线合入 `c0b368aeb2de5b55b5aba70ea1c998b52483a173` 后串行运行六条命令，均自然退出0。完整wall计时包括子进程清理；[机器记录](result.json)和原始日志已归档。

| 范围 | 检查数 | wall秒 |
| --- | ---: | ---: |
| build | — | 3.136 |
| production | — | 0.96 |
| desktop | 148 | 48.334 |
| mobile-notes | 9 | 3.844 |
| mobile-recording | 43 | 9.694 |
| mobile-attachments | 43 | 17.635 |

89个产品/调试输入前后指纹相同：`b4d046b7945f3d1422ffe095fd04cc67671f7e5989ebb194293fb90dc521182a`，gitDirty=false，所有浏览器pageErrors为空。桌面全十组148项包含47项本次界面检查和45项contract检查；手机笔记9/录音43/附件43。

新入口：`pnpm debug group mac-feedback --out FRESH_DIR`。使用真实App handler、DOM鼠标事件、HTML/字符Range/几何与PNG；默认后端仍是隔离JS协议fixture，不外推原生WKWebView、Rust存储、系统选择器或整窗像素通过。原版截图、旧失败与初审blocking保留，详见独立复审。

完整原始输出保留在本机 `/private/tmp/notes-mac77-root-ho70o6fm`。本次不操作原Android约13秒未保存录音现场；安卓原生76继续ready。新的Mac本地应用构建与签名身份将另记[本地构建](../native-build/README.md)。

收尾已清理本轮已合入worktree与分支，详见[cleanup.json](cleanup.json)。主node_modules、可复用release缓存、新旧应用包与正式证据保留。

Mac22本地构建与独立核包已完成：内嵌资源确认属于本次源码/前端，派生完整本地签名与ZIP检查通过；详情见相邻native-build与native-independent目录。没有由核包替代原生界面运行和全像素验收。
