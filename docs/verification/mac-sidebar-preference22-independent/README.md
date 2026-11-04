# Mac侧栏显隐偏好22 独立审查

状态：**PASS / STOP**。正式报告为 `docs/plan/reviews/app-mac-sidebar-preference22.md`。候选由root固定为 `6b02fd9d30139ffee63226bb057e9a54bc913e4f`，未读取Git对象；实际三项产品SHA记录于protected-inputs/result。

作者73项证据与114项受保护输入初末字节身份校验通过。只读复用Rust工具前已按manifest核验SHA `19624791900fc9ae10bb5d174749949809856e9fec45d27399d655e3b62a21d0`，未写其target或共享cache。

- `check-app-independent.mjs` 是读过且核SHA的作者真实App/bridge/生产Rust transport fixture派生版；`additional-cases.mjs` 为5个追加集成场景。仅低层invoke交付形状和只读observer受控，未改业务组件。一次 `replay-attempt01` 通过32场景，包括作者27与独立5。
- `replay-attempt01-command.json`、该目录result/rust-rpc/worker-processes及合成SQLite保存原始结果；162RPC、34worker均正常结束，无浏览器错误或外部请求。所有库仅本任务合成数据。
- `check-delivery-independent.mjs` 只把作者端口检查输出位置改到本目录；4场景通过，是App集成的补充。
- `independent-audit.json` 保存47项证据检查与37处单键boolean patch观察，包括保留正文flush/OCR/录音代码及关闭顺序。没有实际媒体活动或导出。
- `typecheck.json` 为本轮一次typecheck exit0；没有编译平台包或再次编译Rust。
- `independent-App.tsx.diff`、`independent-types.ts.diff` 为独立从封存基线生成的差异；protected-inputs/input-identity-final保存初末身份。
- 作者第一次fixture失败仍留在原目录，作为受保护输入没有改写。本轮重放和端口检查均一次通过。

仅通过源码、实际生产App与未改bridge接入到隔离Rust Session/Store的有限验证。正式Tauri/AppKit/菜单文字、准确Mac11正常退出及立即CmdQ仍需root后续。CmdQ未进入本轮窗口close guard是明确批准的源码边界，不保证未确认意图在立即退出前落盘。归档导入/真实媒体/多主窗和整体像素也未授通过。

仅写本目录和正式报告；无产品/Git/GUI/ADB/用户DB/下载/音频导出。浏览器、HTTP/Vite及全部Rustworker已结束。自有Vite缓存保留且排除索引，共享缓存未操作。evidence-index的paths从仓库根解析，不含索引自身及vite-cache。
