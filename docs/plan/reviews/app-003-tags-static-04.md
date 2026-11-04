# APP-003-TAGS candidate04 独立源码审查

结论：**pass / SOURCE-READY（仅源码与列明浏览器/Store 边界）**。冻结候选 `37ee2bda6381bf5be76dedf6e4ef4fa89bd7f696` 关闭独审03的 P2：浏览器引擎完成事务先于单独 end 监听时，原失配 Editor 现在正常停车，结束后的普通文字不能再写入原目标。本轮没有发现新的 P1/P2/P3 finding。F17/APP-003 整体、安装版系统输入法、native IPC/Session 屏障及像素一致性仍未验收。

日期：2026-11-04；审查者 `/root/native_ui_research`，非候选作者。隔离审查树 `/private/tmp/apple-notes-tags-review01`，精确 detached HEAD 同上述候选。契约依据 root `4fc78b0ff7b58d77a1a28440c078814b3eec9729` 对应 `docs/architecture.md:82–84`、APP-003 标签任务及本地功能文档。相对03唯一产品改动为 `src/tag-composition.ts`，SHA256 `e81b2a519a803b4ecd5b58605832a823088aac448a4812674143e4ca6be79715`；12 产品文件聚合 `438a0cc384eb015d274fe82cdc4223ae4de3ed96ad65dee073f2bc3597dc8e63`，开闭独立核对一致。

## Findings 与源码判断

没有阻塞或新增非阻塞 finding。

`tag-composition.ts` 不再要求观察器自己的 end 监听已先设置 finalText，才承认同 cycle 中实际 PM 不 composing 时到达的 transaction。`finishedTransaction` 现在记录该真实事实，消除浏览器事件处理与微任务之间的顺序假设。实际 end 已收到、当前 PM 非 composing、真实结束事务已到达、最终范围文字等于 end.data、raw 严格等于合法保存表示五个完成条件仍全部保留。新 compositionstart 重置 cycle/范围/最终值/完成事实，销毁仍解除观察。没有新增 timer、DOM flush、强制事务、伪造 end、手改 composing、正文/选区重写或 focus 恢复。

App、Editor、note-tag-extension、SearchEditorHost/gate、投影/选择、saveDoc、queue、flush、document equality、附件重绑、访问保护及依赖均保持03字节。本轮不通过放宽外部非法正文或授权检查来关闭问题。对记录时机的窄改与架构局部输入保全契约一致。

## 独立生产 App → 实际 Store 验证

独立证据 `docs/verification/app-003-tags-independent-04/`。检查沿用上轮已审阅的作者服务/真实 App 挂载/transport scaffold，场景及只读 observer 查询由审查者独立编写；没有直接把作者12场景重跑结果当作独审。运行真实 App、NoteEditor、PM 扩展、onUpdate、saveEditorDoc/saveDoc、队列、乐观 workspace、停车和错误 UI。只将 preview action/access transport 接到已有真实 Store CLI；访问事件仍调用生产 AccessGate.invalidate 和 App handler。

结果：**独立12场景全部通过，159条实际 Store action，无 pageerror；pnpm typecheck exit0**。下表均为本轮实际执行。

