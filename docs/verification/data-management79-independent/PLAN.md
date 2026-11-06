# 数据管理79 独立审查准备

2026-11-06。状态 **EXECUTED / PASS / SOURCE-READY**。此文件保留最初独审设计；实际完成结果、冻结身份、发现/修复及边界以[README](README.md)和[正式审查](../../plan/reviews/app-data-management79-static.md)为准。最终candidate f038e998、runner ad982ee8新33完整自然exit0/19.71s、输入前后不变，已交还Cargo/Gradle/candidate dist。原始失败保持失败，没有用计划当验证结果。

审查角色与产品开发分离。先审后端冻结产品/runner，再审前端冻结产品/runner，最后核对合入后的真实 Rust→bridge→App 接线。未冻结产品不提前读取或测试，cargo 由后端明确交还后才使用。独审只写本目录与 `docs/plan/reviews/`，不改产品、公共 fixture/runtime 或开发者证据。

## 冻结与证据门槛

接收准确 worktree、产品和 runner commit、输入 manifest、自然退出原始日志、原生构建边界和 cargo 缓存交还。独审开始及结束核相关 Rust/Session/bridge/plugin Kotlin/manifest/permission、前端、runner 与锁定依赖哈希；报告明确源码/runner 身份、dirty 状态及与最终主线的关系。无基于文件名或测试作者结论的追认。失败原件保留；若是独审假设或设施错误，明确原因后仅改自己的探针，不能更改产品使验证通过。

命令分别保留 argv、cwd、自然 exit、完整进程 wall（含 cleanup）、stdout/stderr、pageErrors。真实 Rust、新进程恢复、Android Kotlin/Rust 编译、原生 provider 动作、browser fixture 和界面像素结论分开记录。已有常规套件由作者与根按冻结源码执行，独审重点补新增边界，不重复扩大历史197/9/43/43回归。

## 后端独立验证

1. 全新合成目录通过实际 Session/API 建立笔记、文件夹、图片、录音及一般文件，不用 JSON 返回值替代落盘。用独立标准库遍历/metadata 与已知 fixture 字节计算 oracle；检查 SQLite 结构/元数据与独立附件文件，确认没有新媒体 BLOB/base64 入库。新 PID 重新打开并比对原字节、大小与 mtime。
2. 快照所有路径唯一；数据库/WAL/SHM 缺失时仍三项明确列出。实际普通文件、空目录、未归属附件/其他文件、`.imports`、missing 登记附件、大小不符、symlink 均保留，不跟随指向外部的链接。目录/missing/未知大小为 null。各 totals 等独立普通文件分类求和，declared 与 physical 分开，无目录重复计数；counts 依实际 metadata 与文件定义核对。
3. 设置已知历史 mtime，确保 capturedAt 与 modifiedAt 不混用；刷新后可观察真实文件变更。目录遍历错误/采样中变化有警告，不把被截断结果描述完整。统计不读 payload，不执行 checkpoint/vacuum/清理，不改变媒体或 recovery/journal 文件。权限不可读探针按真实平台能力报告，不把测试用户仍可读取假称不可读。
4. unknown/stale session、epoch、pending access 被拒；snapshot 按既有 access/metadata 闸门交付。无权 owner 不新增 displayName/正文/标题泄漏，referenced 加密未知与 exportable 语义真实。确认判断“未引用”没有误删旧录音版本、未完成 operation 或导入恢复资源。
5. 单件图片/录音/一般文件按 ID 输出完整原字节，独立 SHA 和 byte count 与源一致。错误 ID、missing、实际 size 不符、不可读、失效 token、选择器期间撤权及写失败明确失败，源、正文、历史及其他文件保留。目标保护覆盖 DB/WAL/SHM、attachments、`.imports` 和其他受管目录；包括规范化父目录和链接绕行负例。临时文件只清本操作拥有者。
6. 实际 Session 导出归档→fresh 目录导入→新 PID 重新打开，独立核完整笔记/文件夹/设置与全部媒体原字节。第二次导入冲突应生成副本，原记录/附件不变。损坏/超限/文件失败/ACK失败保留原 store；不能绕导入 prepare/ACK/commit receipt。禁止用现有用户目录做测试。
7. Android 以锁定 dialog 2.8.4 的 URI 行为为准，核对 host-only 私有 staging/ContentResolver bounded input/output，不将 content URI 当 PathBuf，不新增 WebView 私有路径能力或扩 execute 权限。审复制上限、短读/短写/close failure、取消、temp 生命周期、并发 operation 身份与拒绝删除用户已有文档。只报告真实执行过的 Kotlin/Rust 构建或新隔离 harness；没有 provider 运行证据则保留该边界开放。

## 前端独立验证

1. 先核作者修复前真实 DOM 遮罩复现原件，再在最终代码执行正常添加图片/附件的完整存前/存后链。全过程 MutationObserver+rAF 记录 cover、display/visibility、原 Host/Tiptap 与已有媒体 DOM 身份，包含 await 间隔，避免只看最终截图。验证操作确实完成文件/正文 ACK；没有绕 trusted/owner/version/bookmark。
2. 强同步与 quiet 并发、权限 prepare/撤权、陌生 session、quiet 请求迟到/失败仍保护内容；强同步不被 quiet 完成降级，失败不重新暴露旧文档。编辑准入继续受原同步契约约束。
3. 真实 DOM 图片卡保存、预览导出、管理行导出分别经 bridge；取消无成功提示，double click 去重，失败可重试，picker 后切 B 不把 A 归属转移，撤权不能写出。保存/导出前后 JSON/选区/Undo 状态不受操作污染。用实际导出字节 oracle，不只看通知。
4. 两入口、刷新、关闭/重开及旧请求迟到；加载保持列表、错误/重试、mtime 真实呈现、missing/null/目录/警告/不符标记；搜索筛选/分页匹配数与总数不丢条目。320/390 与桌面浅深主题检查无横向溢出、路径换行、关闭和行操作可达。
5. 备份按钮录音活动时禁用且解释，本窗口 pending save 不被跳过；取消/错误不假成功，完成或失败刷新真实数据。界面可见“已保存数据”、导入合并和设置应用语义，不暗示其他窗口未提交草稿已归档。
6. Debug catalog/handler 覆盖并经真实 App 方法调用，生产排除保留。默认 fixture 的验证结果明确标作 fixture，不能授予真实磁盘统计或 Android provider 通过。

## 最终整合门槛

在根指定合并源码运行最小真实 Rust transport→bridge→App 路径：创建合成含图片/录音笔记，DOM 添加/管理页实际 stat，图片动作导出至合成目录，DOM 完整备份导出→fresh store 导入并逐字核媒体；确认管理页数据来自 Rust 而非 fixture。检查完整 session/access/metadata/receipt 交付而非仅调用 Store helper。全部条件满足才评 SOURCE-READY，原生 provider/整窗像素未运行仍保持 OPEN。

原 Android 约13秒未保存录音现场完全不触及：不安装、启停、重启、导出、读取数据库或媒体。既有 Mac 应用进程不启停，不用真实麦克风，不操作原版删除实验。
