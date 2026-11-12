# sync108 实际双原生桌面验证

最终 helper 关闭修复 `50a2ac9f` 的完整 fresh 验证记录见下方 run06。
run05 是同一新原生 binary 的首轮完整通过，但早于最后的 Node 关闭修复；
不将其冒充最终 helper 的结果。run01–04、Mendel ready02 和原浏览器失败均保留。
本目录 JSON 记录每份原始结果的绝对路径和 SHA256，原输出不改写。

## 最终完整轮次

`/private/tmp/sync108-native-desktop-run06`：**整体 passed，33 条断言通过**。
时间 `2026-11-12T11:44:59.405Z` 至 `2026-11-12T11:45:44.014Z`。原 result SHA256：
`8e78de8131b807aca5d8bfd189a45103f7c4f45b98b164ab0d102e2c12b541b8`。最终执行的 runner/helper 来自 `50a2ac9f`，
两文件哈希记录在 run06.json，均与提交文件逐字节匹配。

四个 owned 进程 A、B、B-reconnect、A-restart 均自然 exit0/signal=null，
forcedSignals=[]、failureCode=null。两个 DB/WAL 只读副本 integrity=ok，
各 notes=5、attachments=2、sync_heads/projection=7、inbox/dirty=0；
持久 projection 完全一致，同 workspace、不同 device。WAL 字节数分别为
1380232 / 1231912，原 DB/WAL/SHM 哈希和产品输入未变。

run05 同样实际整体通过 33 条，但其 helper 尚无 `50a2ac9f` 的最后关闭修复；
因此最终验收选择新的 run06，不改写 run05 或历史失败。

## 输入与执行方式

- macOS 26.4 / 25E246，两个真实 Tauri App，使用相同 binary、两个 fresh
  `--data-dir`；重启复用对应数据目录。没有启动 Vite 或执行本地编译。
- binary SHA256：`771bed664a3793938b7dc18d6dd07a4cbb63cb088808174c44062d2fb49fd723`。
- 原生模块 `736469ee`；Mendel lib PageLoad 接线 `e3225038`，保留媒体 opened。
  Rust 仅在 `sync-e2e + debug_assertions + desktop` 编译，另需环境开关。
- 静态 frontend 构建命令为
  `NODE_ENV=development VITE_NOTES_DEBUG=1 pnpm build`；dist SHA256
  `ac755157f95eebd047f0f2830c0877abcecb72780f5f1ec5036d77be4fa82dc6`。
  DEV 调试入口、feature、运行环境开关均为生产差异，不宣称普通生产构建测试。
- canonical record 来自 Mendel `native-ready03`；运行前核对 binary、450 个
  canonical product inputs 及 dist。执行的 Node 工具独立记录哈希，不冒充重编。
- stdin 串行 NDJSON 经 native main webview.eval 调用真实 debug handler/DOM，
  随机 event 回包。没有 Session、quiet 或保存 ACK 替身，没有 SQL 写业务。

## 实际覆盖与边界

真实配对合并两端已有笔记；双向中文完整 document/plainText、标题/粗体/列表/
斜体；普通文件夹、标签、置顶、移动、纸张；PNG/TXT 原字节和物理原文件
SHA256、原生 webview 图片解码；删除恢复；进程离线重连；同基线并发、真实
keepAll 两次确认、两分支完整保留；EOF 自然退出、暂停/身份/脏数据重启持久化；
重复同步幂等及 pending/conflict 清零。

DESK-04 新增真实表单创建智能文件夹，接收端定义/query 完整匹配，并在真实
列表验证 tag+pin 组合规则命中目标、排除对照笔记。该子项已实际执行。

**DESK-11 仅部分覆盖。** 接收端打开目标编辑器，独立被动监听实际后端
`notes-sync`，计数目标 prepare/commit release；要求可信 externalVersion
推进、editor 恢复 editable、不 frozen 且无 pending/failed save。监听器从不
发送 quiet reply。尚未覆盖“远端变更与本地未完成保存/IME 的确定重叠”，
不能把本 suite 通过写成完整 DESK-11 通过。

附件输入使用既有 `attachment.submit` 的合成 File[]；之后 journal、保存、
网络、正文引用、原文件读取均为真实实现。不宣称 OS picker 或物理键盘操作，
也不包含 Android/三端验收。

## 失败保留与诊断边界

| 原目录 | 原结果 | 保留结论 |
| --- | --- | --- |
| `/private/tmp/sync108-native-desktop-run01` | 1 check 后 ERR_ASSERTION | 工具错误要求 disabled 身份；失败保留。 |
| `/private/tmp/sync108-native-desktop-run02` | 29 checks，4 进程自然退出，证据读取失败 | 工具错误拒绝非空 WAL；不追认为整体通过。 |
| `/private/tmp/sync108-native-desktop-run03` | 17 checks，B-reconnect JS TIMEOUT | DB/WAL 证据成功；旧模块无 phase，根因未确定。 |
| `/private/tmp/sync108-native-desktop-run04` | fresh A NATIVE_TIMEOUT，0 check，exit70 | 无 JS 终态回包；根因未确定。 |
| Mendel `native-ready02/handshake.json` | 两进程 NATIVE_TIMEOUT/exit70 | Ready 专项失败，非业务轮次；详情及 SHA 见 historical-failures.json。 |

新轮次记录真实 native Started/Finished、document complete、startup detached、
root 不 inert/aria-hidden，以及两窗口存在时实际 rAF/timer 推进。左右窗口设置
只是测试请求：实际坐标/尺寸以每个 run JSON 为准，不能据此声称窗口完全不重叠，
不能把旧超时归因于遮挡。PageLoad 门控与窗口设置同时变动，单轮通过也不能
单独证明旧根因；没有以锁屏推测解释失败。

## 落盘与清理

所有 owned App 关闭后复制 DB/WAL/SHM，副本以 SQLite mode=ro + query_only
读取；不以 immutable=1 忽略 WAL。要求 integrity=ok，原文件哈希未变；比对两端
持久 projection、同 workspace/不同 device、dirty/inbox=0。非空 WAL 是有效落盘
证据。原数据保留在对应 fresh run 目录，不上传 DB 或完整身份密钥。

最终关闭修复在 full pipe close 后重新合并 fatal，suite 同时拒绝 lifecycle
failureCode 或非自然退出。Node 集成反例先在旧 helper 上复现错误接受，再在
修复后通过；12 项协议测试通过，见 cleanup-regression.json。Node fixture
本身不作为 native 业务证据。

本目录不含邀请、原始 stdout/stderr、完整私钥或截图中敏感字段。原 binary、
source map、DB 等大输出继续留在原目录，仅归档路径、必要哈希和脱敏摘要。
浏览器 startup 17+4/mobile settings56 曾通过；旧 desktop44px 断言失败原证据
保留。主 main 已报告按桌面28/mobile44契约修正并另行复验，此处不重复运行，
不覆盖旧失败。
