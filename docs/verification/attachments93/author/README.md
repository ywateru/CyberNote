# APP93 作者定向验证

最终产品与主线准入 `1cc8deaea4335bffb87b32ddcba4421b5bded971` 的全部动态产品输入逐字节相等，清单见 `final-validation.json`。产品源码在最终实际 DOM 流程前后保持相同哈希；`dom07/result.json` 记录实际前端源及 `frontendSourcesUnchanged: true`。没有 HMR 边改边测，也没有访问真实 Notes、麦克风、用户数据库或任何 Android 设备。

## 通过结果

- 产品 crate `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml apple_ -- --nocapture`：32 passed、1 个既有真实来源测试 ignored。包含新旧内部记录公开投影、无日期/版本变动、保存后内部引用继续存在、损坏/同长度替换/缺失/真实大小不符不隐藏、同名用户 JSON 不误藏、完整备份与两套真实 Store 严格原 wire 同步 publication 后去重。
- `dom07`：43 项通过，实际 React App/TipTap Editor/生产导入核心/真实 Rust Session 与 SQLite Store。源 PNG/WAV/TXT/PDF 全部保留公开节点，原字节导出摘要一致；额外两份原始记录只有内部 metadata，不显示卡片。实际菜单覆盖图片预览、信息、原文件保存、取消/失败、移除/Undo、音频控制器与视频元素播放暂停、菜单键/方向键/Escape、右下 8px 边界、live 录音卡禁用及其他已保存音频可操作、picker 延迟期间真实笔记行导航后拒绝原动作。完整备份恢复和重复导入继续去重。没有 renderer exception。
- `tsc --noEmit`、Vite build、`debug check-production --production dist` 均自然 0。生产 API 和 URL 强行启用均被排除。Vite 只有现有大 chunk 提示，无构建错误。命令与源码身份见 `final-validation.json`，生产运行结果见 `production-summary.json`。
- 另一作者独立 fixture 的 Rust 4 项与 DOM 6 项通过由 root/独审单独归档；此目录不把作者检查冒称独审。

音视频播放在已授权真实附件节点上，只替换对应媒体元素的 OS 播放边界；录音使用已有固定合成 PCM 设备。它们证明菜单实际接到了生产控制器/元素，不宣称真实系统编解码或真实麦克风验收。

## 原失败与窄修

所有尝试自然退出和原始结果均保留，不用最终通过覆盖首失败。

1. `transport-test-precondition.log`：把既有 lean transport 当完整 test crate 的首尝试 101；它缺 session test 路径、文档 fixtures、rusqlite hooks，另外新测试 `.unwrap_err()` 对成功类型要求 Debug。改用既有完整产品 crate，不为 transport 新造测试架构。
2. `rust-product01.log`：完整 crate 第一次 101，sparse 缺既有 include_str fixtures，加上新测试 Debug 要求。仅补精确 fixtures，测试改 `.err().unwrap()`。
3. `rust-product02.log`：31 passed/1 failed/1 ignored；导出反例错误地把目标置于 Store 内，先触发现有保护返回 invalid。把测试目标放到单独临时目录后，`rust-product03.log` 为32 passed/1 ignored。
4. `dom01`—`dom03`：菜单 left/top 为空、落在视口外。原 runner `dispatchEvent("contextmenu", init)` 是缺坐标普通 Event，计算得到无效 CSS。产品增加非有限坐标按附件真实边界锚定，runner 显式构造 MouseEvent，原 8px 断言保持。
5. `dom04`—`dom05`：菜单/导出等已通过，导入正文末尾附件的 Undo 与最初 JSON 比较多一个标准空段落。`undo-document.json` 证明原所有节点/属性和原附件均恢复，差异仅既有 TipTap TrailingNode 补的段落。移除事务增加 closeHistory，独立新笔记选文件立即移除→Undo/Redo已按原精确预期通过。作者导入特例断言仍要求原完整 JSON 恢复，只允许既有插件这一精确 `{type:"paragraph"}` 尾段落，附件数和字节均保持。
6. `dom06`：35项通过，最后延迟 picker 中调用 debug/native `note.select` 被新增 native overlay gate 正确拒绝。改用真实笔记行点击，`dom07`43项通过；不放宽 native gate。

## 界面证据

图片深色菜单、音频菜单、信息面板与浅色文件菜单截图均来自固定合成数据。`display-attachment-file-menu-near-card.png` 另外使用复制的合成 Store，真实 Playwright 右键点击普通文件卡中心，菜单紧邻文件，无短 toast；`display-file-menu-crop.png` 是同图局部裁切，未生成或重绘内容。`display-result.json` 记录精确源哈希和实际菜单几何。
