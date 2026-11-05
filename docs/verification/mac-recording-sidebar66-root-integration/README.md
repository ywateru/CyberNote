# Mac录音统一右栏66根整合

2026-11-05。状态：SOURCE-INTEGRATED / PACKAGE-PENDING / RUNTIME-OPEN。

根产品与独立通过的作者产品 `f4a2fba7b5d1fda854b3bc802a629a6e1045c7f4` 在 `src/ src-tauri/ plugins/` 下逐字一致，`git diff --exit-code` 返回0。根整合检查基点 `9199370aa281c591588a990c5b90f49eb3e1d3a1`：typecheck、生产build均exit0，见checks.json及原始日志。build保留现有大chunk提示。

| 来源提交 | 根映射 | 内容 |
|---|---|---|
| 11c73a91 | f417a7f7 | 统一右栏初版 |
| 182617db | bf5f6091 | 作者证据 |
| f4a2fba7 | d63ed4e1 | 登记丢回复恢复、准备中关闭取消 |
| 8da6d248 | da04ba82 | 修复证据 |
| 73505a55 | 9199370a | 最终独立通过 |

最终独审见[复验报告](../../plan/reviews/app-mac-recording-sidebar66-followup.md)：实际挂载App链17组、准确native核心5组通过，独立typecheck通过，无未捕获页面错误。原两项P1已关闭；原blocked报告和失败证据保留。

这些检查使用受控IPC、媒体和后端边界，不代表真实Mac麦克风、操作系统关闭/退出、安装包或像素验收通过。旧Mac18未存3秒录音与手机13秒现场未操作。后续从准确root提交另行冻结Mac19输入、串行构建、核包，再通过Computer Use验证新包；不得为新包退出旧Mac18。
