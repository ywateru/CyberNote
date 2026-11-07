# 本地主分支整合（2026-11-07）

用户要求“合并整理到主分支”。已把 task/app-001 快进合并到本地 main，工作目录切换到 main。

- 原 main：e739d231；已验收任务分支：a87633cf。合并前 main 独有提交0、task/app-001独有提交1199，可以快进，无冲突，无历史重写。
- 合并后应用、Rust、插件、资源及构建配置与 a87633cf 完全相同。没有新增产品修改或重新构建安装包；Mac32 已有的准确构建及独立核包结论继续对应原批准源码3684205a，不冒称新文档提交是原构建入口。
- 根 README 整理为当前包、近期交付、运行/构建、测试、本地数据及文档入口；当前 Mac32 / Android21。旧根 README 归档在 docs/history/readme-before-main-2026-11-07.md，保留原时点，调整相对链接并记录原字节SHA。
- docs/plan/README.md 补当前入口，明确旧 active/进行中为历史记录。细分交付、原失败和验证范围保持原有文档。
- 旧分支、worktree、安装包、用户数据和原 Android 录音现场不删除或操作。既有未跟踪 output/、tmp/保持原状，不并入 Git。
- 当前仓库未配置 remote，本次是本地整合，没有远程推送。

验证范围为分支祖先/产品字节相同、文档链接和交付入口；产品测试不为纯快进与文档整理重复执行。相关产品最终检查见[Mac32](../editor94/DELIVERY.md)、[Mac31](../attachments93/DELIVERY.md)及[Android21](../sync91/DELIVERY.md)。

## 独立只读复核

另一代理对整理提交 `4cfac8a6944ce9f497f47c28af539031c4388675` 复核 PASS：main 包含 task/app-001 的 `a87633cfa7b2937f6c4ae39e73ede67e1e2e0b0e`，task→main 只有上述四个文档变化。动态341个产品路径、Git blob/文件模式和工作目录字节均等于任务分支及 Mac32 批准源码 `3684205a`。

历史 README 正文除相对 Markdown 链接加 `../../` 外与原文件逐字相同，头部原 SHA 准确；plan 历史正文未改。当前 README、plan 新头与整合说明的33个链接均存在，Mac32 ZIP/App、Android21 APK及交付记录入口正确。remote 为空；tracked 工作区干净，原 output/、tmp/保持。独审未切换分支、修改 main、运行产品测试/编译/设备或处理旧 worktree。本段为核验后的文档补记，没有新增产品变化。
