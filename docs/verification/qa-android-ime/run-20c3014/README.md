# Android 真中文输入有限验证：20c3014

本目录保存真实 Android Trime 键盘输入、候选、被动组合事件、实际文本选择、格式、Undo/Redo 和冷启动证据。它包含一个实际 P1：候选停留约 35 秒后，内联拼音残留并与候选汉字同时保存。快速选词这一个轮次正确替换，并不消除该失败。

- `ime-inline-nihao-marked-read.json` / `ime-inline-nihao-marked.png`：长停留阶段实际编辑器拼音、候选与 composing 已 false。
- `ime-inline-nihao-committed.json`：候选点选后 `ni hao‸你好`。
- `ime-fast-marked.json` / `.png`：下一轮真实 composing=true、组合节点、PM/DOM 选区和可见候选。
- `ime-fast-committed.json`：真实 compositionstart/update/end、beforeinput/input（insertCompositionText/isComposing）完整被动事件；本轮新增拼音正常替换为一个“你好”。
- `ime-selected-before-format.json`、`ime-bold-{applied,undo,redo}.json`：真实长按选区 13..14，粗体只应用到“好”，真实工具栏 Undo/Redo。
- `ime-before-cold.json`、`cold-lifecycle.json`、`ime-cold-opened.json`：进程消失、LaunchState COLD、真实打开同一合成笔记后 JSON/粗体保留。也保留了失败残留，不能将其称为正确输入结果。
- `original-input-settings.json`、`restored-input-settings.json`、`trime-inline-mode-restored.*`：原输入法及四项系统设置完全恢复；Trime 原模式 Disable 已经恢复。
- `installed-identities-and-restoration.json`：安装 APK 实际设备端哈希、版本信息。没有私有数据导出。
- `native-actions.jsonl`、`actions.jsonl`、`tools/`：实际按键/触摸及只读观测方式。`qa-ime-cycle.mjs` 只给 DOM 加被动观察器，不派发事件，不写编辑器/IME 内部状态；冷启动已销毁观察器。
- `finite-assertions.json`：有限证据比对，`long_dwell_leaves_preedit_FAILURE=true` 表示失败已观测，绝非通过。

`uiautomator dump` 有三次返回 137，失败调用未生成对应 XML；主要组合证据改用实际 screencap + CDP read-only 文档/事件，不拿空 XML 当通过。初始 ASCII 标题不计中文验证。此处未加入 save/hydrate 函数钩子、未抓存储/事务时序；不能由现有证据认定哪一个保存/刷新路径导致 composition 被结束，也不能推断精确超时阈值。

本轮只操作 emulator-5580；没有重建、清数据、修改主应用源码或接触 Mac GUI。Trime 作为测试工具仍安装但已从原 enabled_input_methods 集合移除，不是产品依赖。后续 FIX02 Android 新包需要独立回归，不能继承本轮通过。
