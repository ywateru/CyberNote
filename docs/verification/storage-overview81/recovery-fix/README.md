# Inventory-independent backup recovery81

独立审查在最初冻结 `4a996cfc` 发现：备份区随整个总览受到 `data && usage` 门控，首次 inventory pending/失败时两个恢复入口均消失；79原有行为允许统计失败时执行备份。修复冻结提交：`0662a336540c5cef103d916a2ae86dc9ddeb6e24`。

修改 `src/DataManagement.tsx`：先按 view 选择总览，再分别以 snapshot 门控统计与详情折叠区，二者之间的本地备份区独立显示。视觉顺序不变，不增加假统计。备份按钮及 handler 同时保留 `backupBlocked`、`archiveBusy`、`operation` 并显式检查 `accessBlocked`。新增 `runStorageBackupAvailability` 在真实 App/组件DOM上操作备份按钮，不依赖共享 catalog 新命令。

## 修后冻结验证

所有命令使用精确修后提交。`commands.json` 为外层 wall、cwd、argv、exit 和完成记录时刻；`*.stdout` / `*.stderr` 为原始输出。`frozen-wrapper.py` / `browser-harness.mjs` 是执行原件。

| 命令 | exit | 完整外层wall |
| --- | ---: | ---: |
| `pnpm typecheck` | 0 | 2.108s |
| `pnpm build` | 0 | 3.870s |
| 外部 harness 调用 `runStorageBackupAvailability` | 0 | 8.129s |

合计14.206s。build只有既有chunk大小提示；完整wall来自wrapper，不用Vite内部时长代替。`frozen-browser/report.json`：**12项通过**，`pageErrors=[]`，harness内层wall8.027s。

`source-before.json`/`source-after.json` 逐文件记录tracked非docs源码，汇总SHA-256均为 `0f0839b10501f4bd6af3e5a0606466b24f0d0b4ea8a9549ac7aebf24b5104c01`，前后完全一致。

专项验证：首次pending（人为扣住inventory响应）显示无snapshot、无总量但实际DOM双备份可用；首次失败仍可重试读取和导入/导出；两种取消均不执行归档写入、不显示假成功；两种归档失败均显示错误、入口可重试；归档未完成时双按钮显示且禁用；导出重试走真实App archive处理器成功；无snapshot导入prepare期间双按钮仍存在但禁用，commit后即使inventory再次失败仍恢复可用；最终inventory重试恢复统计且备份区恰好一个。

`author01-failed/` 保留首轮runner失败：4项通过后预期的Controlled archive failure被调试waitForIdle按App错误向外抛出，未继续DOM断言。随后runner仅捕获这一明确受控错误，再断言真实DOM错误和入口状态；不是改产品绕过。`author02-report.json` 记录修正runner后12通过。冻结结论取自 `frozen-browser/`。

父代理指示不重复已过68全组，本轮只对修复重新运行类型、构建和12专项；初版68与16图保存在上级目录，不能把其结果当成修后全组重跑。根将完成组合与独审。

## 范围与截图

这里是**合成browser验收**：真实App/bridge/DOM handlers，inventory/原生归档IO/选择器使用显式isolated JS protocol fixture与模拟notes-access事件；未驱动原Mac应用、原Android设备或真实TCC/ContentResolver。原生层级组合由80与根另验。

- `frozen-browser/storage81-inventory-pending.png` 及snapshot：未返回时入口存在。
- `frozen-browser/storage81-inventory-failed.png` 及snapshot：首次失败可恢复，人工查看两按钮清晰可见且无虚假总量。
- `frozen-browser/storage81-recovered-without-inventory.png` 及snapshot：导入成功、统计仍失败时入口保留。
