# APP92 恢复状态

目标：Mac 客户端从系统自带备忘录复制导入，保持源笔记、目录和附件不变。状态 **in-progress**。上一轮同步及 Android 画廊已交付；本轮不启动 Android 或旧模拟器，原约13秒未保存录音现场保持。

契约见[导入设计](../architecture/apple-notes-import.md)、[来源协议](../architecture/apple-notes-source-protocol.md)及[任务](tasks/app-apple-notes-import92.md)。入口为设置 → 数据 → 从 Apple 备忘录导入。

## 当前主线和工作交接

主线已合入 Store、固定 JXA、host/core/Session、UI/debug 及所有已准入修复。最后格式修复 `6febd39f` 已合为 `a8bc2452`；独立证据 `895652c1` 已合为 `7a602cca`。尚无 Mac30 包。

| 工作 | 工作树 / 负责代理 | 当前门槛 |
| --- | --- | --- |
| 主线集成、新 lean、实际 App DOM | `/private/tmp/apple-notes-import92-develop`；开发代理 | 已获 target84 排他使用权，按当前主线最终检查；真实来源测试默认 ignored，不再读取 Notes |
| 保留真实内容的离线回放 | `/private/tmp/apple-notes-import92-real`；研究代理 | 方案已准备，等待最终修复后新 immutable lean；仅用保留私有快照，新建目标 Store |
| 独立核查 | `/private/tmp/apple-notes-import92-review`；独审代理 | 格式修复已 PASS 并释放84；准备最终集成及 Mac30 包核查 |

共享 Rust 缓存仅 `/private/tmp/apple-notes-sync84-target`，排他交接。不可并发修改。代码与测试由作者实现，不同代理独审，root 维护文档及合入。

## 已通过的范围

- Store/转换、host/core/Session 及资源修复已独审合入。追加导入保留现有笔记/设置，不走备份替换路径。受管 JSON 文件保留原 HTML/元数据；去重从文件及实际 owner 重建。host 磁盘监测是 soft-watch，不宣称能强制终止 Notes 内部的 save。
- 固定来源脚本对完全一致的重复元数据行做归一化，同 ID 冲突仍拒绝，host 不放宽重复 ID。独立 VM 反例及真实来源后续运行分别留证。
- UI/debug 实际 React/Tiptap → 同生产 core → Session/SQLite/文件20项通过；仅 OS 来源、窗口/对话框边界 synthetic。包括层级、格式/日期、媒体/raw 独立文件、PNG 原字节导出、去重、取消、备份恢复和恢复后去重、手机隐藏入口。数据统计仅非空 smoke，不冒称精确字节审计。长取消原反例在修复后实际 React 复跑通过，原失败保留。
- real02 实际 SystemSource → worker → 隔离目标 Store 自然0/43.027秒，导入1、重开及重复 existing1；标题/plainText/日期/raw HTML 精确，源前后采样字段相同，原有合成基线和设置保持。原 real01 自然101/29.176秒和只读查询失败原样保留。
- real02 私有结构检查另发现块间 ASCII 排版空白造成多余空段落，不能把该轮追认为完整段落保真。最后修复只去除块间/边缘排版空白，保留显式空 div/br、inline 空格、pre 和 NBSP。作者受影响14项通过；不同代理3个冻结反例修复后全部通过，自然0/13.571秒；临时旧 html.rs 原样对照3项全部失败，自然101/2.736秒。raw/plain/date/fingerprint 均验证。临时改动已恢复。

## 尚待完成

1. 当前主线相关 Rust/前端集成、新精确 lean、同实际 App DOM20项。
2. 用该精确新 binary 将保留 real02 私有内容离线导入全新 Store，核对六个显示块及四个显式换行、raw、重开。此层 Source 是保留 fixture，不新增 Notes 读取，不修改原 real02 目标。
3. 准确构建 Mac30，并由不同代理独立核对动态源码输入、内嵌前端、ZIP、实际签名 entitlement 和 `NSAppleEventsUsageDescription`。旧 adhoc 重签必须显式保留 Apple Events entitlement。
4. 更新使用说明、最终交付记录及任务状态后再完成目标。

## 能力边界和隐私

真实源首次采样读取成功；3个附件副本导出实际失败 -10000 且无文件，CID 未在 HTML 出现，不能推断类型、云端状态或权限原因。普通图片/音频/PDF/复杂对象的实际 Notes 导出、真实清单/表格未获成功证明；synthetic 转换/存储测试单独记账。失败附件笔记明确跳过，不能显示为完全成功。打包 App 自身自动化授权运行尚未证明，不能用 core 源读取或 entitlement 核包替代。

真实源标题、正文、ID、附件仅留私有本地目录；仓库与命令输出只含安全布尔/计数/hash。不得执行 Notes 源 make/set/delete/move/import、修改源 DB/权限或终止 Notes；附件 save 只导出副本到全新自有暂存。Mac29/Android21 保留，本轮只出 Mac30。

离线方案：`/private/tmp/apple-notes-import92-offline-replay-plan.md`。原实际来源私有入口仍默认 ignored，当前不再执行。各层证明不可互相替代。
