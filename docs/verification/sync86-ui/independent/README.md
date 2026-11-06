# Sync86 UI 独立验证

2026-11-06。**BLOCKED：刷新同步状态按钮实际32×44px，不满足规格的44×44px触达。** 交develop最小修复，本执行者未改产品源码。完整审查见[review](../../../plan/reviews/app-sync86-ui.md)。

只在 `/private/tmp/apple-notes-sync86-ui` 执行本任务。起始HEAD `c7aec14f009b0bea9b3563dea6e2b30fa2a4bca3`，产品与冻结 `a9221a0e83b666d47b7fde3bd26a18ea63834a01` 的 `src`、`scripts/debug`、产品依赖及插件逐字diff为空。三次最终CLI和独立探针前后130项输入SHA256均为 `42867a68b354af753ec04d5ba8fb349e589c3edbc101106e8f6d1a614c9505cd`，`gitDirty:false`、输入未变。该指纹范围不包含Rust/network，不能据此授予这些模块通过。

| 执行 | 自然退出及完整wall | 结果 / 证据 |
| --- | --- | --- |
| 首次desktop | 1 / 9.531s | `desktop.stdout.txt`、stderr、`desktop/`。输出HTML放在源码树触发Vite reload，debug API暂不存在；是验证输出位置错误，不记产品失败，也不删历史。 |
| desktop retry | 0 / 11.889s | `desktop-retry/summary.json`、suite、320/390/1280浅深六份真实HTML和PNG；48项。 |
| mobile browser | 0 / 8.147s | `mobile/summary.json`、HTML/PNG；48项，非Android原生。 |
| 独立探针初次 | 1 / 3.996s | `check-attempt01.mjs`、`probes-attempt01/`。前52项完成；测试误给peer名称126字符，产品按120上限正确拒绝。 |
| 独立探针最终 | 0 / 7.837s | `check.mjs`、`probes/result.json`；只把超长测试名称改为119字符，57项通过。 |
| production排除 | 0 / 5.133s | `production/summary.json`：API不存在、URL不能开启、3资产四种debug/fake标记为零。检查现有作者dist，准确文件身份在`production-dist-manifest.json`，没有本轮重建声明。 |
| 独立手机触达测量 | 0 / 5.648s（含cleanup） | `refresh-touch-target.json/.png` 与 command记录。实际320×360、mobile context；刷新button32×44、无before/after扩大点击区。此项为测量结果，不是44×44断言通过。 |

57项探针独立调用公共runtime、真实App/组件、实际产品 `validateSyncResult` 和 `syncCommand`，没有复用作者的sync-settings断言。覆盖10种optional-null拒绝、缺必填、逐层未知字段、计数/列表/digest/endpoint边界、合法省略字段、旧disabled状态晚回不覆盖新host、严格expected/session/epoch请求、native pair错误包含secret时不发布、关闭与分类往返清secret、五种传输状态下pending优先、320短屏真实输入焦点与长名称确认滚动、取消不发送revoke。成功短屏确认top205.40625/bottom359.78125，焦点在确认内，按钮72×44及46×44，共用scroll宽320，无横向溢出。

进一步读取真实HTML snapshot时发现刷新宽度仅32。作者布局检查只检查height，故48项和上述独立功能检查通过仍不能关闭P2；已把这个反例单列，未把“测到尺寸”包装成产品合规。最终证据及阻塞结论对应原冻结产品；修后需另记新产品输入和针对性验证。

命令的输出使用fresh `/private/tmp/sync86-independent-*`，待相应runtime自然退出后拷回此目录。后续重放也应把HTML输出放到源码树之外，避免触发Vite watcher。日志、命令和失败保留；`manifest.json`列本目录文件字节及SHA256。

本轮没有启动/安装产品包、Rust编译、真实网络或设备操作；没有操作原Android现场、麦克风、录音或用户笔记。没有merge/push。本文只证明显式JS IPC fixture上的UI与包装行为，pending接收、真实持久化/应用、Noise/双设备收敛及Android必须由84/85/86生产接线另行验收。
