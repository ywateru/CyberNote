# Task70 开发收尾结果

2026-11-05。本阶段恢复中断后的开发收尾，完成测试断言修正、录音组复跑、390×844 手机尺寸笔记组和生产入口检查。整套九组的最终结论由主线整合报告给出；本页按实际运行分组记录，不将 catalog 存在等同于全功能实测。

## 修正

- `9310d1a9` 仅修改 `scripts/debug/scenarios.mjs` 和 `docs/debugging.md`。原 `9c72fb56` 整套运行最后错误要求物理附件总数为 1；64/66 的既有契约保留旧 committed 媒体以保护 Undo，因此本次改查正文及 DOM 单卡引用最新累计版本、两条 journal committed、最终 saved revision2、owner 已释放、pending/failed 均为 0。产品保存代码和历史媒体保持原契约。
- `59ecfb6c` 仅补 `scripts/debug/platform.mjs` 的 Android 返回键系统边界。已安装 `@tauri-apps/api` 为 **2.12.4**，`app.js` 的 `onBackButtonPress` 通过 `core.js` 的 Channel 调用 `plugin:app|register_listener`（兼容 `registerListener`）及 `remove_listener`。原 fixture 只有过期的 `on_back_button_press` 空分支，导致手机尺寸启动失败。新增模拟按 Channel id 注册、按序派发、移除及清理，未知 IPC 仍明确拒绝；事件结果注明 `simulated`。

## 实际结果

| 运行 | 精确源码 | 结果 | CLI 报告耗时 | 组内耗时 |
| --- | --- | --- | --- | --- |
| `pnpm debug group recording` | `9310d1a929209782746b750d359a1ddfbf5ca445` | **14 checks PASS**，pageErrors 0 | 16.294 s | 7.138 s |
| `pnpm debug group notes --mobile` | `59ecfb6cef0c749b6d338fa43794a9491c36b645` | **9 checks PASS**，pageErrors 0 | 10.541 s | 2.017 s |
| `pnpm debug check-production --production dist` | `59ecfb6cef0c749b6d338fa43794a9491c36b645` | API absent、URL cannot enable、bundle marker matches 0、pageErrors 0 | 6.052 s | — |

CLI 耗时包含测试平台启动，在 `finally` 清理前采样，不作为独立硬件基准。三次运行均 exit0、`gitDirty=false`、`sourceInputsChanged=false`。录音组的 14 项包含 13 项业务/媒体断言和 1 项页面异常检查；手机组的 9 项包含 8 项业务/页面断言和 1 项页面异常检查。

录音组采用桌面 1280×800；手机组使用 390×844、Android UA 和触摸浏览器 context。浏览器版本均为 `156.0.8078.80`。录音输入为固定合成 440Hz/24kHz PCM/WAV，经实际 Session、累计 PCM 编码、AudioContext 独立解码、附件和正文 ACK 路径；覆盖 A 录音/B 编辑、暂停试听、双 checkpoint、保存失败重试、单卡替换、关闭、模拟退出以及迟到 checkpoint 错误恢复。

输入指纹按排序后的 `path NUL bytes NUL` SHA256 计算，含 `src/**`、`scripts/debug/**`、package/lock/Vite/TS 配置，共 77 文件：

- `9310d1a9`：`f0737bae0ed244809eefed3ac407c96b40cc5b49645205a7f1a63e7abfeff37c`。
- `59ecfb6c`：`0e632a7ccb9c92a49d9f13bb989a9b3cd5bf400de481769f2e0f0de49b6bcfe0`。

## 证据与复放

- [录音 summary](recording-summary.json)、[逐项结果](recording-suite.json)、[命令执行覆盖](recording-catalog-coverage.json)。
- [手机笔记 summary](mobile-notes-summary.json)、[逐项结果](mobile-notes-suite.json)、[命令执行覆盖](mobile-notes-catalog-coverage.json)。
- [生产入口 summary](production-summary.json)、[现有 dist 补充静态扫描](production-existing-dist-scan.json)。后者对既有前端产物逐文件记录 SHA；恢复阶段仅改 scripts/docs，未重建安装包，该扫描本身不构成新包来源清单。
- [手机首轮失败](mobile-startup-failure01.json)：`9310d1a9` 的 fixture 启动错误来自工具回执。`openRuntime` 在 CLI 接手 runtime 前失败，正常清理临时根，因此该轮没有独立 CLI failure 快照；保留这一事实，不补造原始日志。

复放命令：

```sh
pnpm debug group recording --out /private/tmp/notes-debug-recording
pnpm debug group notes --mobile --out /private/tmp/notes-debug-mobile-notes
pnpm debug check-production --production dist --out /private/tmp/notes-debug-production
```

两份 catalog 各有 67 个命令条目，逐项保留 `executed` / `not-exercised` / `unsupported` 状态；本阶段分组未执行的条目不会被计为通过。输出目录只保留紧凑 JSON，不复制缓存或历史音频；CLI 的隔离浏览器、服务和正常临时缓存均完成清理。

## 范围

默认后端为 `isolated-js-protocol-fixture`，系统对话框、OCR、剪贴板、返回键、关闭和退出事件均明确模拟；这些结果证明真实前端业务链与保存确认在该平台下的行为，不外推 Rust Store、Android WebView/IME、真实麦克风、OS 退出或原版像素一致。原版 Apple Notes 没有 HTML，保全录屏和截图继续作为人工视觉参考。本次使用合成数据及音源，原 Mac21/手机现场和用户录音均保持原状。