| 场景 | 独立观察与断言 |
| --- | --- |
| 原02最后引用与活动续字 | 单标签内同步受控 compositionstart 插入“变”；合法 Store ACK 前后 raw、HTML、PM 和 DOM 选区相同，原 DOM/焦点/可写/composing 保留，目录与结果真实清空。实际键盘“续”进入原 ID 并保存；end 后正常停车，后续键盘不能写原目标。 |
| 原03浏览器引擎失败序列 | position3，CDP imeSetComposition bian→变化→insertText 最终。候选期间保持原目标且结果为空；最终 raw==合法 snapshot==实际 Store 文档，正文 `#独最终审 A`，PM composing=false，旧 Editor hidden/inert/noneditable/失焦。只读实际 observer pending=false、finishedTransaction=true、from3/to5、finalText/rangeText均“最终”。真实 ENDED-ORDINARY 及另一禁写文字均不改原 Store。 |
| 引擎非空选区取消 | 原 PM 非空范围2..4替换为“候选”，候选期间保留原输入目标；真实引擎取消后完成结束，按真实结果停车且不能写回旧目标。 |
| end 先于空最终删除 | end.data空时实际候选仍非空，不能提前停车；真实 Backspace 删除最终范围后保存 `# A`，再正常停车。 |
| end 先于不同最终 UTF-16 文本 | 先 end.data=`🧪é`（emoji加组合音符），原候选尚为“候”时继续保持目标；实际选区替换后最终原文完整保存并停车，范围按真实 PM mapping 处理。 |
| 多结果不跳笔记 | 所有标签筛选中原 A 失配，列表仅余 Other；组合期间原 A 仍保持焦点/可写，“续”仅保存至 A，Other 全文不变；结束后 A 停车。 |
| 显式选 Other 与旧 end | 活动组字时实际点击 Other，A 立即停车；真实新文字仅保存至 Other。再向旧 A 投递晚到 end，A 不复活，A/Other 的 Store 内容均不被旧事件改变。 |
| prepare/abort | prepare 调用内同步 editable=false，随后真实 cover；全页面可见文字不包含原受保护标签名。实际键盘不能写原 Store；abort 后旧失配目标仍 hidden/inert/noneditable且无焦点，旧标签名未恢复，晚到 end 不复活。 |
| 无组合普通失配 | 实际普通键入立即执行既有停车，composing=false，旧目标不能继续写。 |
| 非空原选区取消恢复 | 标签内部非空选区“独”→“候”→“独”，原合法匹配自然恢复；空 data end 不误删正文。之后普通失配仍立即停车，没有过期保留。 |
| 显式清标签筛选 | 真正清除筛选离开局部保留作用域，原笔记按普通目录合法可见可写；正常 end 完成，未发生产品重设焦点。 |
| 引擎替换光标前字符 | PM caret3，通过 CDP replacementStart1/replacementEnd2 替换前一个字符；实际 observer 正确捕获范围2..3，候选“改”期间保留，提交“终”后范围/最终值一致、pending=false并停车，禁写通过。 |

浏览器事件限制完整保留：CDP 引擎 start/update/beforeinput/input 有 isTrusted=true；本 Chrome 的 end.data为最终候选但 isTrusted=false。生产代码没有 isTrusted 分支。该引擎顺序与同步 JS dispatchEvent 的受控路径分别验证，不能将其称作系统原生中文输入法通过。空 data、非空原选区、候选替换、surrogate/组合音符和浏览器 replacement range 在本轮样本中没有产生范围/end.data 失配导致的滞留；这不证明所有平台 IME 范围信号均已覆盖。

只读状态来自同一生产 TagComposition 类原型的 CDP Runtime.queryObjects，不替换类或观察器；没有向其字段写入。完整请求/响应、各阶段 raw/合法正文/选区/事件/可写状态和源脚本保留于 composition-run01-result.json 与对应脚本。snapshot-consistency.json 仅对这些既有捕获内容做额外核对，没有制造新的浏览器结果。

## 身份、旧证据与执行边界

完整 src-tauri 相对首审 `96584b74d2356c361e897ed5ad275b15823c21a0` 零 diff；复用首审来源的精确既有 Store CLI，SHA256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`，5,606,144 bytes，开闭身份相同。没有 Rust 编译，身份确认后立即释放 host target。schema/access/OCR 与旧保存矩阵未受这次单模块窄改影响，本轮没有重复运行，也没有把作者或旧候选计数并入独审。

本轮首次执行即12场景全部通过，没有失败日志被改写。旧03的 run01 停车超时、run02错误trusted断言、run03阻塞复现仍完整保留；03报告+17文件在 checkout 前逐字对主线9e96668和冻结04核验一致，再整体移动到 `/private/tmp/apple-notes-tags-review03-frozen-preserved-01`，没有删除或覆盖，候选已跟踪副本仍保留。更早02证据也保持原保全目录。

每个浏览器/输出阶段均 guard>=2GiB；收尾 free 5,026,041,856 bytes。作者树clean，审查树 tracked diff空，产品与依赖开闭 hashes相同；自己的临时 node_modules 链接已核对目标后解除。无 GUI、ADB、设备、安装、原版 attach、Rust/平台构建、下载、升级或 target复制/清理。

本候选可交 root 做源码整合与后续受控构建。当前只有本项源码与列明浏览器/Store 边界 SOURCE-READY；系统 macOS/Android/iOS IME、native IPC/Session、多窗口真实屏障、安装版冷启、原版行为与像素一致性继续 UNKNOWN。
