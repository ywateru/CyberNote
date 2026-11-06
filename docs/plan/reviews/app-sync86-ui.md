# APP-SYNC86-UI 独立审查

2026-11-06，结论 **BLOCKED：一项 P2 触达尺寸不符**。产品冻结提交 `a9221a0e83b666d47b7fde3bd26a18ea63834a01`，审查工作树起始 HEAD `c7aec14f009b0bea9b3563dea6e2b30fa2a4bca3`。本次没有修改产品源，证据见[独立报告](../../verification/sync86-ui/independent/README.md)。

| 严重度 | 位置及合同 | 实际结果与所需修复 |
| --- | --- | --- |
| P2 blocking | `src/SyncSettings.css:15`、通用 button 规则；`docs/ui/sync-settings.md` 的按钮最小44px触达 | 手机浏览器实际320×360视口，“刷新同步状态”button只有 **32×44px**，左右272–304、上下253.25–297.25，before/after均none。没有更大的伪元素点击区。16px图标加两侧8px padding，且通用规则只设min-height。应将新同步按钮的两轴最小触达都设为44px，并补两轴断言。 |
| 测试缺口，随上项修复 | `scripts/debug/sync-settings.mjs:438` | `smallButtons`仅检查height，因而作者及本轮48项组均未发现宽度不足。应同时检查width，保留320/390/1280浅深和短屏滚动约束。 |

其他已审边界未发现阻塞：产品IPC只发送规格的command/expected；返回optional必须省略而不是null，逐层未知字段、计数、boolean、digest验证；默认状态不启用身份；状态旧回包不能覆盖后续变更；邀请只在DOM property可见，不进入HTML快照、inspect、命令结果、aria-live或localStorage；关闭、切标签、分类切换及晚响应不复活secret。原生pair错误被安全化，失败后secret仍可在密码输入重试，关闭即清除。pending始终优先显示等待安全应用，不当作已应用；撤销和两种解决方式均先显示真实确认再发IPC。

定向组桌面48和手机浏览器48通过。自行编写、没有调用作者断言的57项探针通过。生产排除检查针对已有作者dist通过，记录其确切SHA清单；本次没有重新构建dist。作者原设置52及构建证据只作既有证据引用，没有重跑或改记为独立通过。

上述通过都只适用于真实React/App/严格包装/HTML及显式JS协议fixture。Rust、加密网络、真实冲突副本、双设备收敛、Android WebView/IME、硬件与最终像素没有由本审查证明。P2修复后仅复验两轴触达及受影响sync定向组；原57项与原产品适用层保留，不能把旧通过写成修后重新执行。
