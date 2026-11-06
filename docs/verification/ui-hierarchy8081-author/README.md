# 80 + 81 组合开发验证

组合源码提交：`74108461`。最终源码输入 SHA-256：`ffa7cdaff8e2694db35f4199063284307d15fbf6f803d13c442a173931118ad4`。

本目录记录开发者的定向验证。独立复核、主线完整回归、Rust 测试和 Mac25 / Android15 构建由根任务完成；这里没有对安装中的用户应用、真实麦克风或 Android 未保存录音进行操作。

## 组合结果

| 场景 | 最终输入的通过项 | 目录 | 进程结果 |
| --- | ---: | --- | --- |
| 图片预览，桌面浏览器 | 20 | `image-desktop-frozen` | 自然退出 0 |
| 图片预览，手机浏览器 | 18 | `image-mobile-frozen` | 自然退出 0 |
| 存储总览、备份恢复入口、公用导航，桌面 | 99 | `storage-desktop-frozen` | 自然退出 0 |
| 存储总览、备份恢复入口、公用导航，手机 | 99 | `storage-mobile-frozen` | 自然退出 0 |
| 原 data79 回归，桌面 | 33 | `data-desktop02` | 自然退出 0 |
| 原 data79 回归，手机 | 33 | `data-mobile02` | 自然退出 0 |
| 原生工具栏控制器 | 20 | `controller-final.log` | 自然退出 0 |
| 生产 ObjC 的独立 AppKit 窗口 | 真实 zoom/restore、marked text、overlay、保留搜索字段 | `native-final.json` | 自然退出 0 |

四个 `*-frozen` 的 sourceHead 为 `74108461`、源码输入 clean 且运行前后 SHA 相同。data79 的两个 `02` 运行在提交前完成，gitDirty 为 true，但完整源码输入 SHA 与最终冻结完全一致。控制器最后一次运行后，控制器和其测试文件没有再修改；各文件哈希保留于 `input-hashes.json`。

存储场景为原 81 的 68 项、备份入口的 12 项、新增公用 `data.navigate` 的 18 项，加 1 项页面错误检查。原 data79 的 33 项保留，只有总数预期从 49 改为 52：新“全部文件”把数据库、WAL、SHM 三条也放入同一列表。仍断言每页实际 20 行、三页可翻页、三种数据库状态可见、原图导出、缺失文件、失败重试、敏感数据遮盖和录音期间备份禁用。首次失败保留于 `data-desktop01`，没有删除失败截图或放宽分页断言。

## 修复两个控制器问题

`controller-before.log` 是第一处问题的失败复现（自然退出 1）：普通原生 update 仍在等待时，React 已请求保护 overlay；旧请求之后以 `search_composition` / `stale_search` 失败，队列会停在旧请求，保护层永远不到原生工具栏。提交 `d72fef22` 在旧请求结束后，仅调度更新的保护层，且不对相同失败状态忙重试。`controller-after.log` 是该阶段的 16 项通过记录。

独审进一步要求限制延迟搜索事件的信任范围。最终控制器投影显式传入 `searchScope`，包括导航、授权 stamp、编辑器身份、正文版本；不把 query 或 overlay 的呈现变化当成新的范围。只有相同非空信任范围且经过 overlay 转换的旧 revision，才保留搜索来源；普通 A→B 更新不会归档旧搜索。已知旧范围的事件只确认原生序号，绝不采用旧值或执行旧 intent。导航/正文/授权改变会清除保留来源；缺失或空 scope 的旧 JS 调用也不能获得保留能力。`controller-scoped.log` 是 19 项中间记录，最终 `controller-final.log` 为 20 项，包括缺失/空 scope、普通更新、不同正文/授权、in-flight 范围切换、invalidate-in-flight 负例。invalidate-in-flight 是要求补充的回归测试，不声明曾发现对应产品 bug。

## 标题栏重复缩放的定向核对

当前 `src-tauri/Cargo.lock` 为 Tauri 2.12.5。本机安装的官方 `tauri-2.12.5/src/window/scripts/drag.js` 已处理双击：Linux/Windows 在 `mousedown(detail=2)` 调用 `plugin:window|internal_toggle_maximize`，macOS 在对应 `mouseup` 调用。此前同一元素还存在 React `onDoubleClick → toggleMaximize()`，真实注入后会发生两次 toggle。

组合修复删除额外 React 处理和旧 helper，三个 fallback header 统一使用 `data-tauri-drag-region="deep"`，仅桌面原生环境设置该属性。原生 Mac 的 `NotesUIRoot` 路径保持为真实 NSWindow zoom/restore。该版本 core window 默认权限包含 `allow-internal-toggle-maximize`，本项目现有 `core:default` 已包含它。

`scripts/debug/fixtures/tauri-drag-2.12.5.js` 与本机官方源码逐字节一致，保留官方版权与许可证头，SHA-256 均为 `2d47d2e302512024af4ded95b89f8b1f5c8d83530d287c252052112901a59888`。测试仅替换官方运行时 OS 模板为 linux，并将原版脚本注入真实页面，再依次派发 mousedown、mouseup、dblclick：三个空白 header 各执行一次内建 toggle，按钮、搜索框、编辑器均不执行。该证据覆盖官方注入与 React 组合事件链，平台调用仍是显式模拟，不声明对 Windows/Linux 安装包做过验收。手机运行还断言没有桌面 drag-region。

## 命令、来源与保留材料

每个浏览器目录包含原始 `summary.json`、DOM 快照、PNG、场景数据；同名 `.log` 为 CLI stdout/stderr。`completion.json` 记录每次自然退出、通过数、源码输入和必要限制。没有强制退出未完成的场景，也没有把超时进程视为成功。

`pnpm exec tsc --noEmit` 和 `pnpm build` 均自然退出 0，`build-final.log` 保留原始构建输出。但它们运行时输入为前一版 `1a4b1c9d4f9d0c2f8aa3c87284c24c85fbd4919d7c0c1b29d367fe8d2ed03aa5`，之后发生 App/catalog 的格式整理及 data79 预期总数修正；最终生产构建由主线一次完成。candidate 当前 dist 因此不作为最终交付包。

独立 AppKit harness 的编译命令与运行结果在 `completion.json` / `native-final.json`。它运行生产 ObjC bind/update/root，创建自己的 NSWindow，用真实 frame 变化证明 zoom/restore，并验证 marked text、保护 overlay 对陈旧 ack 的优先级、恢复同一个 NSSearchField 与其值、拒绝陈旧正常投影。单击 drag 为计数替身，Rust 序列化/硬件/系统权限由其他验证覆盖。
