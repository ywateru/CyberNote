# APP-003-TAGS-01 source candidate04

状态：**SOURCE-CANDIDATE / pending-review，尚非 SOURCE-READY**。日期 2026-11-04。基线 `6ce6033d845d15f1b45e074da9171db0c5ffb488`。本轮只修 [candidate03 正式独审 P2](../../../plan/reviews/app-003-tags-static-03.md)：真实浏览器引擎最终事务已完成，但先于观察器独立 end 监听到达，旧 postEndTransaction 未置位，导致失配编辑器结束后继续可写。该报告 SHA256 `1f8bc932f6e5d64413855ff672cf0782c8f45a2298eb72df0854001e4c6fba9d` 和独审03含 manifest 共17文件已从 root 保全目录独占复制，逐文件/报告字节与 manifest 核对一致。旧03候选、作者失败/通过和独审失败全部保留。

## 唯一产品修改

`src/tag-composition.ts` 把 postEndTransaction 改为 finishedTransaction。当前 cycle 中真实 PM transaction 到达时，只要实际 view.composing=false 就记录，不再附加“本监听已设置 finalText”的事件先后要求。浏览器可以在 PM end 处理触发的微任务中先完成实际标签清理事务，然后才执行观察器的另一个 end 监听。

释放仍须同时具备：实际 end 已观察、当前 PM 不 composing、真实完成事务已到达、映射原组合范围的实际文字等于 end.data、raw 与合法快照严格相等。事务事件后的观察微任务仍只等待实际 onUpdate/save 入口，不推测结束。end 先于不同最终候选文字时不提前释放；只有实际最终 input 后的范围文字匹配才停车。

App、Editor、note-tag-extension、搜索投影/停车、访问保护、saveDoc/queue/flush、文档相等、附件重绑、Rust 与依赖均保持 candidate03 原字节。无 timer、手改 composing、强制 DOM flush、伪造 end 或新派发最终事务，无改主线、GUI/ADB、下载、Rust/平台构建。

## 本轮验证

`check-tags-composition-retention.mjs` 挂载实际生产 App/Editor/扩展/保存队列/乐观状态/停车，**12 场景全部通过，共169条真实 Store action**。最终 typecheck 通过。唯有 preview action transport 接到精确既存 Rust Store CLI；访问事件 transport 调用实际 AccessGate.invalidate 与 App handler。合成笔记在隔离临时 Store，不包含用户数据。

新增场景精确执行独审失败序列：position3，Chrome CDP `Input.imeSetComposition("bian",4)`→`("变化",2)`→`Input.insertText("最终")`。实际 start/update/beforeinput/input 有 isTrusted=true，本Chrome的 end 有 data=`最终`但 isTrusted=false，完整事件保留。检查器额外观察实际事务和末端 end 监听，严格确认至少一个 composing=false 的真实事务发生在 end 监听之前；未修改观察器/PM字段，不使用强制事务。

引擎候选更新期间结果为空但原目标保持 composing、焦点、可写和同 DOM，合法实际 Store 文字完整。最终 `#独最终审 A` raw严格等于合法snapshot并存入Store，结果仍空，旧编辑器已hidden/inert/noneditable且失焦。随后实际键盘输入“禁止旧目标”和 `ENDED-ORDINARY` 均不能修改原 Store。首次即通过，无本轮夹具失败。

原11场景同时重跑通过：单标签与所有标签最后引用、最终输入先于end、end先于不同最终替换、多步替换、空最终删除、非空原选区恢复后的空data取消、多结果不跳转、普通无composition立即停车、显式其他笔记/清筛选，以及prepare同步冻结和abort无旧焦点复活。原02受控DOM序列的真实后续“续”仍保存至原ID，ACK前后raw与PM/DOM选区保持。

未受此单模块窄改影响的 candidate03 schema96/access16/OCR37/既有save-boundary11未重跑，不能算本轮执行；旧结果仍保留。`src-tauri` 相对首审 `96584b74…` 零diff。Store executable开闭SHA256均为 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，5,606,144 bytes，来源 `docs/verification/app-003-tags-independent-01/harness-main.rs`。没有编译。

## 证据与限制

`composition-run01-result.json` 保存12场景各阶段、实际事件/事务与169条动作响应；`raw` 保留合并输出与typecheck原始字节。typecheck结尾空行保全，差异检查排除原样raw与冻结独审证据。脚本及所有12产品文件逐文件/聚合/依赖hash在 `source-sha256.json`。每个浏览器/输出阶段检查空间>=2GiB，复用已有Vite缓存，不录截图或视频。

这是**浏览器引擎序列及受控DOM composition**，不是系统macOS/Android/iOS中文输入法验收；end的isTrusted=false限制明确保留。native IPC/Session、多窗口真实屏障、安装版冷启、实际平台键盘和原版像素对照仍UNKNOWN。当前仅开发自检通过，冻结后由不同作者重新独审，不能自行授SOURCE-READY。

复验时保持既有依赖与精确Store executable，先确认空间>=2GiB并使用新输出目录：

```sh
NOTES_TAG_STORE_BINARY=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target/debug/notes-qa-fix-store PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-tags-composition-retention.mjs artifacts/tags-composition04/new-review-run
```

12产品文件聚合SHA256：`438a0cc384eb015d274fe82cdc4223ae4de3ed96ad65dee073f2bc3597dc8e63`。相较candidate03唯一产品文件改动为 `tag-composition.ts`。
